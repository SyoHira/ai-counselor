'use client';

// 軽量な折れ線プロット。SVGのviewBoxで描き、幅は親要素に追従する。

const W = 640;
const PAD = { l: 44, r: 12, t: 12, b: 28 };

export default function Plot({
  series = [],
  xDomain,
  yDomain,
  height = 260,
  xLabel = '',
  yLabel = '',
  vlines = [],
  hlines = [],
  grid = true,
}) {
  const [x0, x1] = xDomain;
  const [y0, y1] = yDomain;
  const iw = W - PAD.l - PAD.r;
  const ih = height - PAD.t - PAD.b;
  const sx = (x) => PAD.l + ((x - x0) / (x1 - x0 || 1)) * iw;
  const sy = (y) => PAD.t + ih - ((y - y0) / (y1 - y0 || 1)) * ih;

  const path = (points) => {
    if (!points.length) return '';
    let d = `M ${sx(points[0][0]).toFixed(2)} ${sy(points[0][1]).toFixed(2)}`;
    for (let i = 1; i < points.length; i++) d += ` L ${sx(points[i][0]).toFixed(2)} ${sy(points[i][1]).toFixed(2)}`;
    return d;
  };

  const areaPath = (points) => {
    if (!points.length) return '';
    const base = sy(Math.max(y0, Math.min(0, y1)));
    let d = `M ${sx(points[0][0]).toFixed(2)} ${base.toFixed(2)}`;
    for (const [x, y] of points) d += ` L ${sx(x).toFixed(2)} ${sy(y).toFixed(2)}`;
    d += ` L ${sx(points[points.length - 1][0]).toFixed(2)} ${base.toFixed(2)} Z`;
    return d;
  };

  const xTicks = ticks(x0, x1, 5);
  const yTicks = ticks(y0, y1, 4);

  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <rect x={PAD.l} y={PAD.t} width={iw} height={ih} fill="rgba(124,140,255,0.03)" />
      {grid && yTicks.map((t) => (
        <line key={`gy${t}`} x1={PAD.l} y1={sy(t)} x2={W - PAD.r} y2={sy(t)} stroke="#1c2236" strokeWidth="1" />
      ))}
      {grid && xTicks.map((t) => (
        <line key={`gx${t}`} x1={sx(t)} y1={PAD.t} x2={sx(t)} y2={PAD.t + ih} stroke="#1c2236" strokeWidth="1" />
      ))}

      {hlines.map((h, i) => (
        <g key={`h${i}`}>
          <line x1={PAD.l} y1={sy(h.y)} x2={W - PAD.r} y2={sy(h.y)}
            stroke={h.color || '#4fd1c5'} strokeWidth="1" strokeDasharray={h.dash || '4 4'} opacity={h.opacity ?? 0.8} />
          {h.label && (
            <text x={W - PAD.r - 2} y={sy(h.y) - 3} textAnchor="end" fontSize="9" fill={h.color || '#4fd1c5'}>{h.label}</text>
          )}
        </g>
      ))}
      {vlines.map((v, i) => (
        <line key={`v${i}`} x1={sx(v.x)} y1={PAD.t} x2={sx(v.x)} y2={PAD.t + ih}
          stroke={v.color || '#f472b6'} strokeWidth="1" strokeDasharray="3 3" opacity="0.7" />
      ))}

      {series.map((s, i) => (
        <g key={i}>
          {s.fill && <path d={areaPath(s.points)} fill={s.color} opacity={s.fillOpacity ?? 0.16} />}
          <path
            d={path(s.points)} fill="none" stroke={s.color}
            strokeWidth={s.width || 1.6} strokeDasharray={s.dash || undefined}
            opacity={s.opacity ?? 1} vectorEffect="non-scaling-stroke"
          />
        </g>
      ))}

      <line x1={PAD.l} y1={PAD.t + ih} x2={W - PAD.r} y2={PAD.t + ih} stroke="#2f3757" strokeWidth="1" />
      <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + ih} stroke="#2f3757" strokeWidth="1" />

      {xTicks.map((t) => (
        <text key={`tx${t}`} x={sx(t)} y={height - 10} textAnchor="middle" fontSize="9.5" fill="#96a0c2">
          {fmt(t)}
        </text>
      ))}
      {yTicks.map((t) => (
        <text key={`ty${t}`} x={PAD.l - 5} y={sy(t) + 3} textAnchor="end" fontSize="9.5" fill="#96a0c2">
          {fmt(t)}
        </text>
      ))}
      {xLabel && <text x={W - PAD.r} y={height - 10} textAnchor="end" fontSize="9.5" fill="#6b7599">{xLabel}</text>}
      {yLabel && <text x={4} y={PAD.t - 2} textAnchor="start" fontSize="9.5" fill="#6b7599">{yLabel}</text>}
    </svg>
  );
}

function ticks(a, b, n) {
  const out = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return out;
}

function fmt(v) {
  if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(1);
  return Number(v.toFixed(Math.abs(v) < 1 ? 2 : 1)).toString();
}
