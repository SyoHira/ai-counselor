import test from 'node:test';
import assert from 'node:assert/strict';

import { StateVector, basisLabel, mulberry32 } from '../lib/quantum/statevector.js';
import { M, Rx, Ry, Rz } from '../lib/quantum/gates.js';
import { simulate, runShots, topBasis } from '../lib/quantum/circuit.js';
import { PRESETS, getPreset } from '../lib/quantum/presets.js';
import {
  makeGrid, buildPotential, solveEigenstates,
  infiniteWellEnergy, harmonicEnergy, barrierTransmission,
} from '../lib/quantum/schrodinger.js';
import { gaussianPacket, makePropagator, step, probabilityIn, positionStats, fft } from '../lib/quantum/evolution.js';
import { applyGate, measureProbs, purity, phaseDamping, vonNeumannEntropy } from '../lib/quantum/qubit1.js';
import { MODULES, MODULE_MAP, STATS } from '../lib/physics/curriculum.js';

const close = (a, b, tol = 1e-9, msg = '') =>
  assert.ok(Math.abs(a - b) < tol, `${msg} expected ${b}, got ${a} (tol ${tol})`);

test('状態ベクトル: ゲートはノルムを保つ', () => {
  const s = new StateVector(3);
  s.applyGate(M.H, 0);
  s.applyGate(M.T, 1);
  s.applyGate(Ry(0.7), 2);
  s.applyGate(M.X, 2, [0, 1]);
  s.applySwap(0, 2);
  close(s.norm(), 1, 1e-12, 'ノルム');
});

test('状態ベクトル: X, H, Z の基本作用', () => {
  const s = new StateVector(1);
  s.applyGate(M.X, 0);
  close(s.probabilities()[1], 1, 1e-12, 'X|0> = |1>');
  s.applyGate(M.H, 0);
  close(s.bloch(0).x, -1, 1e-12, 'HX|0> = |->');
});

test('状態ベクトル: Rx(π) は X と等価（大域位相を除く）', () => {
  const a = new StateVector(1).applyGate(Rx(Math.PI), 0);
  const b = new StateVector(1).applyGate(M.X, 0);
  close(a.probabilities()[1], b.probabilities()[1], 1e-12);
});

test('Bell状態: 確率とエンタングルメント・エントロピー', () => {
  const { state, steps } = simulate(getPreset('bell').circuit);
  const p = steps[steps.length - 1].probabilities;
  close(p[0], 0.5, 1e-12, '|00>');
  close(p[3], 0.5, 1e-12, '|11>');
  close(p[1], 0, 1e-12, '|01>');
  close(state.entropy(0), 1, 1e-12, 'S(q0) = 1 bit');
  close(state.bloch(0).r, 0, 1e-12, '縮約状態は完全混合');
});

test('GHZ状態は3体で相関する', () => {
  const { state } = simulate(getPreset('ghz').circuit);
  const p = state.probabilities();
  close(p[0], 0.5, 1e-12);
  close(p[7], 0.5, 1e-12);
});

test('W状態は各成分1/3', () => {
  const { state } = simulate(getPreset('w').circuit);
  const p = state.probabilities();
  for (const i of [1, 2, 4]) close(p[i], 1 / 3, 1e-9, `basis ${basisLabel(i, 3)}`);
});

test('Grover 2量子ビットは確率1で |11> を出す', () => {
  const { state } = simulate(getPreset('grover2').circuit);
  close(state.probabilities()[3], 1, 1e-12);
});

test('Grover 3量子ビット2反復は理論値 sin²(5θ) に一致する', () => {
  const { state } = simulate(getPreset('grover3').circuit);
  const theta = Math.asin(1 / Math.sqrt(8));
  const expected = Math.sin(5 * theta) ** 2;
  close(state.probabilities()[5], expected, 1e-9, '|101>');
});

test('テレポーテーションは状態を q0 から q2 へ移す', () => {
  const { state } = simulate(getPreset('teleport').circuit);
  const b = state.bloch(2);
  close(b.x, Math.sin(Math.PI / 3), 1e-9, 'x成分');
  close(b.z, Math.cos(Math.PI / 3), 1e-9, 'z成分');
  close(b.r, 1, 1e-9, '純粋状態として届く');
});

test('Deutsch–Jozsa は均衡関数で必ず1を返す', () => {
  const rng = mulberry32(7);
  const { counts } = runShots(getPreset('deutsch').circuit, 200, rng);
  assert.equal(counts['1'], 200);
});

