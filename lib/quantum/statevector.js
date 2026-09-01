// n量子ビット状態ベクトルシミュレータ。
// 振幅は2本のFloat64Array（実部・虚部）で保持する。
// ビット規約：量子ビット q は基底インデックス i の第 q ビット（最下位が q=0）。
// 表示ラベルは q0 を左端に並べる（回路の上のワイヤが左端）。

export class StateVector {
  constructor(nQubits) {
    if (nQubits < 1 || nQubits > 12) throw new Error('nQubits must be 1..12');
    this.n = nQubits;
    this.size = 1 << nQubits;
    this.re = new Float64Array(this.size);
    this.im = new Float64Array(this.size);
    this.re[0] = 1;
  }

  static fromArrays(n, re, im) {
    const s = new StateVector(n);
    s.re.set(re);
    s.im.set(im);
    return s;
  }

  clone() {
    return StateVector.fromArrays(this.n, this.re, this.im);
  }

  reset() {
    this.re.fill(0);
    this.im.fill(0);
    this.re[0] = 1;
    return this;
  }

  /**
   * 1量子ビットゲート（必要なら制御付き）を適用する。
   * @param {number[]} m 長さ8の平坦化2x2複素行列
   * @param {number} target 対象量子ビット
   * @param {number[]} controls 制御量子ビット（すべて|1⟩のときだけ作用）
   */
  applyGate(m, target, controls = []) {
    const t = 1 << target;
    let cmask = 0;
    for (const c of controls) {
      if (c === target) throw new Error('control equals target');
      cmask |= 1 << c;
    }
    const [ar, ai, br, bi, cr, ci, dr, di] = m;
    const { re, im, size } = this;
    for (let i = 0; i < size; i++) {
      if (i & t) continue;
      if ((i & cmask) !== cmask) continue;
      const j = i | t;
      const x0r = re[i], x0i = im[i], x1r = re[j], x1i = im[j];
      re[i] = ar * x0r - ai * x0i + br * x1r - bi * x1i;
      im[i] = ar * x0i + ai * x0r + br * x1i + bi * x1r;
      re[j] = cr * x0r - ci * x0i + dr * x1r - di * x1i;
      im[j] = cr * x0i + ci * x0r + dr * x1i + di * x1r;
    }
    return this;
  }

  /** SWAP（制御付きも可） */
  applySwap(a, b, controls = []) {
    if (a === b) return this;
    const ma = 1 << a;
    const mb = 1 << b;
    let cmask = 0;
    for (const c of controls) cmask |= 1 << c;
    const { re, im, size } = this;
    for (let i = 0; i < size; i++) {
      if ((i & ma) === 0 || (i & mb) !== 0) continue; // a=1,b=0 の側だけ走査
      if ((i & cmask) !== cmask) continue;
      const j = (i & ~ma) | mb;
      let tr = re[i]; re[i] = re[j]; re[j] = tr;
      tr = im[i]; im[i] = im[j]; im[j] = tr;
    }
    return this;
  }

  /** 全基底状態の測定確率 */
  probabilities() {
    const p = new Float64Array(this.size);
    for (let i = 0; i < this.size; i++) p[i] = this.re[i] * this.re[i] + this.im[i] * this.im[i];
    return p;
  }

  norm() {
    let s = 0;
    for (let i = 0; i < this.size; i++) s += this.re[i] * this.re[i] + this.im[i] * this.im[i];
    return Math.sqrt(s);
  }

  normalize() {
    const nrm = this.norm();
    if (nrm === 0) throw new Error('zero state');
    for (let i = 0; i < this.size; i++) { this.re[i] /= nrm; this.im[i] /= nrm; }
    return this;
  }

  /** 量子ビット q の縮約密度行列 ρ = [[r00, ρ01],[ρ01*, r11]] */
  reduced1(q) {
    const t = 1 << q;
    let r00 = 0, r11 = 0, o_re = 0, o_im = 0;
    for (let i = 0; i < this.size; i++) {
      const a_re = this.re[i], a_im = this.im[i];
      const p = a_re * a_re + a_im * a_im;
      if (i & t) { r11 += p; continue; }
      r00 += p;
      const j = i | t;
      // ρ01 = Σ_env a_{0,env} · conj(a_{1,env})
      o_re += a_re * this.re[j] + a_im * this.im[j];
      o_im += a_im * this.re[j] - a_re * this.im[j];
    }
    return { r00, r11, o_re, o_im };
  }

  /** Blochベクトル (x, y, z) と純度 r = |v| */
  bloch(q) {
    const { r00, r11, o_re, o_im } = this.reduced1(q);
    const x = 2 * o_re;
    const y = -2 * o_im;
    const z = r00 - r11;
    return { x, y, z, r: Math.sqrt(x * x + y * y + z * z) };
  }

  /** 量子ビット q と残りの間のエンタングルメント・エントロピー（von Neumann, 単位はビット） */
  entropy(q) {
    const { r } = this.bloch(q);
    const l0 = (1 + r) / 2;
    const l1 = (1 - r) / 2;
    const h = (x) => (x <= 1e-12 ? 0 : -x * Math.log2(x));
    return h(l0) + h(l1);
  }

  /** 量子ビット q を射影測定し、状態を収縮させる。戻り値は 0 か 1。 */
  measureQubit(q, rng = Math.random) {
    const t = 1 << q;
    let p1 = 0;
    for (let i = 0; i < this.size; i++) {
      if (i & t) p1 += this.re[i] * this.re[i] + this.im[i] * this.im[i];
    }
    const outcome = rng() < p1 ? 1 : 0;
    const p = outcome === 1 ? p1 : 1 - p1;
    if (p < 1e-15) {
      // 数値的にゼロ確率の枝を引いた場合は反対の結果に倒す
      return this.measureQubit(q, () => (outcome === 1 ? 1 : 0));
    }
    const s = 1 / Math.sqrt(p);
    for (let i = 0; i < this.size; i++) {
      const bit = (i & t) ? 1 : 0;
      if (bit === outcome) { this.re[i] *= s; this.im[i] *= s; }
      else { this.re[i] = 0; this.im[i] = 0; }
    }
    return outcome;
  }

  /** 全量子ビットを測定（状態は収縮する）。戻り値は基底インデックス。 */
  measureAll(rng = Math.random) {
    const p = this.probabilities();
    const u = rng();
    let acc = 0;
    let idx = this.size - 1;
    for (let i = 0; i < this.size; i++) {
      acc += p[i];
      if (u <= acc) { idx = i; break; }
    }
    this.re.fill(0); this.im.fill(0);
    this.re[idx] = 1;
    return idx;
  }
}

/** 基底インデックスを q0 から並べたビット文字列にする */
export function basisLabel(index, n) {
  let s = '';
  for (let q = 0; q < n; q++) s += (index >> q) & 1;
  return s;
}

/** ビット文字列（q0が左端）を基底インデックスへ */
export function labelToIndex(label) {
  let idx = 0;
  for (let q = 0; q < label.length; q++) if (label[q] === '1') idx |= 1 << q;
  return idx;
}

/** 振幅を「0.707 + 0.000i」のような表示文字列にする */
export function formatAmplitude(re, im, digits = 3) {
  const r = re.toFixed(digits);
  const i = Math.abs(im).toFixed(digits);
  const sign = im < 0 ? '−' : '+';
  return `${r} ${sign} ${i}i`;
}

/** 決定論的な擬似乱数（テストと再現可能なショット生成用） */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
