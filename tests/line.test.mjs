// LINE チャネルとガイドページの結合テスト（LINE API・Claude は fetch をモック、DB はメモリ上の PGlite）
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

Object.assign(process.env, {
  PGLITE_DIR: 'memory',
  ANTHROPIC_API_KEY: 'test-key',
  LINE_CHANNEL_SECRET: 'line-secret',
  LINE_CHANNEL_ACCESS_TOKEN: 'line-token',
  PUBLIC_BASE_URL: 'https://andon.example',
  AUTO_PUBLISH: 'false',
});

const sent = [];
const llm = [];
let guideResponse = null;

function sse(text) {
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'm', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  return new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
}

globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes('api.line.me')) {
    sent.push({ path: url.split('/').pop(), body: JSON.parse(init.body) });
    return Response.json({});
  }
  if (url.includes('api.anthropic.com')) {
    const body = JSON.parse(init.body);
    llm.push(body);
    const prompt = body.messages[0].content;
    if (prompt.includes('ステップ配信')) {
      return sse(JSON.stringify({ steps: [
        { step: 0, text: '今日は寝る前にスマホを置く場所を決めてみて。', linkGuide: false },
        { step: 1, text: 'これで不眠が治る方法', linkGuide: false },
        { step: 2, text: '眠れない夜の考えごとの整理。詳しくはガイドにまとめました。', linkGuide: true },
        { step: 3, text: '話したくなったらいつでもここに書いてね。', linkGuide: false },
      ] }));
    }
    if (prompt.includes('ガイドページ')) return sse(JSON.stringify(guideResponse));
    return sse('それはしんどかったですね。');
  }
  throw new Error(`unexpected fetch ${url}`);
};

const { verifySignature } = await import('../lib/engine/channels/line.mjs');
const { handleLineEvent } = await import('../lib/engine/line-bot.mjs');
const { runJob } = await import('../lib/engine/jobs/index.mjs');
const { query } = await import('../lib/engine/db.mjs');
const { CRISIS_MESSAGE } = await import('../lib/engine/crisis.mjs');

const ctx = { systemPrompt: 'SYSTEM', aiDailyLimit: 2 };
const ev = (type, extra = {}) => ({ type, replyToken: 'rt', source: { userId: 'U1' }, ...extra });
const msg = (t) => ev('message', { message: { type: 'text', text: t } });
const lastReply = () => sent.filter((s) => s.path === 'reply').at(-1).body.messages[0];

test('署名検証', () => {
  const body = '{"events":[]}';
  const sig = crypto.createHmac('sha256', 'line-secret').update(body).digest('base64');
  assert.equal(verifySignature(body, sig), true);
  assert.equal(verifySignature(body + ' ', sig), false);
  assert.equal(verifySignature(body, 'short'), false);
  assert.equal(verifySignature(body, null), false);
});

test('友だち追加 → 悩みの選択肢 → 選ぶとガイドを案内', async () => {
  await handleLineEvent(ev('follow'), ctx);
  const first = lastReply();
  assert.equal(first.quickReply.items.length, 4);
  assert.equal(first.quickReply.items[0].action.data, 'segment=sleep');

  await handleLineEvent(ev('postback', { postback: { data: 'segment=sleep' } }), ctx);
  assert.match(lastReply().text, /https:\/\/andon\.example\/guide\/sleep/);
  assert.equal((await query(`select segment from line_users where user_id = 'U1'`))[0].segment, 'sleep');
});

test('危機的なメッセージには AI より先に相談窓口を返す', async () => {
  const before = llm.length;
  await handleLineEvent(msg('もう消えたい'), ctx);
  assert.equal(lastReply().text, CRISIS_MESSAGE);
  assert.equal(llm.length, before, 'AI は呼ばない');
});

