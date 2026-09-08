import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULES, MODULE_MAP } from '../lib/physics/curriculum.js';
import { PROBLEMS, PROBLEM_STATS, problemsFor, gradeAnswer, parseNumber, pickProblems } from '../lib/physics/problems.js';
import { buildSystemPrompt } from '../lib/physics/tutorPrompt.js';

test('問題集: 構造が正しい（ID・単元・型・選択肢・解説）', () => {
  const ids = new Set();
  for (const p of PROBLEMS) {
    assert.ok(!ids.has(p.id), `重複ID ${p.id}`); ids.add(p.id);
    assert.ok(MODULE_MAP.has(p.module), `${p.id}: 単元 ${p.module} が無い`);
    assert.ok(p.id.startsWith(p.module + '-'), `${p.id}: IDが単元と一致しない`);
    assert.ok(['mc', 'numeric', 'short'].includes(p.type), `${p.id}: type`);
    assert.ok(['basic', 'standard', 'advanced'].includes(p.difficulty), `${p.id}: difficulty`);
    assert.ok(typeof p.question === 'string' && p.question.length >= 20, `${p.id}: 問題文が短い`);
    assert.ok(Array.isArray(p.solution) && p.solution.length >= 2, `${p.id}: 解説は2段階以上`);
    for (const st of p.solution) assert.ok(typeof st === 'string' && st.length >= 10, `${p.id}: 解説の段階が短い`);
    if (p.type === 'mc') {
      assert.ok(Array.isArray(p.choices) && p.choices.length >= 3 && p.choices.length <= 5, `${p.id}: 選択肢数`);
      assert.ok(Number.isInteger(p.answer) && p.answer >= 0 && p.answer < p.choices.length, `${p.id}: 正解添字`);
      assert.equal(new Set(p.choices).size, p.choices.length, `${p.id}: 選択肢が重複`);
    } else if (p.type === 'numeric') {
      assert.ok(typeof p.answer?.value === 'number' && Number.isFinite(p.answer.value), `${p.id}: 数値解答`);
      if (p.answer.tol !== undefined) assert.ok(p.answer.tol > 0 && p.answer.tol <= 0.1, `${p.id}: 許容誤差 ${p.answer.tol}`);
    } else {
      assert.ok(typeof p.answer === 'string' && p.answer.length >= 10, `${p.id}: 模範解答`);
    }
    // KaTeX の $ が閉じている
    for (const t of [p.question, ...(p.choices || []), ...p.solution, p.hint || '', p.misconception || '']) {
      assert.equal((t.match(/\$/g) || []).length % 2, 0, `${p.id}: $ が閉じていない: ${t.slice(0, 40)}`);
    }
  }
});

test('問題集: 網羅性（高校・量子系は各2問以上、他は1問以上）', () => {
  const missing = [];
  for (const m of MODULES) {
    const n = problemsFor(m.id).length;
    const need = m.level === 'hs' || m.track === 'qm' || m.track === 'qinfo' ? 2 : 1;
    if (n < need) missing.push(`${m.id}(${n}/${need})`);
  }
  assert.deepEqual(missing, [], `問題が不足: ${missing.join(', ')}`);
  assert.ok(PROBLEM_STATS.byType.mc > 0 && PROBLEM_STATS.byType.numeric > 0 && PROBLEM_STATS.byType.short > 0);
});

test('問題集: 単元IDの別名でも引ける', () => {
  assert.deepEqual(problemsFor('qm-phd-04').map((p) => p.id), problemsFor('qm-grad-09').map((p) => p.id));
});

test('採点: 数値の読み取り', () => {
  assert.equal(parseNumber('9.8'), 9.8);
  assert.equal(parseNumber('１．５'), 1.5);
  assert.equal(parseNumber('1,500'), 1500);
  assert.equal(parseNumber('1.5×10^3'), 1500);
  assert.equal(parseNumber('2e3'), 2000);
  assert.equal(parseNumber('10^-3'), 0.001);
  assert.equal(parseNumber('−3.2'), -3.2);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseNumber(''), null);
});

test('採点: 選択式・数値・記述', () => {
  const mc = { type: 'mc', choices: ['a', 'b', 'c'], answer: 1 };
  assert.equal(gradeAnswer(mc, 1).correct, true);
  assert.equal(gradeAnswer(mc, 0).correct, false);
  assert.equal(gradeAnswer(mc, 7).correct, false);
  const num = { type: 'numeric', answer: { value: 9.9, unit: 'm/s', tol: 0.02 } };
  assert.equal(gradeAnswer(num, '9.9').correct, true);
  assert.equal(gradeAnswer(num, '9.8').correct, true, '2%以内');
  assert.equal(gradeAnswer(num, '10.5').correct, false);
  assert.equal(gradeAnswer(num, 'x').correct, false);
  const abs = { type: 'numeric', answer: { value: 0, absTol: 0.01 } };
  assert.equal(gradeAnswer(abs, '0.005').correct, true, '0 は絶対許容で判定');
  assert.equal(gradeAnswer({ type: 'short', answer: '…' }, 'x'), null, '記述式は自己採点');
});

test('復習選択: 未正解・未着手を優先する', () => {
  const ids = MODULES.filter((m) => problemsFor(m.id).length >= 2).slice(0, 1).map((m) => m.id);
  const pool = problemsFor(ids[0]);
  const progress = { problems: { [pool[0].id]: { attempts: 3, correct: 3, lastCorrect: true } } };
  const picked = pickProblems(ids, progress, pool.length);
  assert.equal(picked.at(-1).id, pool[0].id, '正解済みは後ろに回る');
});

test('API検証: 問題IDは単元と一致していなければ拒否する', async () => {
  const { validateTutor, PhysicsApiError } = await import('../lib/physics/apiValidation.js');
  const p = PROBLEMS.find((x) => x.module === 'mech-hs-01');
  const other = MODULES.find((m) => m.id !== p.module && problemsFor(m.id).length);
  const base = { level: 'hs', messages: [{ role: 'user', content: 'x' }] };
  const ok = validateTutor({ ...base, moduleId: p.module, problemId: p.id });
  assert.equal(ok.problem.id, p.id);
  // 単元が食い違う組み合わせ
  assert.throws(() => validateTutor({ ...base, moduleId: other.id, problemId: p.id }), PhysicsApiError);
  // 単元を指定しないのに問題だけ指定
  assert.throws(() => validateTutor({ ...base, problemId: p.id }), PhysicsApiError);
  // 存在しない問題
  assert.throws(() => validateTutor({ ...base, moduleId: p.module, problemId: 'no-such-1' }), PhysicsApiError);
  // 問題を指定しなければ従来どおり通る
  assert.equal(validateTutor({ ...base, moduleId: p.module }).problem, null);
});

test('チューター: 問題の文脈がプロンプトに入る', () => {
  const p = PROBLEMS.find((x) => x.type === 'mc');
  const m = MODULE_MAP.get(p.module);
  const sys = buildSystemPrompt({ level: m.level, mode: 'socratic', module: m, problem: p });
  assert.ok(sys.includes(p.question));
  assert.ok(sys.includes(p.choices[p.answer]));
  assert.ok(sys.includes(p.solution[0]));
  assert.ok(sys.includes('同じ説明を繰り返さず'));
});
