// 波束の時間発展（split-operator 法）。
// U(dt) ≈ e^{-iV dt/2ħ} · F⁻¹ e^{-iħk²dt/2m} F · e^{-iV dt/2ħ}  （誤差 O(dt³)）

/** in-place 基数2 FFT。sign=-1 が順変換、+1 が逆変換（1/Nは付けない）。 */
export function fft(re, im, sign = -1) {
  const n = re.length;
  if ((n & (n - 1)) !== 0) throw new Error('FFT length must be a power of 2');
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

/** ガウス波束 ψ(x) = (2πσ²)^(-1/4) exp(−(x−x₀)²/4σ² + ik₀x) */
export function gaussianPacket(x, { x0 = -10, sigma = 1.2, k0 = 3 }) {
  const n = x.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const norm = Math.pow(2 * Math.PI * sigma * sigma, -0.25);
  for (let i = 0; i < n; i++) {
    const env = norm * Math.exp(-((x[i] - x0) ** 2) / (4 * sigma * sigma));
    re[i] = env * Math.cos(k0 * x[i]);
    im[i] = env * Math.sin(k0 * x[i]);
  }
  return { re, im };
}

/**
 * split-operator 用の伝播器を用意する。
 * @param {Float64Array} x 等間隔グリッド（周期境界とみなす。長さは2のべき）
 */
export function makePropagator(x, V, dt, { hbar = 1, mass = 1 } = {}) {
  const n = x.length;
  const dx = x[1] - x[0];
  const halfV = new Float64Array(2 * n); // [cos, sin] を交互に
  for (let i = 0; i < n; i++) {
    const ph = (-V[i] * dt) / (2 * hbar);
    halfV[2 * i] = Math.cos(ph);
    halfV[2 * i + 1] = Math.sin(ph);
  }
  const kin = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) {
    const j = i < n / 2 ? i : i - n;
    const k = (2 * Math.PI * j) / (n * dx);
    const ph = (-hbar * k * k * dt) / (2 * mass);
    kin[2 * i] = Math.cos(ph);
    kin[2 * i + 1] = Math.sin(ph);
  }
  return { halfV, kin, n, dx };
}

function mulPhase(re, im, table) {
  for (let i = 0; i < re.length; i++) {
    const cr = table[2 * i], ci = table[2 * i + 1];
    const r = re[i] * cr - im[i] * ci;
    im[i] = re[i] * ci + im[i] * cr;
    re[i] = r;
  }
}

/** 1ステップ発展させる（re, im を破壊的に更新） */
export function step(re, im, prop) {
  const { halfV, kin, n } = prop;
  mulPhase(re, im, halfV);
  fft(re, im, -1);
  mulPhase(re, im, kin);
  fft(re, im, +1);
  for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  mulPhase(re, im, halfV);
}

/** 確率密度 |ψ|² */
export function density(re, im) {
  const p = new Float64Array(re.length);
  for (let i = 0; i < re.length; i++) p[i] = re[i] * re[i] + im[i] * im[i];
  return p;
}

/** 区間 [a, b] に見つかる確率 */
export function probabilityIn(x, re, im, a, b) {
  const dx = x[1] - x[0];
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] >= a && x[i] <= b) s += (re[i] * re[i] + im[i] * im[i]) * dx;
  }
  return s;
}

/** 期待値 ⟨x⟩ と広がり Δx */
export function positionStats(x, re, im) {
  const dx = x[1] - x[0];
  let n = 0, m1 = 0, m2 = 0;
  for (let i = 0; i < x.length; i++) {
    const p = (re[i] * re[i] + im[i] * im[i]) * dx;
    n += p;
    m1 += p * x[i];
    m2 += p * x[i] * x[i];
  }
  const mean = m1 / n;
  return { mean, sigma: Math.sqrt(Math.max(0, m2 / n - mean * mean)), norm: n };
}
