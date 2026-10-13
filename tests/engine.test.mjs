// エンジン全体の結合テスト。楽天API・Claude・Threads は fetch をモックし、DB はメモリ上の PGlite を使う
import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  PGLITE_DIR: 'memory',
  ANTHROPIC_API_KEY: 'test-key',
  RAKUTEN_APP_ID: 'app',
  THREADS_USER_ID: 'me',
  THREADS_ACCESS_TOKEN: 'tok',
  THREADS_PUBLISH_DELAY_MS: '0',
  AUTO_PUBLISH: 'true',
  PUBLIC_BASE_URL: 'https://andon.example',
  ACTIVE_PRODUCTS: '4',
  RAKUTEN_GENRES: '100938',
});

const calls = { llm: [], threads: [] };
let mediaSeq = 0;

function sse(json) {
  const text = JSON.stringify(json);
  const events = [
    ['message_start', { type: 'message_start', message: { id: 'msg', type: 'message', role: 'assistant', model: 'm', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } } }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 10 } }],
    ['message_stop', { type: 'message_stop' }],
  ];
  return new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  });
}

function fakeClaude(prompt) {
  if (prompt.includes('<candidates>')) {
    const ids = [...prompt.matchAll(/ID:(\d+)/g)].map((m) => Number(m[1]));
    return { picks: ids.slice(0, 6).map((id) => ({ id, painOneLiner: `悩み${id}`, category: '寝具', reason: 'r' })) };
  }
  if (prompt.includes('悩みを30個')) {
    return { pains: Array.from({ length: 30 }, (_, i) => ({ text: `夜に目が覚める${i}`, scene: '深夜', intensity: 3 })) };
  }
  if (prompt.includes('Threads投稿を作って')) {
    const pains = [...prompt.matchAll(/^\d+\. (.+?)（場面/gm)].map((m) => m[1]);
    return {
      posts: pains.map((p, i) => ({
        pain: p,
        hook: p,
        text: i === 0 ? `${p}\nこれで不眠が治る\n#PR` : `${p}\n選び方の話\nリンクはリプ欄に\n#PR`,
      })),
    };
  }
  if (prompt.includes('チェック担当')) {
    const n = (prompt.match(/^\[\d+\]$/gm) ?? []).length;
    return { results: Array.from({ length: n }, (_, index) => ({ index, ok: index !== 1, issues: index === 1 ? ['煽り'] : [] })) };
  }
  if (prompt.includes('週次データ')) return { headline: 'h', findings: ['f'], actions: ['a'] };
  throw new Error(`unexpected prompt: ${prompt.slice(0, 80)}`);
}

globalThis.fetch = async (input, init = {}) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes('api.anthropic.com')) {
    const body = JSON.parse(init.body);
    calls.llm.push(body);
    return sse(fakeClaude(body.messages[0].content));
  }
  if (url.includes('app.rakuten.co.jp')) {
    const Items = Array.from({ length: 12 }, (_, i) => ({
      rank: i + 1, itemCode: `shop:${i}`, itemName: `商品${i}`, itemPrice: 3000 + i * 300,
      affiliateUrl: `https://hb.afl.rakuten.co.jp/${i}`, shopName: 's', reviewAverage: 4.3, reviewCount: 100 + i, affiliateRate: 4,
    }));
    return Response.json({ Items });
  }
  if (url.includes('graph.threads.net')) {
    calls.threads.push({ url, body: init.body ? Object.fromEntries(new URLSearchParams(String(init.body))) : null });
    if (url.includes('/insights')) {
      return Response.json({ data: ['views', 'likes', 'replies', 'reposts', 'quotes', 'shares'].map((name) => ({ name, values: [{ value: name === 'views' ? 1200 : 7 }] })) });
    }
    return Response.json({ id: `m${++mediaSeq}` });
  }
  throw new Error(`unexpected fetch ${url}`);
};

const { runJob } = await import('../lib/engine/jobs/index.mjs');
const { query, getSetting } = await import('../lib/engine/db.mjs');

