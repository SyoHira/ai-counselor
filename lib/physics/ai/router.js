// 接続先の選択・上限チェック・失敗時の切り替え・使用量の記録をまとめる。
import { resolveProviders } from './providers.js';
import { loadSettings, readUsage, summarize, limitReason, recordUsage } from './store.js';
import { streamOpenAI, completeOpenAI } from './openaiCompat.js';
import { streamAnthropic, completeAnthropic } from './anthropicAdapter.js';
import { PhysicsApiError } from '../apiValidation.js';

export const PROVIDER_CHOICES = ['auto', 'gemini', 'openrouter', 'ollama', 'anthropic'];

/** 試す順に並べた接続先。使えるものが無ければ理由つきで例外にする。 */
export function planProviders(preferred = 'auto') {
  const settings = loadSettings();
  const providers = resolveProviders(settings);
  const usage = summarize(readUsage());
  if (preferred !== 'auto' && !providers[preferred].configured) {
    const p = providers[preferred];
    throw new PhysicsApiError(`${p.label} は未設定です。${p.hasCredential ? 'AI設定でモデルを選んでください。' : '.env.local にキーを設定してください。'}`, 503, 'PROVIDER_NOT_CONFIGURED');
  }
  const ids = preferred === 'auto' ? settings.order : [preferred];
  const list = [];
  const skipped = [];
  for (const id of ids) {
    const p = providers[id];
    if (!p.configured) continue;
    if (!p.enabled) { skipped.push(`${p.label}: 無効`); continue; }
    const reason = limitReason(p, usage[id]);
    if (reason) { skipped.push(`${p.label}: ${reason}`); continue; }
    list.push(p);
  }
  if (list.length) return list;
  if (!Object.values(providers).some(p => p.configured)) {
    throw new PhysicsApiError(
      'AIの接続先が設定されていません。.env.local に GEMINI_API_KEY・OPENROUTER_API_KEY・OLLAMA_MODEL・ANTHROPIC_API_KEY のいずれかを設定してください（詳しくは「AI設定」画面）。',
      503, 'API_KEY_NOT_CONFIGURED');
  }
  throw new PhysicsApiError(`使えるAIがありません。${skipped.join(' / ')}`, 429, 'LIMIT_REACHED');
}

const isAbort = e => e?.name === 'AbortError' || e?.name === 'APIUserAbortError';

function record(p, feature, started, result) {
  recordUsage({
    feature, provider: p.id, model: p.model, ms: Date.now() - started,
    ok: !result.error,
    ...(result.error ? { error: result.error.code || result.error.status || result.error.name || 'error' } : {}),
    inputTokens: result.usage?.inputTokens ?? null,
    outputTokens: result.usage?.outputTokens ?? null,
    // Ollama はローカルなので常に0円。その他は接続先が報告した額だけを記録する
    costUsd: p.id === 'ollama' ? 0 : result.usage?.costUsd ?? null,
  });
}

const incomplete = () => new PhysicsApiError('AIの応答が完了しませんでした。もう一度お試しください。', 502, 'INCOMPLETE_AI_RESPONSE');

/**
 * ストリーミング。本文を1文字も送る前の失敗なら次の接続先へ切り替える。
 * onEvent には {provider, model} / {phase:'thinking'} / {text} / {fallback} が渡る。
 */
export async function streamWithFallback(list, req, onEvent) {
  let lastError;
  for (const [i, p] of list.entries()) {
    const started = Date.now();
    let emitted = false, usage = null, finish = null, announced = false;
    try {
      const gen = p.kind === 'anthropic' ? streamAnthropic(p, req) : streamOpenAI(p, req);
      for await (const ev of gen) {
        if (ev.thinking && !announced) { announced = true; onEvent({ phase: 'thinking' }); }
        if (ev.text) {
          if (!emitted) { emitted = true; onEvent({ provider: p.id, label: p.label, model: p.model }); }
          onEvent({ text: ev.text });
        }
        if (ev.done) { finish = ev.finish; usage = ev.usage; }
      }
      if (!emitted || finish !== 'stop') throw incomplete();
      record(p, req.feature, started, { usage });
      return;
    } catch (error) {
      if (isAbort(error) || req.signal?.aborted) { record(p, req.feature, started, { usage, error: { code: 'CANCELLED' } }); throw error; }
      record(p, req.feature, started, { usage, error });
      lastError = error;
      if (emitted || i === list.length - 1) throw error;
      onEvent({ fallback: p.label });
    }
  }
  throw lastError;
}

/** 一括応答。validate が例外を投げたら（JSONが壊れている等）次の接続先で作り直す。 */
export async function completeWithFallback(list, req, validate) {
  let lastError;
  for (const [i, p] of list.entries()) {
    const started = Date.now();
    let usage = null;
    try {
      const out = p.kind === 'anthropic' ? await completeAnthropic(p, req) : await completeOpenAI(p, req);
      usage = out.usage;
      if (out.finish !== 'stop') throw incomplete();
      const value = validate(out.text);
      record(p, req.feature, started, { usage });
      return { value, by: { provider: p.id, label: p.label, model: p.model } };
    } catch (error) {
      if (isAbort(error) || req.signal?.aborted) throw error;
      record(p, req.feature, started, { usage, error });
      lastError = error;
      if (i === list.length - 1) throw error;
    }
  }
  throw lastError;
}