test('ショット統計は理論確率に収束する', () => {
  const rng = mulberry32(12345);
  const { counts } = runShots(getPreset('bell').circuit, 4000, rng);
  close(counts['00'] / 4000, 0.5, 0.03);
  close(counts['11'] / 4000, 0.5, 0.03);
  assert.equal(counts['01'], undefined);
});

test('すべてのプリセットが規格化された状態を返す', () => {
  for (const p of PRESETS) {
    const { state } = simulate(getPreset(p.id).circuit);
    close(state.norm(), 1, 1e-9, p.id);
  }
});

test('固有値ソルバ: 調和振動子は (n+1/2)ħω', () => {
  const grid = makeGrid(400, -8, 8);
  const V = buildPotential('harmonic', { omega: 1 }, grid);
  const { energies } = solveEigenstates(V, grid, { count: 5 });
  for (let n = 0; n < 5; n++) close(energies[n], harmonicEnergy(n, 1), 5e-3, `E${n}`);
});

test('固有値ソルバ: 無限井戸は n²π²/2L²', () => {
  const grid = makeGrid(400, 0, 1);
  const V = buildPotential('well', {}, grid);
  const { energies, states } = solveEigenstates(V, grid, { count: 4 });
  for (let n = 0; n < 4; n++) {
    const rel = Math.abs(energies[n] - infiniteWellEnergy(n + 1, 1)) / infiniteWellEnergy(n + 1, 1);
    assert.ok(rel < 2e-3, `E${n} 相対誤差 ${rel}`);
  }
  // 規格化 ∫|ψ|²dx = 1
  const norm = states[0].reduce((a, v) => a + v * v, 0) * grid.dx;
  close(norm, 1, 1e-9, '規格化');
});

test('矩形障壁の透過率は既知の極限を満たす', () => {
  close(barrierTransmission(5, 0, 1), 1, 1e-12, '障壁なしなら T=1');
  assert.ok(barrierTransmission(1, 20, 2) < 1e-4, '厚く高い障壁ではほぼ透過しない');
  // E > V0 での共鳴透過: k2 a = π のとき T = 1
  const V0 = 4, a = 2;
  const E = V0 + (Math.PI / a) ** 2 / 2;
  close(barrierTransmission(E, V0, a), 1, 1e-9, '共鳴透過');
});

test('FFTは往復して元に戻る', () => {
  const n = 64;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) { re[i] = Math.sin(i); im[i] = Math.cos(i / 3); }
  const re0 = Float64Array.from(re);
  fft(re, im, -1);
  fft(re, im, +1);
  for (let i = 0; i < n; i++) close(re[i] / n, re0[i], 1e-10, `index ${i}`);
});

test('split-operator は規格化を保存し、平面波の透過率に近い値を出す', () => {
  const N = 1024, L = 120;
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = -L / 2 + (L * i) / N;
  const V0 = 5, a = 1;
  const V = new Float64Array(N);
  for (let i = 0; i < N; i++) V[i] = Math.abs(x[i]) < a / 2 ? V0 : 0;
  const k0 = 3;
  const { re, im } = gaussianPacket(x, { x0: -20, sigma: 3, k0 });
  const prop = makePropagator(x, V, 0.01);
  for (let s = 0; s < 1400; s++) step(re, im, prop);
  const stats = positionStats(x, re, im);
  close(stats.norm, 1, 1e-6, '確率保存');
  const T = probabilityIn(x, re, im, a / 2, L / 2);
  const analytic = barrierTransmission((k0 * k0) / 2, V0, a);
  assert.ok(Math.abs(T - analytic) < 0.05, `波束 T=${T} と平面波 T=${analytic} が近い`);
});

test('1量子ビット: ユニタリは純度を保ち、位相緩和は壊す', () => {
  let r = { x: 0, y: 0, z: 1 };
  r = applyGate(r, 'H');
  close(r.x, 1, 1e-12, 'H|0> = |+>');
  close(purity(r), 1, 1e-12, '純粋なまま');
  const [p0] = measureProbs(r, [0, 0, 1]);
  close(p0, 0.5, 1e-12, 'Z基底では50%');
  const dephased = phaseDamping(r, 1);
  close(vonNeumannEntropy(dephased), 1, 1e-12, '完全にデコヒーレンスすると1bit');
});

test('カリキュラム: IDが一意で前提がすべて解決できる', () => {
  const ids = MODULES.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'ID重複なし');
  for (const m of MODULES) {
    for (const p of m.prereqs || []) {
      assert.ok(MODULE_MAP.has(p), `${m.id} の前提 ${p} が存在しない`);
    }
    assert.ok(m.goals?.length >= 1, `${m.id} に到達目標がない`);
    assert.ok(['hs', 'ug', 'grad', 'phd'].includes(m.level), `${m.id} のレベルが不正`);
  }
});

