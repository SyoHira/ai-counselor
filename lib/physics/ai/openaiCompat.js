// OpenAI 互換の Chat Completions（Gemini / OpenRouter / Ollama 共通）
import { ProviderError } from './errors.js';
import { createThinkFilter, stripThink } from './thinkFilter.js';

function headers(p) {
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` };
  if (p.id === 'openrouter') { h['HTTP-Referer'] = 'http://localhost:3000'; h['X-Title'] = 'Physics Learning'; }
  return h;
}

// max_tokens はモデルごとの上限（8k〜64k）を超えると 400 になるので送らず、各社の既定（通常はモデルの上限）に任せる。
// 打ち切りは finish_reason === 'length' で検出する。
function body(p, { system, messages }, stream) {
  const b = { model: p.model, messages: [{ role: 'system', content: system }, ...messages], stream };
  if (stream) b.stream_options = { include_usage: true };
  if (p.id === 'openrouter') b.usage = { include: true };
  return b;
}

function usageOf(u) {
  if (!u) return null;
  return {
    inputTokens: u.prompt_tokens ?? null,
    outputTokens: u.completion_tokens ?? null,
    costUsd: typeof u.cost === 'number' ? u.cost : null,
  };
}

async function post(p, payload, signal) {
  let res;
  try {
    res = await fetch(`${p.baseUrl}/chat/completions`, { method: 'POST', headers: headers(p), body: JSON.stringify(payload), signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ProviderError(0, p.id);
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new ProviderError(res.status, p.id);
  }
  return res;
}

/** テキスト断片を {text} / {thinking} として流し、最後に {done, finish, usage} を返す */
export async function* streamOpenAI(p, req) {
  const res = await post(p, body(p, req, true), req.signal);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const filter = createThinkFilter();
  let buffer = '', finish = null, usage = null, announced = false;
  const handle = function* (json) {
    if (json.error) throw new ProviderError(502, p.id);
    if (json.usage) usage = usageOf(json.usage);
    const choice = json.choices?.[0];
    if (!choice) return;
    if (choice.finish_reason) finish = choice.finish_reason;
    const delta = choice.delta || {};
    if ((delta.reasoning || delta.reasoning_content) && !announced) { announced = true; yield { thinking: true }; }
    if (typeof delta.content === 'string' && delta.content) {
      const text = filter.push(delta.content);
      if (filter.thinking && !announced) { announced = true; yield { thinking: true }; }
      if (text) yield { text };
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.search(/\r?\n/)) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(buffer[nl] === '\r' ? nl + 2 : nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        let json;
        try { json = JSON.parse(data); } catch { continue; }
        yield* handle(json);
      }
    }
  } finally {
    reader.releaseLock();
  }
  const rest = filter.flush();
  if (rest) yield { text: rest };
  yield { done: true, finish: finish === 'stop' ? 'stop' : finish || 'unknown', usage };
}

export async function completeOpenAI(p, req) {
  const res = await post(p, body(p, req, false), req.signal);
  const json = await res.json().catch(() => null);
  const choice = json?.choices?.[0];
  if (!choice) throw new ProviderError(502, p.id);
  return {
    text: stripThink(choice.message?.content || ''),
    finish: choice.finish_reason === 'stop' ? 'stop' : choice.finish_reason || 'unknown',
    usage: usageOf(json.usage),
  };
}

export async function listOpenAIModels(p, signal) {
  const res = await fetch(`${p.baseUrl}/models`, { headers: headers(p), signal }).catch(() => { throw new ProviderError(0, p.id); });
  if (!res.ok) throw new ProviderError(res.status, p.id);
  const json = await res.json();
  return (json.data || []).map(m => {
    const id = String(m.id || '').replace(/^models\//, '');
    const free = m.pricing ? Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0 : null;
    return { id, name: m.name || id, free, context: m.context_length ?? null };
  }).filter(m => m.id);
}
