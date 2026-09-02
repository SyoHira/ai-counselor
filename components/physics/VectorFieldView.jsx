'use client';

import { useMemo } from 'react';
import { sampleField, divCurlNumeric } from '@/lib/physics/mathviz';

// ベクトル場を矢印で、発散または回転を背景の色で描く。
// 「式のどこが湧き出しで、どこが渦なのか」を同じ絵の中で対応づけるのが狙い。

const EXTENT = 2;
const SIZE = 420;

function toScreen(x, y) {
  return [((x + EXTENT) / (2 * EXTENT)) * SIZE, ((EXTENT - y) / (2 * EXTENT)) * SIZE];
}

function heatColor(v, scale) {
  const t = Math.max(-1, Math.min(1, v / (scale || 1)));
  if (t >= 0) return `rgba(124,140,255,${(t * 0.55).toFixed(3)})`;
  return `rgba(244,114,182,${(-t * 0.55).toFixed(3)})`;
}

export default function VectorFieldView({ field, overlay = 'none', showFlux = false, fluxRadius = 1 }) {
  const { arrows, max } = useMemo(() => sampleField(field.fn, { n: 15, extent: EXTENT }), [field]);

  // 原点に特異点がある場は、そこだけ数値微分が破綻するので除外して描く
  const hole = field.singular ? 0.42 : 0;

  const cells = useMemo(() => {
    if (overlay === 'none') return [];
    const n = 26;
    const out = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = -EXTENT + (2 * EXTENT * (i + 0.5)) / n;
        const y = -EXTENT + (2 * EXTENT * (j + 0.5)) / n;
        if (hole > 0 && Math.hypot(x, y) < hole) continue; // 特異点のある場だけ中心を抜く
        const { div, curl } = divCurlNumeric(field.fn, x, y);
        const v = overlay === 'div' ? div : curl;
        if (Number.isFinite(v)) out.push({ x, y, v });
      }
    }
    // 自動スケールだと、解析的にゼロの場でも丸め誤差が色として増幅されてしまう。
    // 上位5%を外した値を基準にし、さらに絶対的な下限を設けて、ノイズは無色のままにする。
    const sorted = out.map((c) => Math.abs(c.v)).sort((a, b) => a - b);
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    if (p95 < 1e-6) return [];
    const scale = Math.max(p95, 1e-3);
    return out.map((c) => ({ ...c, scale, size: SIZE / n + 0.6 }));
  }, [field, overlay, hole]);

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-auto max-w-[420px] mx-auto block">
      <rect width={SIZE} height={SIZE} fill="#0b0e18" rx="10" />

      {cells.map((c, i) => {
        const [sx, sy] = toScreen(c.x, c.y);
        return (
          <rect key={i} x={sx - c.size / 2} y={sy - c.size / 2} width={c.size} height={c.size}
            fill={heatColor(c.v, c.scale)} />
        );
      })}

      {[-1, 0, 1].map((g) => {
        const [, gy] = toScreen(0, g);
        const [gx] = toScreen(g, 0);
        return (
          <g key={g}>
            <line x1={0} y1={gy} x2={SIZE} y2={gy} stroke="#1c2236" strokeWidth="1" />
            <line x1={gx} y1={0} x2={gx} y2={SIZE} stroke="#1c2236" strokeWidth="1" />
          </g>
        );
      })}

      {arrows.map((a, i) => {
        const [sx, sy] = toScreen(a.x, a.y);
        const norm = a.mag / (max || 1);
        const len = 11 * Math.sqrt(Math.min(1, norm)) + 2;
        const ux = a.mag > 1e-9 ? a.u / a.mag : 0;
        const uy = a.mag > 1e-9 ? a.v / a.mag : 0;
        const ex = sx + ux * len;
        const ey = sy - uy * len;
        const op = 0.35 + 0.6 * Math.sqrt(Math.min(1, norm));
        return (
          <g key={i} opacity={op}>
            <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="#4fd1c5" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx={ex} cy={ey} r="1.9" fill="#4fd1c5" />
          </g>
        );
      })}

      {hole > 0 && (
        <g>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={(hole / (2 * EXTENT)) * SIZE}
            fill="#0b0e18" stroke="#3a4266" strokeWidth="1" strokeDasharray="2 3" />
          <text x={SIZE / 2} y={SIZE / 2 + 3.5} textAnchor="middle" fontSize="9" fill="#6b7599">特異点</text>
        </g>
      )}

      {showFlux && (
        <circle
          cx={SIZE / 2} cy={SIZE / 2}
          r={(fluxRadius / (2 * EXTENT)) * SIZE}
          fill="none" stroke="#fbbf24" strokeWidth="1.6" strokeDasharray="5 4"
        />
      )}

      <text x={SIZE - 8} y={SIZE / 2 - 6} textAnchor="end" fontSize="10" fill="#6b7599">x</text>
      <text x={SIZE / 2 + 6} y={12} fontSize="10" fill="#6b7599">y</text>
    </svg>
  );
}
