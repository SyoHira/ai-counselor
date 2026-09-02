// 1次元シュレーディンガー方程式のソルバ。
// 単位系は ħ = m = 1 を既定とする（無次元化された「理論家の単位」）。

/** 一様グリッド（両端は無限障壁＝ディリクレ境界として扱う内部点） */
export function makeGrid(N, xmin, xmax) {
  const dx = (xmax - xmin) / (N + 1);
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = xmin + (i + 1) * dx;
  return { x, dx, N, xmin, xmax };
}

export const POTENTIALS = {
  well: {
    label: '無限井戸',
    tex: 'V(x)=0\\ (0<x<L),\\quad V=\\infty\\ (\\text{それ以外})',
    params: [],
    fn: () => 0,
    note: '箱の中の粒子。E_n = n²π²ħ²/(2mL²) でエネルギーが n² に比例する。',
  },
  harmonic: {
    label: '調和振動子',
    tex: 'V(x)=\\tfrac{1}{2}m\\omega^2x^2',
    params: [{ key: 'omega', label: 'ω', min: 0.2, max: 3, step: 0.1, def: 1 }],
    fn: (x, p) => 0.5 * p.omega * p.omega * x * x,
    note: '等間隔スペクトル E_n=(n+½)ħω。場の量子論はこの振動子の無限個の集まりとして始まる。',
  },
  barrier: {
    label: '障壁（トンネル効果）',
    tex: 'V(x)=V_0\;(|x|<a/2)',
    params: [
      { key: 'V0', label: 'V₀', min: 0, max: 30, step: 0.5, def: 12 },
      { key: 'a', label: '幅 a', min: 0.2, max: 6, step: 0.1, def: 1.5 },
    ],
    fn: (x, p) => (Math.abs(x) < p.a / 2 ? p.V0 : 0),
    note: '古典的には越えられない壁を波動関数が指数関数的に染み込んで通り抜ける。走査型トンネル顕微鏡とα崩壊はこの1粒子トンネルで説明できる。Josephson接合も同じトンネル現象だが、こちらはクーパー対のマクロな位相がトンネルする点が異なる。',
  },
  double: {
    label: '二重井戸',
    tex: 'V(x)=\\lambda(x^2-b^2)^2',
    params: [
      { key: 'lambda', label: 'λ', min: 0.05, max: 2, step: 0.05, def: 0.4 },
      { key: 'b', label: 'b', min: 0.5, max: 4, step: 0.1, def: 2 },
    ],
    fn: (x, p) => p.lambda * (x * x - p.b * p.b) ** 2,
    note: '障壁が高いほど左右の局在状態が縮退に近づき、トンネルで対称・反対称の対に分裂する。この分裂幅がアンモニア分子の反転や二準位系のトンネル結合にあたる。なお有限系の基底状態は必ず対称のままで、対称性が実際に破れるのは無限体積極限に限られる。',
  },
  linear: {
    label: '一様な力（三角井戸）',
    tex: 'V(x)=F|x|',
    params: [{ key: 'F', label: 'F', min: 0.2, max: 10, step: 0.2, def: 2 }],
    fn: (x, p) => p.F * Math.abs(x),
    note: 'Airy関数が解になる。片側だけを壁にすれば中性子の重力量子準位（GRANIT実験）と同じ形で、ここでは左右対称にしてあるため偶奇の対が現れる。半導体量子井戸に電場をかけた量子閉じ込めStark効果も同じ傾斜ポテンシャルの問題。',
  },
  morse: {
    label: 'Morseポテンシャル',
    tex: 'V(x)=D(1-e^{-\\alpha x})^2',
    params: [
      { key: 'D', label: 'D', min: 1, max: 30, step: 0.5, def: 12 },
      { key: 'alpha', label: 'α', min: 0.2, max: 2, step: 0.1, def: 0.6 },
    ],
    fn: (x, p) => p.D * (1 - Math.exp(-p.alpha * x)) ** 2,
    note: '二原子分子の振動を表す非調和ポテンシャル。準位間隔が上に行くほど狭まり、有限個の束縛状態しか持たない。',
  },
};

export function buildPotential(kind, params, grid) {
  const def = POTENTIALS[kind];
  const V = new Float64Array(grid.N);
  for (let i = 0; i < grid.N; i++) V[i] = def.fn(grid.x[i], params);
  return V;
}

/**
 * 対称三重対角行列の固有値・固有ベクトル（implicit shift QL, Numerical Recipes tqli 相当）。
 * @param d 対角成分（破壊的に固有値で上書きされる）
 * @param e 副対角成分（作業用に破壊される）
 * @param z n×n の作業配列（単位行列で初期化）。列 i が固有ベクトル。
 */
