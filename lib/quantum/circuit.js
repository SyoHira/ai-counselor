import { StateVector, basisLabel } from './statevector.js';
import { GATES } from './gates.js';

/**
 * 回路モデル
 * circuit = { n: 量子ビット数, ops: Op[] }
 * Op = { kind:'gate', gate:'H'|'X'|..., target:number, controls:number[], param?:number }
 *    | { kind:'swap', target:number, target2:number, controls:number[] }
 *    | { kind:'measure', target:number }
 *    | { kind:'barrier' }
 * ops は適用順の列。UIでは1opを1列として描画する。
 */

export function emptyCircuit(n = 2) {
  return { n, ops: [] };
}

function applyOp(state, op, opts = {}) {
  const { rng = Math.random, collapse = false, classical = null } = opts;
  switch (op.kind) {
    case 'gate': {
      const def = GATES[op.gate];
      if (!def) throw new Error(`unknown gate: ${op.gate}`);
      state.applyGate(def.matrix(op.param ?? Math.PI / 2), op.target, op.controls || []);
      return null;
    }
    case 'swap':
      state.applySwap(op.target, op.target2, op.controls || []);
      return null;
    case 'measure': {
      if (!collapse) return null;
      const bit = state.measureQubit(op.target, rng);
      if (classical) classical[op.target] = bit;
      return bit;
    }
    case 'barrier':
      return null;
    default:
      throw new Error(`unknown op: ${op.kind}`);
  }
}

/**
 * 回路を状態ベクトルで実行する（測定は収縮させない＝遅延測定の描像）。
 * 各ステップの確率分布・Blochベクトル・エントロピーを返す。
 */
export function simulate(circuit) {
  const state = new StateVector(circuit.n);
  const steps = [{
    index: -1,
    probabilities: Array.from(state.probabilities()),
    bloch: blochAll(state),
    entropy: entropyAll(state),
  }];
  for (let k = 0; k < circuit.ops.length; k++) {
    applyOp(state, circuit.ops[k], { collapse: false });
    steps.push({
      index: k,
      probabilities: Array.from(state.probabilities()),
      bloch: blochAll(state),
      entropy: entropyAll(state),
    });
  }
  return { state, steps };
}

function blochAll(state) {
  const out = [];
  for (let q = 0; q < state.n; q++) out.push(state.bloch(q));
  return out;
}

function entropyAll(state) {
  const out = [];
  for (let q = 0; q < state.n; q++) out.push(state.entropy(q));
  return out;
}

/**
 * ショット実行。途中測定は実際に収縮させる（測定後の分岐を正しく扱う）。
 * 測定opが1つも無い回路では、最後に全量子ビットを測定したものとみなす。
 * @returns {{counts: Record<string, number>, shots: number, measured: number[]}}
 */
export function runShots(circuit, shots = 1024, rng = Math.random) {
  const measuredQubits = circuit.ops.filter((o) => o.kind === 'measure').map((o) => o.target);
  const targets = measuredQubits.length
    ? [...new Set(measuredQubits)].sort((a, b) => a - b)
    : Array.from({ length: circuit.n }, (_, i) => i);
  const counts = Object.create(null);
  for (let s = 0; s < shots; s++) {
    const state = new StateVector(circuit.n);
    const classical = new Array(circuit.n).fill(null);
    for (const op of circuit.ops) applyOp(state, op, { rng, collapse: true, classical });
    if (!measuredQubits.length) {
      const idx = state.measureAll(rng);
      for (const q of targets) classical[q] = (idx >> q) & 1;
    }
    const key = targets.map((q) => (classical[q] === null ? '?' : classical[q])).join('');
    counts[key] = (counts[key] || 0) + 1;
  }
  return { counts, shots, measured: targets };
}

/** 表示用：確率の大きい順に上位 k 個の基底状態 */
export function topBasis(probabilities, n, k = 8, threshold = 1e-9) {
  return probabilities
    .map((p, i) => ({ label: basisLabel(i, n), p, index: i }))
    .filter((e) => e.p > threshold)
    .sort((a, b) => b.p - a.p)
    .slice(0, k);
}

/** ケット記法の状態式（表示用文字列） */
export function ketString(state, digits = 3, threshold = 1e-6) {
  const parts = [];
  for (let i = 0; i < state.size; i++) {
    const re = state.re[i], im = state.im[i];
    if (re * re + im * im < threshold) continue;
    let coeff;
    if (Math.abs(im) < 1e-9) coeff = re.toFixed(digits);
    else if (Math.abs(re) < 1e-9) coeff = `${im.toFixed(digits)}i`;
    else coeff = `(${re.toFixed(digits)}${im < 0 ? '−' : '+'}${Math.abs(im).toFixed(digits)}i)`;
    parts.push(`${coeff}|${basisLabel(i, state.n)}⟩`);
  }
  return parts.length ? parts.join(' + ') : '0';
}
