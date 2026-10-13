import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createThinkFilter, stripThink } from '../lib/physics/ai/thinkFilter.js';
import { normalizeSettings, validateSettingsUpdate, summarize, limitReason, readUsage, DEFAULT_SETTINGS } from '../lib/physics/ai/store.js';
import { resolveProviders } from '../lib/physics/ai/providers.js';
import { POST as tutor } from '../app/api/physics-tutor/route.js';
import { POST as problem } from '../app/api/physics-problem/route.js';
import { GET as aiState, POST as aiSave } from '../app/api/physics-ai/route.js';
import { readTutorStream } from '../lib/physics/tutorStream.js';

const KEYS = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'OLLAMA_MODEL', 'OLLAMA_BASE_URL', 'GEMINI_MODEL', 'OPENROUTER_MODEL', 'ANTHROPIC_MODEL'];

/** テストごとに新しい data ディレクトリと環境変数を用意する */
function setup(t, { env = {}, settings } = {}) {
  const saved = Object.fromEntries(KEYS.map(k => [k, process.env[k]]));
  const savedDir = process.env.AI_DATA_DIR;
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  process.env.AI_DATA_DIR = mkdtempSync(join(tmpdir(), 'physics-ai-'));
  if (settings) writeFileSync(join(process.env.AI_DATA_DIR, 'ai-settings.json'), JSON.stringify(settings));
  t.after(() => {
    for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
    if (savedDir === undefined) delete process.env.AI_DATA_DIR; else process.env.AI_DATA_DIR = savedDir;
  });
}

const request = body => new Request('http://localhost/api', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const sse = chunks => new Response(chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
const delta = content => ({ choices: [{ delta: { content }, finish_reason: null }] });
const finish = (reason = 'stop', usage) => ({ choices: [{ delta: {}, finish_reason: reason }], ...(usage ? { usage } : {}) });
const chat = (content, usage, reason = 'stop') => Response.json({ choices: [{ message: { content }, finish_reason: reason }], usage });
const generated = { problems: [{ type: 'mc', question: '1+1?', choices: ['2', '3'], answer: '2', explanation: '和は2。', hint: '' }] };

test('think タグはチャンク境界で分割されても本文から除かれる', () => {
  const f = createThinkFilter();
  const out = ['答えは', '<thi', 'nk>内部の', '推論</th', 'ink>', '2 です', '<'].map(c => f.push(c)).join('') + f.flush();
  assert.equal(out, '答えは2 です<');
  assert.equal(f.thinking, true);
  assert.equal(stripThink('<think>x</think>\n{"a":1}'), '{"a":1}');
});

test('設定は不正値を既定に戻し、更新は不正なら拒否する', () => {
  const s = normalizeSettings({ order: ['ollama', 'bogus'], providers: { gemini: { model: 'bad model!', dailyRequests: -1, enabled: false } } });
  assert.deepEqual(s.order, ['ollama', 'gemini', 'openrouter', 'anthropic']);
  assert.equal(s.providers.gemini.model, '');
  assert.equal(s.providers.gemini.dailyRequests, null);
  assert.equal(s.providers.gemini.enabled, false);
  const ok = structuredClone(DEFAULT_SETTINGS);
  ok.providers.openrouter.model = 'qwen/some-model:free';
  ok.providers.openrouter.monthlyUsd = 2.5;
  assert.equal(validateSettingsUpdate(ok).providers.openrouter.monthlyUsd, 2.5);
  for (const mutate of [s => { s.order = ['gemini']; }, s => { s.providers.gemini.dailyRequests = 1.5; }, s => { s.providers.gemini.model = 'x y'; }]) {
    const bad = structuredClone(DEFAULT_SETTINGS);
    mutate(bad);
    assert.throws(() => validateSettingsUpdate(bad));
  }
});

test('集計は今日・今月で区切り、上限判定に使える', () => {
  const now = new Date(2026, 9, 13, 12);
  const at = (d, h = 10) => new Date(2026, 9, d, h).toISOString();
  const entries = [
    { t: at(13), provider: 'openrouter', ok: true, inputTokens: 10, outputTokens: 5, costUsd: 0.4 },
    { t: at(12), provider: 'openrouter', ok: true, inputTokens: 1, outputTokens: 1, costUsd: 0.7 },
    { t: new Date(2026, 8, 30).toISOString(), provider: 'openrouter', ok: true, costUsd: 99 },
    { t: at(13), provider: 'gemini', ok: false },
  ];
  const s = summarize(entries, now);
  assert.equal(s.openrouter.todayRequests, 1);
  assert.equal(s.openrouter.monthRequests, 2);
  assert.ok(Math.abs(s.openrouter.monthCostUsd - 1.1) < 1e-9);
  assert.equal(s.gemini.monthErrors, 1);
  const p = resolveProviders(normalizeSettings({ providers: { openrouter: { monthlyUsd: 1 } } }), { OPENROUTER_API_KEY: 'k' }).openrouter;
  assert.match(limitReason(p, s.openrouter), /今月の上限/);
});

test('キーが無ければ設定方法を案内し、指定した接続先が未設定なら明示する', async t => {
  setup(t, { env: { OPENROUTER_API_KEY: 'k', OPENROUTER_MODEL: 'm' } });
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected provider call'); });
  const res = await tutor(request({ provider: 'gemini', messages: [{ role: 'user', content: 'hi' }] }));
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'PROVIDER_NOT_CONFIGURED');
  assert.equal((await tutor(request({ provider: 'nope', messages: [{ role: 'user', content: 'hi' }] }))).status, 400);
});

test('Gemini の OpenAI 互換ストリームを中継し、使用量を記録する', async t => {
  setup(t, { env: { GEMINI_API_KEY: 'g' }, settings: { providers: { gemini: { model: 'gemini-test' } } } });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body), auth: init.headers.Authorization });
    return sse([delta('<think>考え中</think>'), delta('運動量'), delta('保存'), finish('stop', { prompt_tokens: 120, completion_tokens: 30 })]);
  });
  const events = [];
  await readTutorStream((await tutor(request({ messages: [{ role: 'user', content: '説明して' }] }))).body, e => events.push(e));
  assert.equal(calls[0].url, 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
  assert.equal(calls[0].body.model, 'gemini-test');
  assert.equal(calls[0].body.messages[0].role, 'system');
  assert.equal(calls[0].auth, 'Bearer g');
  assert.equal(events.find(e => e.provider).provider, 'gemini');
  assert.ok(events.some(e => e.phase === 'thinking'));
  assert.equal(events.filter(e => e.text).map(e => e.text).join(''), '運動量保存');
  assert.equal(events.at(-1).done, true);
  const [log] = readUsage();
  assert.deepEqual([log.provider, log.model, log.feature, log.ok, log.inputTokens, log.outputTokens, log.costUsd], ['gemini', 'gemini-test', 'tutor', true, 120, 30, null]);
});

