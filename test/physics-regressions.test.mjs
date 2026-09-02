import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, runShots } from '../lib/quantum/circuit.js';
import { getPreset } from '../lib/quantum/presets.js';
import { StateVector, mulberry32 } from '../lib/quantum/statevector.js';
import { M } from '../lib/quantum/gates.js';
import { setStatus, getModuleProgress, recordAttempt, loadProgress, dueForReview } from '../lib/physics/progress.js';

const close = (a, b, tolerance = 1e-10) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const gate = (name, target = 0) => ({ kind: 'gate', gate: name, target });
const measurement = { kind: 'measure', target: 0 };

test('singlet preset is anticorrelated in both Z and X bases', () => {
  const circuit = getPreset('bell-psi-minus').circuit;
  for (const ops of [circuit.ops, [...circuit.ops, gate('H', 0), gate('H', 1)]]) {
    const p = simulate({ n: 2, ops }).state.probabilities();
    close(p[0] + p[3], 0);
    close(p[1], 0.5);
    close(p[2], 0.5);
  }
});

test('mid-circuit measurement removes interference in the displayed probabilities', () => {
  const circuit = { n: 1, ops: [gate('H'), measurement, gate('H'), measurement] };
  const { state, steps } = simulate(circuit);
  close(state.probabilities()[0], 0.5);
  close(state.bloch(0).r, 0);
  close(steps[2].probabilities[0], 0.5);
  const { counts } = runShots(circuit, 4000, mulberry32(123));
  close(counts['0'] / 4000, state.probabilities()[0], 0.03);
});

test('sampling never selects a zero-probability state when the random draw is zero', () => {
  const state = new StateVector(1).applyGate(M.X, 0);
  assert.equal(state.measureAll(() => 0), 1);
});

function browser(t) {
  const data = new Map();
  const previous = globalThis.window;
  globalThis.window = { localStorage: {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  }, dispatchEvent() {} };
  t.after(() => { if (previous === undefined) delete globalThis.window; else globalThis.window = previous; });
  return data;
}

test('review intervals start at one day and repeated mastery clicks do not advance them', t => {
  browser(t);
  const start = Date.now();
  setStatus('qm-ug-02', 'mastered');
  const first = getModuleProgress('qm-ug-02');
  close((Date.parse(first.reviewAt) - start) / 86400000, 1, 0.001);
  setStatus('qm-ug-02', 'mastered');
  assert.deepEqual(getModuleProgress('qm-ug-02'), first);
});

test('an incorrect answer cannot silently postpone a mastered module review', t => {
  browser(t);
  setStatus('qm-ug-02', 'mastered');
  recordAttempt('qm-ug-02', false);
  assert.equal(getModuleProgress('qm-ug-02').status, 'review');
  assert.ok(dueForReview().includes('qm-ug-02'));
});

test('malformed persisted module entries cannot crash recommendations', t => {
  const data = browser(t);
  data.set('physics.progress.v1', JSON.stringify({ modules: { broken: null }, sessions: 42 }));
  const state = loadProgress();
  assert.doesNotThrow(() => dueForReview(state));
  assert.ok(Array.isArray(state.sessions));
});

test('measurement removes Bell coherence without removing classical correlation', () => {
  const circuit = getPreset('bell').circuit;
  const { state } = simulate({ ...circuit, ops: [...circuit.ops, measurement] });
  close(state.purity(), 0.5);
  close(state.probabilities()[0], 0.5);
  close(state.probabilities()[3], 0.5);
  close(state.entropy(0), 1);
  close(state.re[3], 0); // rho[00,11] must vanish
});

test('density-matrix gates retain complex coherences and support swaps', () => {
  const ops = [measurement, gate('H'), gate('S'), { kind: 'gate', gate: 'X', target: 1, controls: [0] }, { kind: 'swap', target: 0, target2: 1, controls: [] }];
  const mixed = simulate({ n: 2, ops }).state;
  const pure = simulate({ n: 2, ops: ops.slice(1) }).state;
  close(mixed.purity(), 1);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    close(mixed.re[4 * i + j], pure.re[i] * pure.re[j] + pure.im[i] * pure.im[j]);
    close(mixed.im[4 * i + j], pure.im[i] * pure.re[j] - pure.re[i] * pure.im[j]);
  }
});

test('successful due reviews follow 1/3/7/16/35/90 days without sliding on extra practice', t => {
  const data = browser(t);
  setStatus('qm-ug-02', 'mastered');
  for (const days of [3, 7, 16, 35, 90, 90]) {
    const state = loadProgress();
    state.modules['qm-ug-02'].reviewAt = new Date(Date.now() - 1000).toISOString();
    data.set('physics.progress.v1', JSON.stringify(state));
    const now = Date.now();
    setStatus('qm-ug-02', 'mastered');
    const scheduled = getModuleProgress('qm-ug-02').reviewAt;
    close((Date.parse(scheduled) - now) / 86400000, days, 0.001);
    recordAttempt('qm-ug-02', true);
    assert.equal(getModuleProgress('qm-ug-02').reviewAt, scheduled);
  }
});
