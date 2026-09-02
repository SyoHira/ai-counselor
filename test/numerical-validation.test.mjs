import test from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import { MODULES, TRACKS } from '../lib/physics/curriculum.js';
import { POTENTIALS, makeGrid, buildPotential, solveEigenstates, harmonicEnergy, infiniteWellEnergy } from '../lib/quantum/schrodinger.js';
import { gaussianPacket, makePropagator, step, positionStats } from '../lib/quantum/evolution.js';

const close = (a, b, tolerance) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('all curriculum equations render and track/lab references resolve', () => {
  for (const m of MODULES) {
    assert.ok(TRACKS.some(t => t.id === m.track), m.id);
    for (const lab of m.labs || []) assert.ok(['circuit', 'bloch', 'well', 'tunnel', 'math'].includes(lab), m.id);
    for (const { tex } of m.equations || []) assert.doesNotThrow(() => katex.renderToString(tex, { throwOnError: true, trust: false, strict: 'ignore' }), m.id);
  }
});

test('all six potentials return orthonormal eigenvectors satisfying the discrete equation', () => {
  for (const [kind, def] of Object.entries(POTENTIALS)) {
    const params = Object.fromEntries(def.params.map(p => [p.key, p.def]));
    const grid = makeGrid(80, kind === 'well' ? 0 : -2, kind === 'well' ? 1 : 8);
    const V = buildPotential(kind, params, grid);
    const { energies, states } = solveEigenstates(V, grid, { count: 4 });
    const kinetic = 1 / (2 * grid.dx ** 2);
    states.forEach((psi, n) => {
      let residual = 0;
      for (let i = 0; i < grid.N; i++) {
        const hpsi = (2 * kinetic + V[i]) * psi[i] - kinetic * ((psi[i - 1] || 0) + (psi[i + 1] || 0));
        residual += (hpsi - energies[n] * psi[i]) ** 2 * grid.dx;
      }
      assert.ok(Math.sqrt(residual) < 1e-8, `${kind}: residual ${Math.sqrt(residual)}`);
      states.forEach((other, m) => close(psi.reduce((sum, x, i) => sum + x * other[i] * grid.dx, 0), n === m ? 1 : 0, 1e-10));
    });
  }
});

test('refining the spatial grid reduces ground-state energy error for the well and oscillator', () => {
  for (const kind of ['well', 'harmonic']) {
    const expected = kind === 'well' ? infiniteWellEnergy(1, 1) : harmonicEnergy(0, 1);
    const error = n => {
      const grid = makeGrid(n, kind === 'well' ? 0 : -8, kind === 'well' ? 1 : 8);
      return Math.abs(solveEigenstates(buildPotential(kind, { omega: 1 }, grid), grid, { count: 1 }).energies[0] - expected);
    };
    assert.ok(error(160) < error(80) / 3, kind);
  }
});

test('free wavepacket moves and spreads according to the analytic Gaussian solution', () => {
  const x = Float64Array.from({ length: 1024 }, (_, i) => -60 + 120 * i / 1024);
  const { re, im } = gaussianPacket(x, { x0: -20, k0: 3, sigma: 2 });
  const prop = makePropagator(x, new Float64Array(x.length), 0.01);
  for (let i = 0; i < 500; i++) step(re, im, prop);
  const result = positionStats(x, re, im);
  close(result.mean, -5, 1e-8);
  close(result.sigma, Math.sqrt(4 + (5 / 4) ** 2), 1e-8);
  close(result.norm, 1, 1e-9);
});