test('本文を送る前の失敗（無料枠の429など）は次の接続先へ切り替える', async t => {
  setup(t, { env: { GEMINI_API_KEY: 'g', GEMINI_MODEL: 'gm', OPENROUTER_API_KEY: 'o', OPENROUTER_MODEL: 'om' } });
  t.mock.method(globalThis, 'fetch', async url => String(url).includes('googleapis')
    ? new Response('{"error":"quota"}', { status: 429 })
    : sse([delta('答え'), finish('stop', { prompt_tokens: 5, completion_tokens: 2, cost: 0.0012 })]));
  const events = [];
  await readTutorStream((await tutor(request({ messages: [{ role: 'user', content: 'q' }] }))).body, e => events.push(e));
  assert.ok(events.some(e => e.fallback === 'Google Gemini'));
  assert.equal(events.find(e => e.provider).provider, 'openrouter');
  const log = readUsage();
  assert.deepEqual(log.map(e => [e.provider, e.ok, e.error ?? null]), [['gemini', false, 429], ['openrouter', true, null]]);
  assert.equal(log[1].costUsd, 0.0012);
});

test('上限に達した接続先は呼ばずに飛ばし、全て使えなければ理由を返す', async t => {
  setup(t, { env: { GEMINI_API_KEY: 'g', GEMINI_MODEL: 'gm' }, settings: { providers: { gemini: { dailyRequests: 0 } } } });
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected provider call'); });
  const res = await problem(request({ action: 'generate', count: 1 }));
  assert.equal(res.status, 429);
  const body = await res.json();
  assert.equal(body.error, 'LIMIT_REACHED');
  assert.match(body.message, /今日の上限 0 回/);
});

test('問題生成はJSONが壊れていたら次の接続先で作り直し、どのモデルが作ったかを返す', async t => {
  setup(t, { env: { OPENROUTER_API_KEY: 'o', OPENROUTER_MODEL: 'om', OLLAMA_MODEL: 'qwen-local' }, settings: { order: ['openrouter', 'ollama', 'gemini', 'anthropic'] } });
  const urls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(String(url));
    return String(url).includes('openrouter') ? chat('ごめんなさい、JSONは出せません') : chat(`<think>設計</think>${JSON.stringify(generated)}`, { prompt_tokens: 50, completion_tokens: 80 });
  });
  const res = await problem(request({ action: 'generate', count: 1 }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.problems.length, 1);
  assert.deepEqual(body.by, { provider: 'ollama', label: 'Ollama（ローカル）', model: 'qwen-local' });
  assert.equal(urls[1], 'http://localhost:11434/v1/chat/completions');
  const log = readUsage();
  assert.deepEqual(log.map(e => [e.provider, e.ok, e.error]), [['openrouter', false, 'INVALID_AI_RESPONSE'], ['ollama', true, undefined]]);
  assert.equal(log[1].costUsd, 0);
});

test('Ollama に接続できないときは起動を促す', async t => {
  setup(t, { env: { OLLAMA_MODEL: 'qwen-local' } });
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('fetch failed'); });
  const res = await problem(request({ action: 'grade', question: 'q', answer: 'a', userAnswer: 'b' }));
  assert.equal(res.status, 503);
  assert.match((await res.json()).message, /Ollama/);
});

test('設定APIはキーを返さず、保存した上限が状態に反映される', async t => {
  setup(t, { env: { OPENROUTER_API_KEY: 'secret-key' } });
  const before = await (await aiState()).json();
  assert.doesNotMatch(JSON.stringify(before), /secret-key/);
  assert.equal(before.providers.find(p => p.id === 'openrouter').configured, false);
  const next = structuredClone(before.settings);
  next.providers.openrouter.model = 'deepseek/x:free';
  next.providers.openrouter.monthlyUsd = 3;
  const after = await (await aiSave(request(next))).json();
  const or = after.providers.find(p => p.id === 'openrouter');
  assert.equal(or.configured, true);
  assert.equal(or.limits.monthlyUsd, 3);
  assert.equal((await aiSave(request({ ...next, order: [] }))).status, 400);
});
