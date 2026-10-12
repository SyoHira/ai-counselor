import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, MODULE_MAP } from '../lib/physics/curriculum.js';
import { EQUATION_MEANING } from '../lib/physics/equationMeaning.js';
import { CONNECTIONS, connectionsOf } from '../lib/physics/connections.js';
import { PHENOMENA, phenomenaFor, phenomenonModules } from '../lib/physics/phenomena.js';
import { buildSystemPrompt } from '../lib/physics/tutorPrompt.js';

const balanced = (t) => (t.match(/\$/g) || []).length % 2 === 0;

test('式の意味づけ: 全230本に「読み方」と「現実の例」がある', () => {
  let n = 0;
  for (const m of MODULES) {
    (m.equations || []).forEach((_, i) => {
      n++;
      const k = `${m.id}#${i}`;
      const x = EQUATION_MEANING[k];
      assert.ok(x, `${k} に意味づけが無い`);
      assert.ok(typeof x.reads === 'string' && x.reads.length >= 30, `${k} の reads が短い`);
      assert.ok(typeof x.example === 'string' && x.example.length >= 30, `${k} の example が短い`);
      assert.ok(balanced(x.reads) && balanced(x.example), `${k} の $ が閉じていない`);
    });
  }
  assert.equal(n, Object.keys(EQUATION_MEANING).length, '余分なキーがある');
});

test('つながり: 別領域どうし・重複なし・全単元に1本以上', () => {
  const seen = new Set();
  for (const c of CONNECTIONS) {
    const A = MODULE_MAP.get(c.a), B = MODULE_MAP.get(c.b);
    assert.ok(A && B, `${c.a} / ${c.b} が存在しない`);
    assert.notEqual(A.track, B.track, `${c.a} と ${c.b} は同じ領域`);
    const k = [c.a, c.b].sort().join('|');
    assert.ok(!seen.has(k), `重複 ${k}`); seen.add(k);
    assert.ok(c.why.length >= 40 && balanced(c.why), `${k} の説明`);
  }
  for (const m of MODULES) assert.ok(connectionsOf(m.id).length >= 1, `${m.id} につながりが無い`);
  // 双方向に引ける
  const c0 = CONNECTIONS[0];
  assert.ok(connectionsOf(c0.a).some((x) => x.module.id === c0.b));
  assert.ok(connectionsOf(c0.b).some((x) => x.module.id === c0.a));
  // 旧IDでも引ける
  assert.deepEqual(connectionsOf('qm-phd-04').map((x) => x.module.id), connectionsOf('qm-grad-09').map((x) => x.module.id));
});

test('現象: 単元が存在し、基礎→発展の順で、量子系を含む', () => {
  const order = { hs: 0, ug: 1, grad: 2, phd: 3 };
  const ids = new Set();
  for (const p of PHENOMENA) {
    assert.ok(!ids.has(p.id), `重複 ${p.id}`); ids.add(p.id);
    assert.ok(p.modules.length >= 3, `${p.id} の単元が少ない`);
    const mods = phenomenonModules(p);
    assert.equal(mods.length, p.modules.length, `${p.id} に存在しない単元`);
    assert.ok(order[mods[0].level] <= order[mods.at(-1).level], `${p.id} は基礎→発展の順でない`);
    assert.ok(p.story.length >= 60 && balanced(p.story) && balanced(p.title), `${p.id} の説明`);
  }
  const quantum = PHENOMENA.filter((p) => phenomenonModules(p).some((m) => m.track === 'qm' || m.track === 'qinfo'));
  assert.ok(quantum.length >= PHENOMENA.length / 2, '量子系に触れる現象が半数未満');
  assert.ok(phenomenaFor('qm-ug-08').length >= 2);
});

test('チューター: 式の読み方・つながり・現象がプロンプトに入る', () => {
  const m = MODULE_MAP.get('mech-hs-09');
  const sys = buildSystemPrompt({ level: 'hs', mode: 'intuition', module: m });
  assert.ok(sys.includes(EQUATION_MEANING['mech-hs-09#0'].example.slice(0, 20)));
  assert.ok(sys.includes('他分野とのつながり'));
  assert.ok(sys.includes('身近な現象'));
  assert.ok(sys.includes('現実のどの現象を支配しているか'));
});
