// 1量子ビットゲートは複素2x2行列を平坦化した長さ8の配列で表す。
// [a.re, a.im, b.re, b.im, c.re, c.im, d.re, d.im]  ->  [[a, b], [c, d]]

const R2 = Math.SQRT1_2;

export const M = {
  I: [1, 0, 0, 0, 0, 0, 1, 0],
  X: [0, 0, 1, 0, 1, 0, 0, 0],
  Y: [0, 0, 0, -1, 0, 1, 0, 0],
  Z: [1, 0, 0, 0, 0, 0, -1, 0],
  H: [R2, 0, R2, 0, R2, 0, -R2, 0],
  S: [1, 0, 0, 0, 0, 0, 0, 1],
  Sdg: [1, 0, 0, 0, 0, 0, 0, -1],
  T: [1, 0, 0, 0, 0, 0, R2, R2],
  Tdg: [1, 0, 0, 0, 0, 0, R2, -R2],
  SX: [0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5], // √X
};

export function Rx(theta) {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return [c, 0, 0, -s, 0, -s, c, 0];
}

export function Ry(theta) {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return [c, 0, -s, 0, s, 0, c, 0];
}

export function Rz(theta) {
  const c = Math.cos(theta / 2);
  const s = Math.sin(theta / 2);
  return [c, -s, 0, 0, 0, 0, c, s];
}

export function Phase(theta) {
  return [1, 0, 0, 0, 0, 0, Math.cos(theta), Math.sin(theta)];
}

// UIとシミュレータが共有するゲート定義表。
export const GATES = {
  H: { label: 'H', tex: 'H', arity: 1, matrix: () => M.H, desc: 'アダマール：|0⟩を重ね合わせ (|0⟩+|1⟩)/√2 に写す' },
  X: { label: 'X', tex: 'X', arity: 1, matrix: () => M.X, desc: 'ビット反転（パウリX）。Blochでx軸まわりπ回転' },
  Y: { label: 'Y', tex: 'Y', arity: 1, matrix: () => M.Y, desc: 'パウリY。y軸まわりπ回転' },
  Z: { label: 'Z', tex: 'Z', arity: 1, matrix: () => M.Z, desc: '位相反転（パウリZ）。|1⟩に -1 を掛ける' },
  S: { label: 'S', tex: 'S', arity: 1, matrix: () => M.S, desc: 'π/2 位相ゲート（√Z）' },
  Sdg: { label: 'S†', tex: 'S^{\\dagger}', arity: 1, matrix: () => M.Sdg, desc: 'Sの逆' },
  T: { label: 'T', tex: 'T', arity: 1, matrix: () => M.T, desc: 'π/4 位相ゲート。Clifford+Tで普遍集合を作る鍵' },
  Tdg: { label: 'T†', tex: 'T^{\\dagger}', arity: 1, matrix: () => M.Tdg, desc: 'Tの逆' },
  SX: { label: '√X', tex: '\\sqrt{X}', arity: 1, matrix: () => M.SX, desc: '√X。超伝導量子ビットのネイティブゲート' },
  RX: { label: 'Rx', tex: 'R_x(\\theta)', arity: 1, param: true, matrix: (t) => Rx(t), desc: 'x軸まわり任意角回転' },
  RY: { label: 'Ry', tex: 'R_y(\\theta)', arity: 1, param: true, matrix: (t) => Ry(t), desc: 'y軸まわり任意角回転' },
  RZ: { label: 'Rz', tex: 'R_z(\\theta)', arity: 1, param: true, matrix: (t) => Rz(t), desc: 'z軸まわり任意角回転' },
  P: { label: 'P', tex: 'P(\\theta)', arity: 1, param: true, matrix: (t) => Phase(t), desc: '相対位相 e^{iθ} を |1⟩ に付与' },
};
