// 1量子ビットをBlochベクトルで扱うユーティリティ。
// 混合状態（デコヒーレンス後）も表せるので、純粋状態しか持てない状態ベクトルより
// 「開放系の量子ビット」の教材に向く。 ρ = (I + r·σ)/2

export function rotate(r, axis, angle) {
  const [ax, ay, az] = normalize(axis);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dot = ax * r.x + ay * r.y + az * r.z;
  // Rodriguesの回転公式
  return {
    x: r.x * c + (ay * r.z - az * r.y) * s + ax * dot * (1 - c),
    y: r.y * c + (az * r.x - ax * r.z) * s + ay * dot * (1 - c),
    z: r.z * c + (ax * r.y - ay * r.x) * s + az * dot * (1 - c),
  };
}

function normalize([x, y, z]) {
  const n = Math.hypot(x, y, z) || 1;
  return [x / n, y / n, z / n];
}

const R2 = Math.SQRT1_2;

export const QUBIT_GATES = {
  X: { label: 'X', axis: [1, 0, 0], angle: Math.PI, desc: 'x軸まわりπ回転（ビット反転）' },
  Y: { label: 'Y', axis: [0, 1, 0], angle: Math.PI, desc: 'y軸まわりπ回転' },
  Z: { label: 'Z', axis: [0, 0, 1], angle: Math.PI, desc: 'z軸まわりπ回転（位相反転）' },
  H: { label: 'H', axis: [R2, 0, R2], angle: Math.PI, desc: '(x+z)/√2 軸まわりπ回転。|0⟩↔|+⟩' },
  S: { label: 'S', axis: [0, 0, 1], angle: Math.PI / 2, desc: 'z軸まわりπ/2回転' },
  T: { label: 'T', axis: [0, 0, 1], angle: Math.PI / 4, desc: 'z軸まわりπ/4回転' },
  RX: { label: 'Rx', axis: [1, 0, 0], param: true, desc: 'x軸まわり任意角回転' },
  RY: { label: 'Ry', axis: [0, 1, 0], param: true, desc: 'y軸まわり任意角回転' },
  RZ: { label: 'Rz', axis: [0, 0, 1], param: true, desc: 'z軸まわり任意角回転' },
};

export function applyGate(r, name, param = Math.PI / 2) {
  const g = QUBIT_GATES[name];
  if (!g) return r;
  return rotate(r, g.axis, g.param ? param : g.angle);
}

/** 振幅減衰（T1緩和）：確率γで |1⟩ → |0⟩ */
export function amplitudeDamping(r, gamma) {
  const s = Math.sqrt(Math.max(0, 1 - gamma));
  return { x: r.x * s, y: r.y * s, z: r.z * (1 - gamma) + gamma };
}

/** 位相緩和（T2デコヒーレンス）：横成分だけが減衰する */
export function phaseDamping(r, lambda) {
  const s = Math.sqrt(Math.max(0, 1 - lambda));
  return { x: r.x * s, y: r.y * s, z: r.z };
}

/** 脱分極ノイズ：確率pで完全混合へ */
export function depolarize(r, p) {
  const k = 1 - p;
  return { x: r.x * k, y: r.y * k, z: r.z * k };
}

export const BASES = {
  Z: { label: 'Z（計算基底）', axis: [0, 0, 1], kets: ['0', '1'] },
  X: { label: 'X（±基底）', axis: [1, 0, 0], kets: ['+', '−'] },
  Y: { label: 'Y（±i基底）', axis: [0, 1, 0], kets: ['+i', '−i'] },
};

/** 軸 n に沿った測定の確率 [p+, p−] */
export function measureProbs(r, axis) {
  const [ax, ay, az] = normalize(axis);
  const dot = ax * r.x + ay * r.y + az * r.z;
  return [(1 + dot) / 2, (1 - dot) / 2];
}

/** 射影測定を行い、状態を固有ベクトルへ収縮させる */
export function measure(r, axis, rng = Math.random) {
  const [p] = measureProbs(r, axis);
  const plus = rng() < p;
  const [ax, ay, az] = normalize(axis);
  const sign = plus ? 1 : -1;
  return { outcome: plus ? 0 : 1, state: { x: ax * sign, y: ay * sign, z: az * sign } };
}

export function purity(r) {
  const r2 = r.x * r.x + r.y * r.y + r.z * r.z;
  return (1 + r2) / 2;
}

export function vonNeumannEntropy(r) {
  const len = Math.min(1, Math.hypot(r.x, r.y, r.z));
  const l0 = (1 + len) / 2;
  const l1 = (1 - len) / 2;
  const h = (x) => (x <= 1e-12 ? 0 : -x * Math.log2(x));
  return h(l0) + h(l1);
}

/** 純粋状態のとき、Bloch角と振幅表現を返す */
export function stateDescription(r) {
  const len = Math.hypot(r.x, r.y, r.z);
  const theta = Math.acos(Math.max(-1, Math.min(1, r.z / (len || 1))));
  const phi = Math.atan2(r.y, r.x);
  const a = Math.cos(theta / 2);
  const b = Math.sin(theta / 2);
  return {
    len,
    theta,
    phi,
    pure: len > 0.999,
    ket: `${a.toFixed(3)}|0⟩ + ${b.toFixed(3)}·exp(i·${(phi / Math.PI).toFixed(2)}π)|1⟩`,
  };
}
