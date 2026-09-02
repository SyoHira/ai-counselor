import { StateVector } from './statevector.js';

// Unconditioned projective measurements require a mixed state. A fixed-size
// density matrix avoids exponentially many branches after repeated measurements.
export class DensityMatrix {
  constructor(state) {
    this.n = state.n;
    this.size = state.size;
    this.isDensityMatrix = true;
    this.re = new Float64Array(this.size ** 2);
    this.im = new Float64Array(this.size ** 2);
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const k = i * this.size + j;
        this.re[k] = state.re[i] * state.re[j] + state.im[i] * state.im[j];
        this.im[k] = state.im[i] * state.re[j] - state.re[i] * state.im[j];
      }
    }
  }

  // Apply U rho U† using the same gate implementation as the pure-state path.
  transform(apply) {
    const n = this.size;
    const vector = new StateVector(this.n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        vector.re[i] = this.re[i * n + j];
        vector.im[i] = this.im[i * n + j];
      }
      apply(vector);
      for (let i = 0; i < n; i++) {
        this.re[i * n + j] = vector.re[i];
        this.im[i * n + j] = vector.im[i];
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        vector.re[j] = this.re[i * n + j];
        vector.im[j] = -this.im[i * n + j];
      }
      apply(vector);
      for (let j = 0; j < n; j++) {
        this.re[i * n + j] = vector.re[j];
        this.im[i * n + j] = -vector.im[j];
      }
    }
    return this;
  }

  applyGate(matrix, target, controls = []) {
    return this.transform(vector => vector.applyGate(matrix, target, controls));
  }

  applySwap(a, b, controls = []) {
    return this.transform(vector => vector.applySwap(a, b, controls));
  }

  dephase(q) {
    const bit = 1 << q;
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        if ((i & bit) !== (j & bit)) {
          this.re[i * this.size + j] = 0;
          this.im[i * this.size + j] = 0;
        }
      }
    }
    return this;
  }

  probabilities() {
    return Float64Array.from({ length: this.size }, (_, i) => this.re[i * this.size + i]);
  }

  norm() {
    return Math.sqrt(this.probabilities().reduce((sum, p) => sum + p, 0));
  }

  purity() {
    return this.re.reduce((sum, re, i) => sum + re * re + this.im[i] ** 2, 0);
  }

  bloch(q) {
    const bit = 1 << q;
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < this.size; i++) {
      z += (i & bit ? -1 : 1) * this.re[i * this.size + i];
      if (!(i & bit)) {
        const k = i * this.size + (i | bit);
        x += 2 * this.re[k];
        y -= 2 * this.im[k];
      }
    }
    return { x, y, z, r: Math.hypot(x, y, z) };
  }

  entropy(q) {
    const r = Math.min(1, this.bloch(q).r);
    return [(1 + r) / 2, (1 - r) / 2]
      .reduce((sum, p) => sum - (p > 1e-12 ? p * Math.log2(p) : 0), 0);
  }
}
