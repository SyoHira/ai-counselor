// 物理数学の対象を「目で見える形」にするための計算。
// すべて解析解と突き合わせられる純関数として書いてある。

// ── ベクトル場と発散・回転 ─────────────────────────────
// 発散は湧き出しの強さ、回転は渦の強さ。式の意味を絵にする。

export const VECTOR_FIELDS = {
  radial: {
    label: '放射状（湧き出し）',
    tex: '\\mathbf{F}=(x,\\,y)',
    fn: (x, y) => [x, y],
    div: () => 2,
    curl: () => 0,
    note: 'どの点からも外向きに湧き出す。発散は正で一定、回転はゼロ。点電荷のまわりの電場のような場。',
  },
  rotation: {
    label: '渦（剛体回転）',
    tex: '\\mathbf{F}=(-y,\\,x)',
    fn: (x, y) => [-y, x],
    div: () => 0,
    curl: () => 2,
    note: '湧き出しはないが至るところ回っている。発散ゼロ・回転一定。直線電流のまわりの磁場に近い形。',
  },
  saddle: {
    label: '鞍点（伸びと縮み）',
    tex: '\\mathbf{F}=(x,\\,-y)',
    fn: (x, y) => [x, -y],
    div: () => 0,
    curl: () => 0,
    note: '横に伸びて縦に縮む。差し引きゼロなので発散も回転もない。非圧縮の流れの典型。',
  },
  shear: {
    label: 'せん断流',
    tex: '\\mathbf{F}=(y,\\,0)',
    fn: (x, y) => [y, 0],
    div: () => 0,
    curl: () => -1,
    note: '全体としてはまっすぐ流れているのに回転がある。「渦＝回っているように見えること」ではない、と分かる例。',
  },
  coulomb2d: {
    label: '2次元のクーロン場',
    tex: '\\mathbf{F}=\\dfrac{(x,\\,y)}{r^{2}}=\\dfrac{\\hat{\\mathbf r}}{r}',
    fn: (x, y) => {
      const r2 = Math.max(x * x + y * y, 1e-4);
      return [x / r2, y / r2];
    },
    div: () => 0, // 原点を除く
    curl: () => 0,
    singular: true,
    note: '原点以外では発散も回転もゼロ。それでも原点を囲むどんな閉曲線でも流束は同じ 2π になる——この食い違いを埋めるのがデルタ関数とGaussの法則。無限に長い直線電荷のまわりの電場がこの形で、次元によって「逆2乗」が「逆1乗」になることに注意（3次元で発散ゼロなのは r̂/r²）。',
  },
  dipole: {
    label: '双極子',
    tex: '\\mathbf{F}=\\nabla\\dfrac{x}{r^{2}}',
    fn: (x, y) => {
      const r2 = Math.max(x * x + y * y, 1e-3);
      return [(y * y - x * x) / (r2 * r2), (-2 * x * y) / (r2 * r2)];
    },
    div: () => 0,
    curl: () => 0,
    singular: true,
    note: '正負が近接した極。遠くでは急速に弱まり、向きによって符号が変わる。多重極展開の第2項にあたる。',
  },
};

/** 数値微分による発散と回転（解析値との一致がそのまま検算になる） */
export function divCurlNumeric(field, x, y, h = 1e-4) {
  const [fxp] = field(x + h, y);
  const [fxm] = field(x - h, y);
  const [, fyp] = field(x, y + h);
  const [, fym] = field(x, y - h);
  const div = (fxp - fxm) / (2 * h) + (fyp - fym) / (2 * h);
  const [, fy_xp] = field(x + h, y);
  const [, fy_xm] = field(x - h, y);
  const [fx_yp] = field(x, y + h);
  const [fx_ym] = field(x, y - h);
  const curl = (fy_xp - fy_xm) / (2 * h) - (fx_yp - fx_ym) / (2 * h);
  return { div, curl };
}

/** 格子上の矢印。長さは対数圧縮して、強い場でも画面に収める */
export function sampleField(fn, { n = 13, extent = 2 } = {}) {
  const arrows = [];
  let max = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = -extent + (2 * extent * i) / (n - 1);
      const y = -extent + (2 * extent * j) / (n - 1);
      const [u, v] = fn(x, y);
      const mag = Math.hypot(u, v);
      if (mag > max) max = mag;
      arrows.push({ x, y, u, v, mag });
    }
  }
  return { arrows, max };
}

