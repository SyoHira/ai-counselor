import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32, randBeta, betaSummary, fitBetaPrior, thompsonAllocate, probabilityBest, slope, fitBinomialLogit,
} from '../lib/engine/stats.mjs';

test('randBeta の平均が理論値に近い', () => {
  const rng = mulberry32(1);
  const xs = Array.from({ length: 20000 }, () => randBeta(2, 8, rng));
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(Math.abs(mean - 0.2) < 0.005, `mean=${mean}`);
});

test('betaSummary の90%区間が平均を含む', () => {
  const s = betaSummary(30, 970, mulberry32(2));
  assert.ok(s.lo < s.mean && s.mean < s.hi);
  assert.ok(s.lo > 0.02 && s.hi < 0.04);
});

test('fitBetaPrior: 腕間差が無ければ強く縮小、あれば弱く', () => {
  const same = fitBetaPrior([1, 2, 3, 4].map(() => ({ successes: 100, trials: 10000 })));
  assert.ok(same.alpha + same.beta >= 4999);
  const diff = fitBetaPrior([
    { successes: 10, trials: 10000 },
    { successes: 300, trials: 10000 },
    { successes: 50, trials: 10000 },
    { successes: 150, trials: 10000 },
  ]);
  assert.ok(diff.alpha + diff.beta < 500, JSON.stringify(diff));
  assert.ok(Math.abs(diff.alpha / (diff.alpha + diff.beta) - 0.0128) < 0.001);
});

test('fitBetaPrior: データ不足・成功ゼロは fallback', () => {
  const fallback = { mean: 0.02, strength: 100 };
  assert.deepEqual(fitBetaPrior([{ successes: 1, trials: 10 }], fallback), { alpha: 2, beta: 98 });
  const zero = fitBetaPrior([1, 2, 3].map(() => ({ successes: 0, trials: 400 })), fallback);
  assert.deepEqual(zero, { alpha: 2, beta: 98 });
});

test('Thompson sampling は良い腕に枠を多く配分し、上限を守る', () => {
  const rng = mulberry32(3);
  const arms = [
    { id: 'good', sample: () => randBeta(60, 940, rng) },
    { id: 'bad', sample: () => randBeta(20, 980, rng) },
    { id: 'unknown', sample: () => randBeta(1, 49, rng) },
  ];
  const picks = thompsonAllocate(arms, 300);
  const count = (id) => picks.filter((p) => p === id).length;
  assert.ok(count('good') > count('bad'));
  assert.ok(count('unknown') > 0, '不確実な腕も探索される');
  const capped = thompsonAllocate(arms, 3, { maxPerArm: 1 });
  assert.equal(new Set(capped).size, 3);
});

test('probabilityBest の合計は1', () => {
  const rng = mulberry32(4);
  const pb = probabilityBest([
    { id: 'a', sample: () => randBeta(50, 950, rng) },
    { id: 'b', sample: () => randBeta(10, 990, rng) },
  ]);
  assert.ok(Math.abs(pb.get('a') + pb.get('b') - 1) < 1e-9);
  assert.ok(pb.get('a') > 0.99);
});

test('slope: 順位が上がっている（数字が減る）と負', () => {
  assert.ok(slope([0, 1, 2, 3], [Math.log(40), Math.log(30), Math.log(20), Math.log(10)]) < 0);
  assert.equal(slope([1], [1]), 0);
});

test('fitBinomialLogit が生成モデルの係数を回復する', () => {
  const rng = mulberry32(5);
  const X = [];
  const succ = [];
  const trials = [];
  for (let i = 0; i < 400; i++) {
    const x1 = randBeta(2, 2, rng) * 4 - 2;
    const x2 = randBeta(2, 2, rng) * 4 - 2;
    const p = 1 / (1 + Math.exp(-(-4 + 0.8 * x1 - 0.5 * x2)));
    const n = 2000;
    let s = 0;
    for (let k = 0; k < n; k++) if (rng() < p) s++;
    X.push([x1, x2]);
    succ.push(s);
    trials.push(n);
  }
  const { weights } = fitBinomialLogit(X, succ, trials, { l2: 0.01 });
  assert.ok(Math.abs(weights[0] + 4) < 0.1, `w0=${weights[0]}`);
  assert.ok(Math.abs(weights[1] - 0.8) < 0.1, `w1=${weights[1]}`);
  assert.ok(Math.abs(weights[2] + 0.5) < 0.1, `w2=${weights[2]}`);
});