test('自由文には AI が返答し、1日の上限で止まる', async () => {
  await handleLineEvent(msg('最近眠れない'), ctx);
  assert.equal(lastReply().text, 'それはしんどかったですね。');
  assert.match(llm.at(-1).system, /^SYSTEM[\s\S]*LINE での返答ルール/);
  await handleLineEvent(msg('仕事もつらい'), ctx);
  await handleLineEvent(msg('どうしたら'), ctx);
  assert.match(lastReply().text, /今日の AI 相談はここまで/);
});

test('ステップ配信: 生成 → 判定で止める → 承認済みだけ日数が来た人へ一括送信', async () => {
  let summary = await runJob('line-steps');
  assert.equal(summary.generated, 16, '4つの悩み × 4通');
  assert.equal(summary.sent, 0, '未承認は送らない');

  const flagged = await query(`select * from line_steps where segment = 'sleep' and status = 'flagged'`);
  assert.equal(flagged.length, 1);
  await query(`update line_steps set status = 'approved' where status = 'draft'`);
  await query(`update line_users set followed_at = now() - interval '2 days'`);

  summary = await runJob('line-steps');
  assert.equal(summary.sent, 1);
  const multicast = sent.filter((s) => s.path === 'multicast').at(-1).body;
  assert.deepEqual(multicast.to, ['U1']);
  assert.match(multicast.messages[0].text, /スマホを置く場所/);
  assert.doesNotMatch(multicast.messages[0].text, /https?:\/\/(?!andon\.example)/, '広告リンクは出さない');

  summary = await runJob('line-steps');
  assert.equal(summary.sent, 0, '同じ日に重ねて送らない');
});

test('ステップ配信: ブロックした人には送らない', async () => {
  await handleLineEvent(ev('unfollow'), ctx);
  await query(`update line_users set last_pushed_at = now() - interval '2 days', followed_at = now() - interval '30 days'`);
  const summary = await runJob('line-steps');
  assert.equal(summary.sent, 0);
});

test('ガイド: 候補外の商品IDや効能表現は flagged、問題なければ下書き', async () => {
  const [p] = await query(
    `insert into products (network, external_id, name, url, category, status, segment, channels)
     values ('rakuten', 'shop:1', '低反発まくら', 'https://hb.afl.rakuten.co.jp/1', '寝具', 'active', 'sleep', 'threads,guide') returning id`
  );
  const base = {
    title: '眠れない夜に', description: 'd', intro: 'i', selfCheck: ['夜中に目が覚める'],
    causes: [{ heading: 'h', body: 'b' }], tips: [{ heading: 'h', body: 'b' }], faq: [{ q: 'q', a: 'a' }],
  };
  guideResponse = { ...base, picks: [{ productId: 9999, heading: 'x', reason: 'r', fitFor: 'f' }], tips: [{ heading: 'h', body: 'これで不眠が治る' }] };
  let summary = await runJob('guides');
  assert.ok(summary.flagged.includes('sleep'));
  const g1 = (await query(`select * from guides where slug = 'sleep'`))[0];
  assert.ok(g1.compliance.issues.some((i) => i.includes('9999')));
  assert.ok(g1.compliance.issues.some((i) => i.includes('治る')));

  guideResponse = { ...base, picks: [{ productId: p.id, heading: '首に合う高さ', reason: '高さを調整できる', fitFor: '朝に首がこる人' }] };
  summary = await runJob('guides');
  assert.ok(summary.updated.includes('sleep'));
  const g2 = (await query(`select * from guides where slug = 'sleep'`))[0];
  assert.equal(g2.status, 'draft');
  const guidePrompt = llm.filter((c) => c.messages[0].content.includes('「眠り」に悩む')).at(-1).messages[0].content;
  assert.match(guidePrompt, new RegExp(`ID:${p.id} \\[rakuten\\] 低反発まくら`));

  await query(`update guides set status = 'published' where slug = 'sleep'`);
  guideResponse = { ...base, title: '書き換え', picks: [] };
  await runJob('guides');
  assert.equal((await query(`select title from guides where slug = 'sleep'`))[0].title, '眠れない夜に', '公開中は自動で書き換えない');
});
