import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as tutor } from '../app/api/physics-tutor/route.js';
import { POST as problem } from '../app/api/physics-problem/route.js';
import { readTutorStream } from '../lib/physics/tutorStream.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 使用量の記録と設定はテストごとの一時ディレクトリへ。他の接続先のキーは無いものとする
process.env.AI_DATA_DIR = mkdtempSync(join(tmpdir(), 'physics-ai-'));
for (const k of ['GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'OLLAMA_MODEL', 'OLLAMA_BASE_URL', 'GEMINI_MODEL', 'OPENROUTER_MODEL', 'ANTHROPIC_MODEL']) delete process.env[k];

const request = body => new Request('http://localhost/api/physics', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const gradeInput = { action: 'grade', question: '1+1?', answer: '2', userAnswer: '3' };
const generated = { type: 'mc', id: 'duplicate', question: '1+1?', choices: ['2', '3'], answer: '2', explanation: '和は2です。', hint: '' };
const message = (content, stop = 'end_turn') => ({ id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5', content: [{ type: 'text', text: content }], stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });

function provider(t, handler) {
  const key = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-only-key';
  t.after(() => { if (key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = key; });
  t.mock.method(globalThis, 'fetch', handler);
}
const jsonProvider = (t, output, stop) => provider(t, async () => Response.json(message(JSON.stringify(output), stop)));

for (const [name, route, inputs] of [
  ['tutor', tutor, [null, [], {}, { messages: [null] }, { messages: [{ role: 'system', content: 'x' }] }, { messages: [{ role: 'user', content: 'x'.repeat(8001) }] }, { messages: [{ role: 'user', content: 'x' }], level: 'invalid' }]],
  ['problem', problem, [null, [], {}, { action: 'generate', moduleId: 'missing' }, { action: 'generate', count: 500 }, { ...gradeInput, userAnswer: {} }]],
]) {
  test(`${name}: malformed input is rejected before contacting the provider`, async t => {
    provider(t, () => { throw new Error('Unexpected provider call'); });
    for (const input of inputs) assert.equal((await route(request(input))).status, 400);
    const broken = new Request('http://localhost/api', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
    assert.equal((await route(broken)).status, 400);
  });
}

test('request bodies are bounded by actual bytes, including chunked uploads', async t => {
  provider(t, () => { throw new Error('Unexpected provider call'); });
  const oversized = request({ messages: [{ role: 'user', content: 'あ'.repeat(100000) }] });
  assert.equal((await tutor(oversized)).status, 413);
  const missingType = new Request('http://localhost', { method: 'POST', body: '{}' });
  assert.equal((await tutor(missingType)).status, 415);
});

test('both routes report missing credentials without making a provider request', async t => {
  provider(t, () => { throw new Error('Unexpected provider call'); });
  delete process.env.ANTHROPIC_API_KEY;
  for (const [route, input] of [[tutor, { messages: [{ role: 'user', content: 'hello' }] }], [problem, { action: 'generate' }]]) {
    const response = await route(request(input));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'API_KEY_NOT_CONFIGURED');
  }
});

test('generation validates choices and creates unique IDs independently of model IDs', async t => {
  jsonProvider(t, { problems: [generated, generated] });
  const response = await problem(request({ action: 'generate', count: 2 }));
  assert.equal(response.status, 200);
  const { problems } = await response.json();
  assert.equal(new Set(problems.map(p => p.id)).size, 2);
});

for (const output of [{ problems: [] }, { problems: [null] }, { problems: [{ ...generated, answer: 'absent' }] }, { problems: [{ ...generated, question: {} }] }]) {
  test(`invalid generated problems return 502: ${JSON.stringify(output)}`, async t => {
    jsonProvider(t, output);
    assert.equal((await problem(request({ action: 'generate', count: 1 }))).status, 502);
  });
}

test('grading preserves false as a boolean and rejects truthy strings', async t => {
  const output = { correct: false, score: 0, feedback: '計算を確認してください。' };
  jsonProvider(t, output);
  const response = await problem(request(gradeInput));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).correct, false);
  t.mock.method(globalThis, 'fetch', async () => Response.json(message(JSON.stringify({ ...output, correct: 'false' }))));
  assert.equal((await problem(request(gradeInput))).status, 502);
});

test('truncated AI JSON is rejected even if the partial output parses', async t => {
  jsonProvider(t, { correct: true, score: 100, feedback: 'ok' }, 'max_tokens');
  assert.equal((await problem(request(gradeInput))).status, 502);
});

function sse(text, stop = 'end_turn') {
  const events = [
    { type: 'message_start', message: { ...message(''), content: [], stop_reason: null } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 2 } },
    { type: 'message_stop' },
  ];
  return events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

test('tutor forwards text and a successful terminal event', async t => {
  provider(t, async () => new Response(sse('波動関数'), { headers: { 'content-type': 'text/event-stream' } }));
  const response = await tutor(request({ messages: [{ role: 'user', content: 'Explain' }] }));
  const events = [];
  await readTutorStream(response.body, e => events.push(e));
  assert.equal(events.find(e => e.text).text, '波動関数');
  assert.equal(events.at(-1).done, true);
});

test('tutor reports truncation instead of claiming completion', async t => {
  provider(t, async () => new Response(sse('partial', 'max_tokens'), { headers: { 'content-type': 'text/event-stream' } }));
  const response = await tutor(request({ messages: [{ role: 'user', content: 'Explain' }] }));
  const body = await response.text();
  assert.match(body, /INCOMPLETE_AI_RESPONSE/);
  assert.doesNotMatch(body, /"done":true/);
});

test('provider error details are not exposed in the tutor stream', async t => {
  provider(t, async () => Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'private diagnostic value' } }, { status: 400 }));
  const response = await tutor(request({ messages: [{ role: 'user', content: 'Explain' }] }));
  const body = await response.text();
  assert.match(body, /BAD_REQUEST/);
  assert.doesNotMatch(body, /private diagnostic value/);
});

test('cancelling the response aborts the upstream provider without writing to a closed stream', async t => {
  let upstreamSignal;
  let ready;
  const started = new Promise(resolve => { ready = resolve; });
  provider(t, async (_url, options) => {
    upstreamSignal = options.signal;
    ready();
    return new Response(new ReadableStream({ start(controller) {
      options.signal.addEventListener('abort', () => controller.close(), { once: true });
    } }), { headers: { 'content-type': 'text/event-stream' } });
  });
  const response = await tutor(request({ messages: [{ role: 'user', content: 'Explain' }] }));
  await started;
  await response.body.cancel();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(upstreamSignal.aborted, true);
});

test('client parser handles byte-split UTF-8 and rejects a silently interrupted response', async () => {
  const bytes = new TextEncoder().encode('data: {"text":"量子"}\r\n\r\ndata: {"done":true}\n\ndata: [DONE]\n\n');
  const stream = new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } });
  let text = '';
  await readTutorStream(stream, e => { text += e.text || ''; });
  assert.equal(text, '量子');
  await assert.rejects(readTutorStream(new Response('data: {"text":"partial"}\n\n').body, () => {}), /途切れ/);
});