test('カリキュラム: 前提関係に循環がない', () => {
  const state = new Map();
  const visit = (id, stack) => {
    if (state.get(id) === 'done') return;
    assert.ok(!stack.has(id), `循環参照: ${[...stack, id].join(' -> ')}`);
    stack.add(id);
    for (const p of MODULE_MAP.get(id)?.prereqs || []) visit(p, stack);
    stack.delete(id);
    state.set(id, 'done');
  };
  for (const m of MODULES) visit(m.id, new Set());
});

test('カリキュラム: 量子系が全体の3割以上を占める', () => {
  const q = STATS.byTrack.qm + STATS.byTrack.qinfo;
  assert.ok(q / STATS.total >= 0.3, `量子系 ${q}/${STATS.total}`);
});

test('カリキュラム: 前提に段階の逆転がない（上の段階を前提にしない）', () => {
  const order = { hs: 0, ug: 1, grad: 2, phd: 3 };
  for (const m of MODULES) {
    for (const p of m.prereqs || []) {
      const pm = MODULE_MAP.get(p);
      assert.ok(
        order[pm.level] <= order[m.level],
        `${m.id}(${m.level}) が上の段階の ${pm.id}(${pm.level}) を前提にしている`
      );
    }
  }
});

test('カリキュラム: IDに埋め込んだ段階と level が一致する', () => {
  for (const m of MODULES) {
    assert.ok(m.id.includes(`-${m.level}-`), `${m.id} の level は ${m.level}`);
  }
});

test('カリキュラム: ラボの紐付けが実在するラボを指す', () => {
  const known = new Set(['circuit', 'bloch', 'well', 'tunnel', 'math']);
  for (const m of MODULES) {
    for (const l of m.labs || []) assert.ok(known.has(l), `${m.id} が未知のラボ ${l} を指している`);
  }
});

test('カリキュラム: 高校の全単元に 物理基礎／物理 の区分がある', () => {
  const hs = MODULES.filter((m) => m.level === 'hs');
  assert.ok(hs.length >= 30, `高校の単元数 ${hs.length}`);
  for (const m of hs) {
    assert.ok(['物理基礎', '物理'].includes(m.course), `${m.id} の course が不正: ${m.course}`);
  }
});

test('カリキュラム: 高校で主要分野が網羅されている', () => {
  const hs = MODULES.filter((m) => m.level === 'hs');
  const byTrack = {};
  for (const m of hs) byTrack[m.track] = (byTrack[m.track] || 0) + 1;
  for (const t of ['mech', 'em', 'thermo', 'wave', 'qm', 'part', 'exp', 'math']) {
    assert.ok(byTrack[t] >= 1, `高校に ${t} の単元がない`);
  }
  assert.ok(byTrack.mech >= 8, `力学が ${byTrack.mech} 単元しかない`);
  assert.ok(byTrack.em >= 6, `電磁気が ${byTrack.em} 単元しかない`);
});

test('カリキュラム: 物理数学が4段階すべてに用意されている', () => {
  const math = MODULES.filter((m) => m.track === 'math');
  const byLevel = {};
  for (const m of math) byLevel[m.level] = (byLevel[m.level] || 0) + 1;
  for (const lv of ['hs', 'ug', 'grad', 'phd']) {
    assert.ok(byLevel[lv] >= 2, `${lv} の物理数学が ${byLevel[lv] || 0} 単元しかない`);
  }
  assert.ok(math.length >= 20, `物理数学が ${math.length} 単元`);
});

test('カリキュラム: 全単元にイメージでの説明がある', () => {
  for (const m of MODULES) {
    assert.ok(typeof m.intuition === 'string', `${m.id} に intuition がない`);
    assert.ok(m.intuition.length >= 40, `${m.id} の intuition が短すぎる (${m.intuition.length}文字)`);
    assert.ok(m.intuition.length <= 400, `${m.id} の intuition が長すぎる (${m.intuition.length}文字)`);
    assert.ok(m.intuition !== m.summary, `${m.id} の intuition が summary と同じ`);
  }
});