function tqli(d, e, z, n) {
  for (let i = 1; i < n; i++) e[i - 1] = e[i];
  e[n - 1] = 0;
  for (let l = 0; l < n; l++) {
    let iter = 0;
    let m;
    do {
      for (m = l; m < n - 1; m++) {
        const dd = Math.abs(d[m]) + Math.abs(d[m + 1]);
        if (Math.abs(e[m]) <= Number.EPSILON * dd) break;
      }
      if (m !== l) {
        if (iter++ === 60) throw new Error('tqli: too many iterations');
        let g = (d[l + 1] - d[l]) / (2 * e[l]);
        let r = Math.hypot(g, 1);
        g = d[m] - d[l] + e[l] / (g + (g >= 0 ? Math.abs(r) : -Math.abs(r)));
        let s = 1, c = 1, p = 0;
        let i;
        for (i = m - 1; i >= l; i--) {
          let f = s * e[i];
          const b = c * e[i];
          r = Math.hypot(f, g);
          e[i + 1] = r;
          if (r === 0) { d[i + 1] -= p; e[m] = 0; break; }
          s = f / r;
          c = g / r;
          g = d[i + 1] - p;
          r = (d[i] - g) * s + 2 * c * b;
          p = s * r;
          d[i + 1] = g + p;
          g = c * r - b;
          for (let k = 0; k < n; k++) {
            f = z[k * n + i + 1];
            z[k * n + i + 1] = s * z[k * n + i] + c * f;
            z[k * n + i] = c * z[k * n + i] - s * f;
          }
        }
        if (r === 0 && i >= l) continue;
        d[l] -= p;
        e[l] = g;
        e[m] = 0;
      }
    } while (m !== l);
  }
}

/**
 * 定常シュレーディンガー方程式 −(ħ²/2m)ψ'' + Vψ = Eψ を有限差分で解く。
 * @returns {{energies: number[], states: Float64Array[]}} 低い方から count 個
 */
export function solveEigenstates(V, grid, { hbar = 1, mass = 1, count = 6 } = {}) {
  const n = grid.N;
  const dx = grid.dx;
  const t = (hbar * hbar) / (2 * mass * dx * dx);
  const d = new Float64Array(n);
  const e = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    d[i] = 2 * t + V[i];
    e[i] = i === 0 ? 0 : -t;
  }
  const z = new Float64Array(n * n);
  for (let i = 0; i < n; i++) z[i * n + i] = 1;
  tqli(d, e, z, n);

  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => d[a] - d[b]);
  const k = Math.min(count, n);
  const energies = [];
  const states = [];
  for (let s = 0; s < k; s++) {
    const col = order[s];
    const psi = new Float64Array(n);
    let norm = 0;
    for (let i = 0; i < n; i++) {
      psi[i] = z[i * n + col];
      norm += psi[i] * psi[i];
    }
    // ∫|ψ|²dx = 1 になるよう規格化し、符号は「最初の大きな山が正」に固定
    const scale = 1 / Math.sqrt(norm * dx);
    let peak = 0, peakIdx = 0;
    for (let i = 0; i < n; i++) if (Math.abs(psi[i]) > peak) { peak = Math.abs(psi[i]); peakIdx = i; }
    const sign = psi[peakIdx] < 0 ? -1 : 1;
    for (let i = 0; i < n; i++) psi[i] *= scale * sign;
    energies.push(d[col]);
    states.push(psi);
  }
  return { energies, states };
}

/** 無限井戸の解析解 E_n（n = 1, 2, ...） */
export function infiniteWellEnergy(n, L, hbar = 1, mass = 1) {
  return (n * n * Math.PI * Math.PI * hbar * hbar) / (2 * mass * L * L);
}

/** 矩形障壁の透過率（定常散乱の厳密解） */
export function barrierTransmission(E, V0, a, { hbar = 1, mass = 1 } = {}) {
  if (E <= 0) return 0;
  if (V0 === 0) return 1;
  if (Math.abs(E - V0) < 1e-12) {
    const k = Math.sqrt(2 * mass * E) / hbar;
    return 1 / (1 + (k * a) ** 2 / 4);
  }
  if (E < V0) {
    const kappa = Math.sqrt(2 * mass * (V0 - E)) / hbar;
    const s = Math.sinh(kappa * a);
    return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (V0 - E)));
  }
  const k2 = Math.sqrt(2 * mass * (E - V0)) / hbar;
  const s = Math.sin(k2 * a);
  return 1 / (1 + (V0 * V0 * s * s) / (4 * E * (E - V0)));
}

/** 調和振動子の解析解 E_n = (n+½)ħω */
export function harmonicEnergy(n, omega, hbar = 1) {
  return (n + 0.5) * hbar * omega;
}
