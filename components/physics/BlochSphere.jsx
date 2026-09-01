'use client';

import { useMemo } from 'react';

// 単位球を等角投影で描く。az=35°, el=20° の固定視点。
const AZ = (35 * Math.PI) / 180;
const EL = (20 * Math.PI) / 180;

function project(p, R, cx, cy) {
  const [x, y, z] = p;
  const u = [-Math.sin(AZ), Math.cos(AZ), 0];
  const v = [-Math.cos(AZ) * Math.sin(EL), -Math.sin(AZ) * Math.sin(EL), Math.cos(EL)];
  const px = x * u[0] + y * u[1] + z * u[2];
  const py = x * v[0] + y * v[1] + z * v[2];
  return [cx + R * px, cy - R * py];
}

function circlePath(axis, R, cx, cy, steps = 64) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = (2 * Math.PI * i) / steps;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const p = axis === 'xy' ? [c, s, 0] : axis === 'xz' ? [c, 0, s] : [0, c, s];
    pts.push(project(p, R, cx, cy));
  }
  return `M ${pts.map(([a, b]) => `${a.toFixed(2)} ${b.toFixed(2)}`).join(' L ')}`;
}

export default function BlochSphere({
  vector = { x: 0, y: 0, z: 1 },
  size = 220,
  label = '',
  trail = [],
  showProjection = true,
}) {
  const R = size * 0.36;
  const cx = size / 2;
  const cy = size / 2;

  const geo = useMemo(() => ({
    equator: circlePath('xy', R, cx, cy),
    meridianXZ: circlePath('xz', R, cx, cy),
    meridianYZ: circlePath('yz', R, cx, cy),
    axes: {
      x: [project([-1, 0, 0], R, cx, cy), project([1, 0, 0], R, cx, cy)],
      y: [project([0, -1, 0], R, cx, cy), project([0, 1, 0], R, cx, cy)],
      z: [project([0, 0, -1], R, cx, cy), project([0, 0, 1], R, cx, cy)],
    },
    labels: {
      zp: project([0, 0, 1.22], R, cx, cy),
      zm: project([0, 0, -1.22], R, cx, cy),
      xp: project([1.24, 0, 0], R, cx, cy),
      yp: project([0, 1.24, 0], R, cx, cy),
    },
  }), [R, cx, cy]);

  const v = [vector.x || 0, vector.y || 0, vector.z || 0];
  const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
  const tip = project(v, R, cx, cy);
  const foot = project([v[0], v[1], 0], R, cx, cy);
  const center = project([0, 0, 0], R, cx, cy);

  const trailPath = trail.length > 1
    ? `M ${trail.map((t) => project([t.x, t.y, t.z], R, cx, cy).map((n) => n.toFixed(2)).join(' ')).join(' L ')}`
    : null;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="select-none">
      <circle cx={cx} cy={cy} r={R} fill="rgba(124,140,255,0.05)" stroke="#252b45" strokeWidth="1" />
      <path d={geo.meridianXZ} fill="none" stroke="#252b45" strokeWidth="0.8" />
      <path d={geo.meridianYZ} fill="none" stroke="#252b45" strokeWidth="0.8" />
      <path d={geo.equator} fill="none" stroke="#2f3757" strokeWidth="1" />

      {['x', 'y', 'z'].map((k) => (
        <line
          key={k}
          x1={geo.axes[k][0][0]} y1={geo.axes[k][0][1]}
          x2={geo.axes[k][1][0]} y2={geo.axes[k][1][1]}
          stroke="#2f3757" strokeWidth="0.8" strokeDasharray="3 3"
        />
      ))}

      <text x={geo.labels.zp[0]} y={geo.labels.zp[1]} textAnchor="middle" fontSize="10" fill="#96a0c2">|0⟩</text>
      <text x={geo.labels.zm[0]} y={geo.labels.zm[1] + 4} textAnchor="middle" fontSize="10" fill="#96a0c2">|1⟩</text>
      <text x={geo.labels.xp[0]} y={geo.labels.xp[1] + 4} textAnchor="middle" fontSize="10" fill="#96a0c2">x</text>
      <text x={geo.labels.yp[0]} y={geo.labels.yp[1] + 4} textAnchor="middle" fontSize="10" fill="#96a0c2">y</text>

      {trailPath && <path d={trailPath} fill="none" stroke="#4fd1c5" strokeWidth="1.2" opacity="0.5" />}

      {showProjection && len > 0.02 && (
        <>
          <line x1={center[0]} y1={center[1]} x2={foot[0]} y2={foot[1]} stroke="#4fd1c5" strokeWidth="0.8" strokeDasharray="2 3" opacity="0.6" />
          <line x1={foot[0]} y1={foot[1]} x2={tip[0]} y2={tip[1]} stroke="#4fd1c5" strokeWidth="0.8" strokeDasharray="2 3" opacity="0.6" />
        </>
      )}

      <line x1={center[0]} y1={center[1]} x2={tip[0]} y2={tip[1]} stroke="#7c8cff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx={tip[0]} cy={tip[1]} r="4.5" fill="#7c8cff" />
      <circle cx={center[0]} cy={center[1]} r="2" fill="#96a0c2" />

      {label && <text x={cx} y={size - 6} textAnchor="middle" fontSize="10.5" fill="#96a0c2">{label}</text>}
    </svg>
  );
}
