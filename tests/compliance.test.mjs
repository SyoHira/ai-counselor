import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleCheck } from '../lib/engine/compliance.mjs';

const ok = '夜中に目が覚める\n選び方の話\nリンクはリプ欄に\n#PR';

test('問題の無い投稿は通る', () => {
  assert.deepEqual(ruleCheck(ok, { network: 'rakuten', experienced: false }), []);
});

test('#PR・文字数・効能・最上級・URL', () => {
  assert.ok(ruleCheck('本文だけ', { network: 'rakuten' }).some((i) => i.includes('#PR')));
  assert.ok(ruleCheck(`${'あ'.repeat(500)}\n#PR`, { network: 'rakuten' }).some((i) => i.includes('500')));
  assert.ok(ruleCheck('これで不眠が治る\n#PR', { network: 'rakuten' }).some((i) => i.includes('治る')));
  assert.ok(ruleCheck('最安で買える\n#PR', { network: 'rakuten' }).some((i) => i.includes('最安')));
  assert.ok(ruleCheck('https://example.com\n#PR', { network: 'rakuten' }).some((i) => i.includes('URL')));
});

test('体験表現は experienced の時だけ許可', () => {
  const text = '使ってみたら朝が楽\n#PR';
  assert.ok(ruleCheck(text, { network: 'rakuten', experienced: false }).length > 0);
  assert.deepEqual(ruleCheck(text, { network: 'rakuten', experienced: true }), []);
});

test('Amazon 商品は価格に触れない', () => {
  assert.ok(ruleCheck('3,980円で買える\n#PR', { network: 'amazon' }).some((i) => i.includes('価格')));
  assert.deepEqual(ruleCheck('3,980円で買える\n#PR', { network: 'rakuten' }), []);
});