// ── 物理数学ビジュアライザの計算 ──────────────────────
test('ベクトル場: 数値微分の発散・回転が解析値と一致する', async () => {
  const { VECTOR_FIELDS, divCurlNumeric } = await import('../lib/physics/mathviz.js');
  for (const [name, f] of Object.entries(VECTOR_FIELDS)) {
    for (const [x, y] of [[0.7, -0.4], [1.3, 0.9], [-0.5, 1.1]]) {
      const { div, curl } = divCurlNumeric(f.fn, x, y);
      close(div, f.div(), 2e-3, `${name} の発散 at (${x},${y})`);
      close(curl, f.curl(), 2e-3, `${name} の回転 at (${x},${y})`);
    }
  }
});

test('2次元のクーロン場: 流束は半径によらず 2π（Gaussの法則）', async () => {
  const { VECTOR_FIELDS } = await import('../lib/physics/mathviz.js');
  const f = VECTOR_FIELDS.coulomb2d.fn;
  for (const R of [0.4, 1, 2.5]) {
    let flux = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const t = (2 * Math.PI * i) / N;
      const [u, v] = f(R * Math.cos(t), R * Math.sin(t));
      flux += (u * Math.cos(t) + v * Math.sin(t)) * R * ((2 * Math.PI) / N);
    }
    close(flux, 2 * Math.PI, 1e-6, `半径 ${R} の流束`);
  }
});

test('フーリエ級数: 項を増やすと誤差が単調に減る', async () => {
  const { WAVEFORMS, fourierError, fourierPartialSum } = await import('../lib/physics/mathviz.js');
  for (const w of Object.values(WAVEFORMS)) {
    let prev = Infinity;
    for (const N of [1, 3, 5, 11, 25, 51]) {
      const e = fourierError(w, N);
      assert.ok(e < prev, `${w.label}: N=${N} で誤差が増えた`);
      prev = e;
    }
  }
  // Gibbs現象：行き過ぎは「跳びの高さ」の約8.95%。この波は跳びが2なので peak ≈ 1 + 0.0895*2 ≈ 1.179
  const peak = Math.max(...Array.from({ length: 800 }, (_, i) =>
    fourierPartialSum(WAVEFORMS.square, 0.001 + (i * 0.4) / 800, 101)));
  const overshoot = (peak - 1) / 2; // 跳び（=2）に対する割合
  assert.ok(overshoot > 0.085 && overshoot < 0.095, `Gibbsの行き過ぎ ${(overshoot * 100).toFixed(2)}% (peak=${peak.toFixed(4)})`);
});

test('2×2行列の固有値・固有ベクトル', async () => {
  const { eigen2x2 } = await import('../lib/physics/mathviz.js');
  const sym = eigen2x2(2, 1, 1, 2);
  assert.ok(sym.real);
  close(sym.values[0], 3, 1e-12, '対称行列の固有値');
  close(sym.values[1], 1, 1e-12, '対称行列の固有値');
  // 固有ベクトルは直交する（実対称行列）
  const [v1, v2] = sym.vectors;
  close(v1[0] * v2[0] + v1[1] * v2[1], 0, 1e-9, '固有ベクトルの直交性');
  // Av = λv を直接確かめる
  for (let i = 0; i < 2; i++) {
    const v = sym.vectors[i];
    const l = sym.values[i];
    close(2 * v[0] + 1 * v[1], l * v[0], 1e-9, 'Av=λv の第1成分');
    close(1 * v[0] + 2 * v[1], l * v[1], 1e-9, 'Av=λv の第2成分');
  }
  // 回転行列は実の固有方向を持たない
  const rot = eigen2x2(0, -1, 1, 0);
  assert.equal(rot.real, false);
  close(rot.trace, 0, 1e-12, 'トレース');
  close(rot.det, 1, 1e-12, '行列式');
});

test('テイラー展開: 次数を上げると近似が良くなり、収束半径の外では壊れる', async () => {
  const { TAYLOR_TARGETS, taylorPartialSum } = await import('../lib/physics/mathviz.js');
  const sin = TAYLOR_TARGETS.sin;
  close(taylorPartialSum(sin, 1.0, 15), Math.sin(1.0), 1e-12, 'sin の高次近似');
  assert.ok(
    Math.abs(taylorPartialSum(sin, 1.0, 1) - Math.sin(1)) > Math.abs(taylorPartialSum(sin, 1.0, 5) - Math.sin(1)),
    '次数を上げると誤差が減る'
  );
  const geom = TAYLOR_TARGETS.geom;
  close(taylorPartialSum(geom, 0.5, 40), 2, 1e-9, '収束半径の内側では正しい値へ');
  assert.ok(Math.abs(taylorPartialSum(geom, 1.5, 40)) > 1e6, '収束半径の外側では発散する');
});
