// 意思決定に使う統計。依存ゼロで、テスト時は rng を差し替えられる。

// --- 乱数 ---
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randNormal(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// Marsaglia–Tsang
export function randGamma(shape, rng = Math.random) {
  if (shape < 1) return randGamma(shape + 1, rng) * Math.pow(rng(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do {
      x = randNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function randBeta(a, b, rng = Math.random) {
  const x = randGamma(a, rng);
  return x / (x + randGamma(b, rng));
}

// --- 事後分布の要約 ---
export function quantiles(samples, qs) {
  const s = [...samples].sort((x, y) => x - y);
  return qs.map((q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]);
}

export function betaSummary(a, b, rng = Math.random, draws = 4000) {
  const xs = Array.from({ length: draws }, () => randBeta(a, b, rng));
  const [lo, hi] = quantiles(xs, [0.05, 0.95]);
  return { mean: a / (a + b), lo, hi };
}

// 腕ごとの成功/試行から共通の Beta 事前分布を推定（経験ベイズ、モーメント法）。
// データが少ない間は fallback を使い、極端な値に引っ張られないよう強さを制限する。
export function fitBetaPrior(arms, fallback = { mean: 0.01, strength: 200 }) {
  const usable = arms.filter((a) => a.trials > 0);
  const toPrior = ({ mean, strength }) => ({ alpha: mean * strength, beta: (1 - mean) * strength });
  const totalS = usable.reduce((s, a) => s + a.successes, 0);
  // 成功がほぼ無い段階で推定すると平均が0付近に潰れ、全腕の比較がノイズになるので既定値を使う
  if (usable.length < 3 || totalS < 5) return toPrior(fallback);

  const totalT = usable.reduce((s, a) => s + a.trials, 0);
  const mean = totalS / totalT;
  if (mean >= 1) return toPrior(fallback);

  // 試行数で重み付けした分散から、二項ノイズ分を引いて腕間の真のばらつきを出す
  const variance = usable.reduce((s, a) => s + a.trials * (a.successes / a.trials - mean) ** 2, 0) / totalT;
  const noise = usable.reduce((s, a) => s + mean * (1 - mean), 0) / totalT;
  const between = variance - noise;
  if (between <= 0) return toPrior({ mean, strength: 5000 }); // 腕間差が検出できない → 強く平均へ縮小
  const strength = Math.min(Math.max((mean * (1 - mean)) / between - 1, 10), 5000);
  return toPrior({ mean, strength });
}

// prior mean を差し替えつつ強さを保つ（特徴量モデルの予測をコールドスタートに使う）
export function shiftPrior(prior, mean) {
  const strength = prior.alpha + prior.beta;
  const m = Math.min(Math.max(mean, 1e-5), 0.99);
  return { alpha: m * strength, beta: (1 - m) * strength };
}

// --- Thompson sampling ---
// arms: [{ id, sample: () => number }]。各枠で1回サンプルして最大の腕を選ぶ（確率マッチング）。
export function thompsonAllocate(arms, slots, { maxPerArm = Infinity } = {}) {
  const counts = new Map();
  const picks = [];
  for (let i = 0; i < slots; i++) {
    let best = null;
    let bestValue = -Infinity;
    for (const arm of arms) {
      if ((counts.get(arm.id) ?? 0) >= maxPerArm) continue;
      const v = arm.sample();
      if (v > bestValue) {
        bestValue = v;
        best = arm;
      }
    }
    if (!best) break;
    counts.set(best.id, (counts.get(best.id) ?? 0) + 1);
    picks.push(best.id);
  }
  return picks;
}

export function probabilityBest(arms, draws = 2000) {
  const wins = new Map(arms.map((a) => [a.id, 0]));
  for (let i = 0; i < draws; i++) {
    let best = null;
    let bestValue = -Infinity;
    for (const arm of arms) {
      const v = arm.sample();
      if (v > bestValue) {
        bestValue = v;
        best = arm.id;
      }
    }
    wins.set(best, wins.get(best) + 1);
  }
  return new Map([...wins].map(([id, w]) => [id, w / draws]));
}

// --- 回帰 ---
// 単回帰の傾き（ランキング順位の log を日数で回帰 → 負なら上昇中）
export function slope(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function standardize(rows) {
  const k = rows[0]?.length ?? 0;
  const means = Array.from({ length: k }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / rows.length);
  const sds = Array.from({ length: k }, (_, j) =>
    Math.sqrt(rows.reduce((s, r) => s + (r[j] - means[j]) ** 2, 0) / rows.length) || 1
  );
  return { means, sds, apply: (r) => r.map((v, j) => (v - means[j]) / sds[j]) };
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// 集計済み二項データ（成功/試行）に対する L2 正則化ロジスティック回帰（Newton 法）。
// X は切片なしの特徴量行列（標準化済み推奨）。返す weights[0] が切片。
export function fitBinomialLogit(X, successes, trials, { l2 = 1, iterations = 25 } = {}) {
  const rows = X.map((r) => [1, ...r]);
  const k = rows[0].length;
  let w = new Array(k).fill(0);
  const total = trials.reduce((s, t) => s + t, 0);
  const base = successes.reduce((s, x) => s + x, 0) / Math.max(total, 1);
  w[0] = Math.log(Math.max(base, 1e-6) / Math.max(1 - base, 1e-6));

  for (let it = 0; it < iterations; it++) {
    const grad = new Array(k).fill(0);
    const H = Array.from({ length: k }, () => new Array(k).fill(0));
    rows.forEach((x, i) => {
      const p = sigmoid(x.reduce((s, v, j) => s + v * w[j], 0));
      const r = successes[i] - trials[i] * p;
      const wt = trials[i] * p * (1 - p);
      for (let a = 0; a < k; a++) {
        grad[a] += r * x[a];
        for (let b = 0; b < k; b++) H[a][b] += wt * x[a] * x[b];
      }
    });
    for (let a = 1; a < k; a++) {
      grad[a] -= l2 * w[a];
      H[a][a] += l2;
    }
    const step = solve(H, grad);
    if (!step) break;
    w = w.map((v, j) => v + step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return { weights: w, predict: (x) => sigmoid([1, ...x].reduce((s, v, j) => s + v * w[j], 0)) };
}