// ── フーリエ級数 ───────────────────────────────────
// 「どんな波も正弦波の足し算で作れる」を、項を増やしながら見る。

export const WAVEFORMS = {
  square: {
    label: '矩形波',
    tex: 'f(x)=\\mathrm{sgn}(\\sin x)',
    exact: (x) => (Math.sin(x) >= 0 ? 1 : -1),
    // b_n = 4/(nπ) （nが奇数のときだけ）
    coeff: (n) => (n % 2 === 1 ? 4 / (n * Math.PI) : 0),
    note: '不連続点のまわりで、項を増やしても消えない行き過ぎが残る（Gibbs現象）。大きさは跳びの高さの約9%で、この波は跳びが2なのでピークは約1.18になる。項を増やすと行き過ぎる幅は狭くなるが、高さは減らない。',
  },
  triangle: {
    label: '三角波',
    tex: 'f(x)=\\tfrac{2}{\\pi}\\arcsin(\\sin x)',
    exact: (x) => (2 / Math.PI) * Math.asin(Math.sin(x)),
    // b_n = 8(-1)^((n-1)/2)/(π²n²) （nが奇数）
    coeff: (n) => (n % 2 === 1 ? (8 * (-1) ** ((n - 1) / 2)) / (Math.PI * Math.PI * n * n) : 0),
    note: '連続な波は係数が 1/n² で落ちるので収束が速い。滑らかさと高調波の減り方は直結している。',
  },
  sawtooth: {
    label: 'のこぎり波',
    tex: 'f(x)=\\dfrac{x}{\\pi}\\ (-\\pi<x<\\pi)',
    exact: (x) => {
      const t = ((((x + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
      return t / Math.PI;
    },
    coeff: (n) => ((-1) ** (n + 1) * 2) / (n * Math.PI),
    note: '係数は 1/n でしか落ちない。跳びがあるほど高い周波数まで必要になる。',
  },
};

/** 第N項までの部分和（すべて sin の級数＝奇関数） */
export function fourierPartialSum(waveform, x, N) {
  let s = 0;
  for (let n = 1; n <= N; n++) {
    const b = waveform.coeff(n);
    if (b !== 0) s += b * Math.sin(n * x);
  }
  return s;
}

/** 部分和の二乗平均平方根誤差。項を増やすと単調に減ることを確かめられる */
export function fourierError(waveform, N, samples = 2000) {
  let sum = 0;
  for (let i = 0; i < samples; i++) {
    const x = -Math.PI + (2 * Math.PI * i) / samples;
    const d = fourierPartialSum(waveform, x, N) - waveform.exact(x);
    sum += d * d;
  }
  return Math.sqrt(sum / samples);
}

// ── 複素関数の写像 ─────────────────────────────────
// 複素関数は「平面を平面へ変形する規則」。等角性が目で分かる。

export const COMPLEX_MAPS = {
  square: {
    label: 'z²',
    tex: 'w=z^2',
    fn: (x, y) => [x * x - y * y, 2 * x * y],
    note: '偏角が2倍、動径が2乗される。原点では等角性が壊れる（微分がゼロになる点）。',
  },
  inverse: {
    label: '1/z',
    tex: 'w=1/z',
    fn: (x, y) => {
      const r2 = Math.max(x * x + y * y, 1e-6);
      return [x / r2, -y / r2];
    },
    note: '原点が無限遠へ飛ぶ。直線と円が互いに移り合う（円円対応）。1位の極の典型。',
  },
  exp: {
    label: 'exp z',
    tex: 'w=e^{z}',
    fn: (x, y) => [Math.exp(x) * Math.cos(y), Math.exp(x) * Math.sin(y)],
    note: '縦線が円に、横線が原点から出る半直線に写る。虚部が角度になる——Eulerの公式そのもの。',
  },
  sqrt: {
    label: '√z',
    tex: 'w=\\sqrt{z}',
    fn: (x, y) => {
      const r = Math.hypot(x, y);
      const th = Math.atan2(y, x) / 2;
      const s = Math.sqrt(r);
      return [s * Math.cos(th), s * Math.sin(th)];
    },
    note: '一周すると値が戻らない。これが分岐点と分岐切断の正体で、リーマン面へつながる。',
  },
};

/** 直交格子が写像でどう歪むか。等角写像なら交点の直角が保たれる */
export function mapGrid(fn, { lines = 9, points = 60, extent = 1.6 } = {}) {
  const paths = [];
  for (let i = 0; i < lines; i++) {
    const c = -extent + (2 * extent * i) / (lines - 1);
    const horiz = [];
    const vert = [];
    for (let k = 0; k < points; k++) {
      const t = -extent + (2 * extent * k) / (points - 1);
      horiz.push(fn(t, c));
      vert.push(fn(c, t));
    }
    paths.push({ pts: horiz, kind: 'h' });
    paths.push({ pts: vert, kind: 'v' });
  }
  return paths;
}

// ── 2×2行列の固有値・固有ベクトル ───────────────────────
// 「変形しても向きが変わらない方向」を見つける操作が固有値問題。

export function eigen2x2(a, b, c, d) {
  const tr = a + d;
  const det = a * d - b * c;
  const disc = tr * tr - 4 * det;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    const l1 = (tr + s) / 2;
    const l2 = (tr - s) / 2;
    const vec = (l, index) => {
      // (A − λI)v = 0
      // Use the better-scaled row. A zero row occurs for diagonal/scalar matrices.
      const first = [b, l - a], second = [l - d, c];
      const n1 = Math.hypot(...first), n2 = Math.hypot(...second);
      if (n1 === 0 && n2 === 0) return index === 0 ? [1, 0] : [0, 1];
      const v = n1 >= n2 ? first : second;
      const n = Math.max(n1, n2);
      return [v[0] / n, v[1] / n];
    };
    return { real: true, values: [l1, l2], vectors: [vec(l1, 0), vec(l2, 1)], trace: tr, det };
  }
  const re = tr / 2;
  const im = Math.sqrt(-disc) / 2;
  return { real: false, values: [{ re, im }, { re, im: -im }], vectors: [], trace: tr, det };
}

/** 単位円が行列でどんな楕円に写るか */
export function mapUnitCircle(a, b, c, d, points = 120) {
  const out = [];
  for (let i = 0; i <= points; i++) {
    const t = (2 * Math.PI * i) / points;
    const x = Math.cos(t);
    const y = Math.sin(t);
    out.push([a * x + b * y, c * x + d * y]);
  }
  return out;
}

// ── テイラー展開 ───────────────────────────────────
// 「近くだけなら多項式で置き換えられる」。どこまで近くかが収束半径。

export const TAYLOR_TARGETS = {
  sin: {
    label: 'sin x', tex: '\\sin x', fn: Math.sin,
    term: (n, x) => (n % 2 === 0 ? 0 : ((-1) ** ((n - 1) / 2) * x ** n) / factorial(n)),
    radius: Infinity,
    note: '収束半径は無限大。ただし x が大きいと必要な項数が急増する。',
  },
  exp: {
    label: 'eˣ', tex: 'e^{x}', fn: Math.exp,
    term: (n, x) => x ** n / factorial(n),
    radius: Infinity,
    note: '全域で収束する。物理で指数関数の近似 1+x が多用される理由がここにある。',
  },
  log: {
    label: 'ln(1+x)', tex: '\\ln(1+x)', fn: (x) => Math.log(1 + x),
    term: (n, x) => (n === 0 ? 0 : ((-1) ** (n + 1) * x ** n) / n),
    radius: 1,
    note: '収束半径は1。x=−1 で対数が発散することが、そのまま半径を決めている。',
  },
  geom: {
    label: '1/(1−x)', tex: '\\dfrac{1}{1-x}', fn: (x) => 1 / (1 - x),
    term: (n, x) => x ** n,
    radius: 1,
    note: '|x|<1 でしか収束しない。摂動展開が「小さいパラメータ」を必要とする理由の最小模型。',
  },
};

function factorial(n) {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/** 次数 N までの部分和 */
export function taylorPartialSum(target, x, N) {
  let s = 0;
  for (let n = 0; n <= N; n++) s += target.term(n, x);
  return s;
}
