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

test('高単価案件: カテゴリ別ルールと金額', () => {
  const base = { network: 'asp', experienced: false };
  assert.ok(ruleCheck('会社と交渉してくれる\n#PR', { ...base, category: '退職代行' }).some((i) => i.includes('退職代行')));
  assert.ok(ruleCheck('年収が必ず上がる\n#PR', { ...base, category: '転職エージェント' }).some((i) => i.includes('転職')));
  assert.ok(ruleCheck('必ず出会える\n#PR', { ...base, category: '婚活・結婚相談所' }).some((i) => i.includes('婚活')));
  assert.ok(ruleCheck('うつが改善する\n#PR', { ...base, category: 'オンラインカウンセリング' }).some((i) => i.includes('医療')));
  assert.ok(ruleCheck('初回3,000円\n#PR', { ...base, category: 'コーチング' }).some((i) => i.includes('金額')));
  assert.deepEqual(ruleCheck('話すだけで整理できることもある\n#PR', { ...base, category: 'オンラインカウンセリング' }), []);
  assert.ok(ruleCheck('気軽に始められる\n#PR', { ...base, category: 'マッチングアプリ' }).some((i) => i.includes('18歳未満')));
  assert.deepEqual(ruleCheck('気軽に始められる\n※18歳未満は利用できません\n#PR', { ...base, category: 'マッチングアプリ' }), []);
});