test('daily: 取得 → 選定 → 生成 → 判定 → 予約', async () => {
  const summary = await runJob('daily');
  assert.equal(summary.ingest.rakuten, 12);
  assert.equal(summary.portfolio.activated.length, 4);

  const active = await query(`select * from products where status = 'active'`);
  assert.equal(active.length, 4);
  assert.ok(active.every((p) => p.commission_rate === 0.04), '料率は API の値を使う');

  const byStatus = Object.fromEntries((await query('select status, count(*)::int as n from posts group by status')).map((r) => [r.status, r.n]));
  // 1本目はルール判定（「治る」）、2本目は AI 判定で flagged
  assert.equal(byStatus.flagged, 8);
  assert.ok(byStatus.scheduled > 0);
  const judgeCalls = calls.llm.filter((c) => c.messages[0].content.includes('チェック担当'));
  assert.ok(judgeCalls.every((c) => !c.messages[0].content.includes('不眠が治る')), 'ルールで落ちた投稿は AI 判定に送らない');

  // 1日あたり3本まで、同じ日に同じ商品は1回まで
  const perDay = await query(
    `select to_char(slot_at at time zone 'Asia/Tokyo', 'YYYY-MM-DD') as d, count(*)::int as n, count(distinct product_id)::int as products
     from posts where status = 'scheduled' group by 1`
  );
  assert.ok(perDay.every((r) => r.n <= 3 && r.n === r.products), JSON.stringify(perDay));

  const req = calls.llm[0];
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.output_config.format.type, 'json_schema');
});

test('publish: 時刻が来た投稿を出し、返信に計測リンクを付ける', async () => {
  const [post] = await query(`select id from posts where status = 'scheduled' order by slot_at limit 1`);
  await query(`update posts set slot_at = now() - interval '1 minute' where id = $1`, [post.id]);
  const summary = await runJob('publish');
  assert.equal(summary.published, 1);

  const row = (await query('select * from posts where id = $1', [post.id]))[0];
  assert.equal(row.status, 'published');
  const reply = calls.threads.find((c) => c.body?.reply_to_id === row.threads_media_id);
  assert.match(reply.body.text, new RegExp(`https://andon.example/go/${row.link_slug}`));
  assert.match(reply.body.text, /#PR$/);
});

test('publish: 3時間以上遅れた枠は出さずに戻す', async () => {
  const [post] = await query(`select id from posts where status = 'scheduled' order by slot_at limit 1`);
  await query(`update posts set slot_at = now() - interval '4 hours' where id = $1`, [post.id]);
  const summary = await runJob('publish');
  assert.equal(summary.requeued, 1);
  assert.equal((await query('select status from posts where id = $1', [post.id]))[0].status, 'approved');
});

test('metrics → report: 反応を取り込み、統計と要約を保存', async () => {
  const m = await runJob('metrics');
  assert.equal(m.updated, 1);
  const r = await runJob('report');
  assert.equal(r.narrative, true);
  const saved = await getSetting('last_report');
  assert.ok(saved.stats.products.length >= 4);
  assert.ok(saved.stats.hooks.length === 6);
});

test('portfolio: 十分な閲覧で負けが確定した商品は停止して補充', async () => {
  const products = await query(`select id from products where status = 'active' order by id`);
  // 1商品だけ極端に悪い実績を作る（他は CTR 2%、1つは 0%）
  for (const [i, p] of products.entries()) {
    const [post] = await query(
      `insert into posts (product_id, text, status, published_at, threads_media_id) values ($1, 'x #PR', 'published', now(), $2) returning id`,
      [p.id, `seed${i}`]
    );
    await query('insert into post_metrics (post_id, views) values ($1, 20000)', [post.id]);
    const clicks = i === 0 ? 0 : 400;
    if (clicks) {
      await query(
        `insert into clicks (slug, post_id, product_id) select 's', $1, $2 from generate_series(1, $3)`,
        [post.id, p.id, clicks]
      );
    }
  }
  const summary = await runJob('portfolio');
  assert.equal(summary.retired.length, 1);
  assert.equal(summary.activated.length, 1);
  const loser = (await query('select status from products where id = $1', [products[0].id]))[0];
  assert.equal(loser.status, 'retired');
  const leftovers = await query(`select count(*)::int as n from posts where product_id = $1 and status in ('approved','scheduled','draft')`, [products[0].id]);
  assert.equal(leftovers[0].n, 0);
});

test('job_runs に履歴が残る', async () => {
  const runs = await query('select job, status from job_runs');
  assert.ok(runs.length >= 6);
  assert.ok(runs.every((r) => r.status === 'ok'));
});
