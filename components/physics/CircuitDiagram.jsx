'use client';

import { GATES } from '@/lib/quantum/gates';

const CELL = 44;
const LEFT = 54;

function involved(op) {
  switch (op.kind) {
    case 'gate': return [op.target, ...(op.controls || [])];
    case 'swap': return [op.target, op.target2, ...(op.controls || [])];
    case 'measure': return [op.target];
    default: return [];
  }
}

function gateLabel(op) {
  if (op.kind === 'measure') return 'M';
  if (op.kind === 'swap') return '×';
  const def = GATES[op.gate];
  if (!def) return op.gate;
  if (def.param && typeof op.param === 'number') {
    const turns = op.param / Math.PI;
    const nice = Math.abs(turns - Math.round(turns * 4) / 4) < 1e-6
      ? `${Math.round(turns * 4) / 4}π`.replace('1π', 'π').replace('0.5π', 'π/2').replace('0.25π', 'π/4').replace('0.75π', '3π/4')
      : op.param.toFixed(2);
    return `${def.label}(${nice})`;
  }
  return def.label;
}

export default function CircuitDiagram({ circuit, activeStep = null, onSelect, onRemove }) {
  const { n, ops } = circuit;
  const cols = Math.max(ops.length, 4);
  const width = LEFT + cols * CELL + 8;
  const height = n * CELL + 12;

  return (
    <div className="overflow-x-auto no-scrollbar">
      <svg width={width} height={height} className="select-none" style={{ minWidth: '100%' }}>
        {/* 量子ビットのワイヤ */}
        {Array.from({ length: n }, (_, q) => {
          const y = q * CELL + CELL / 2;
          return (
            <g key={q}>
              <text x="4" y={y + 4} fontSize="11" fill="#96a0c2" className="font-mono">q{q}</text>
              <text x="26" y={y + 4} fontSize="11" fill="#4a5378">|0⟩</text>
              <line x1={LEFT - 4} y1={y} x2={width - 6} y2={y} stroke="#252b45" strokeWidth="1.2" />
            </g>
          );
        })}

        {ops.map((op, i) => {
          const x = LEFT + i * CELL + CELL / 2;
          const qs = involved(op);
          const lo = Math.min(...qs);
          const hi = Math.max(...qs);
          const isActive = activeStep === i;
          const isPast = activeStep !== null && activeStep >= i;

          if (op.kind === 'barrier') {
            return (
              <line key={i} x1={x} y1={4} x2={x} y2={height - 8} stroke="#3a4266" strokeWidth="1" strokeDasharray="4 4" />
            );
          }

          return (
            <g
              key={i}
              onClick={() => onSelect?.(i)}
              onDoubleClick={() => onRemove?.(i)}
              className={onSelect ? 'cursor-pointer' : ''}
            >
              <rect x={x - CELL / 2} y={0} width={CELL} height={height - 8} fill={isActive ? 'rgba(124,140,255,0.10)' : 'transparent'} rx="6" />
              {hi > lo && (
                <line x1={x} y1={lo * CELL + CELL / 2} x2={x} y2={hi * CELL + CELL / 2}
                  stroke={isPast ? '#7c8cff' : '#3a4266'} strokeWidth="1.6" />
              )}
              {(op.controls || []).map((c) => (
                <circle key={c} cx={x} cy={c * CELL + CELL / 2} r="4.5" fill={isPast ? '#7c8cff' : '#3a4266'} />
              ))}
              {op.kind === 'swap' ? (
                [op.target, op.target2].map((q) => (
                  <text key={q} x={x} y={q * CELL + CELL / 2 + 6} textAnchor="middle" fontSize="17"
                    fill={isPast ? '#7c8cff' : '#4a5378'}>×</text>
                ))
              ) : (
                <>
                  <rect
                    x={x - 16} y={op.target * CELL + CELL / 2 - 14} width="32" height="28" rx="7"
                    fill={op.kind === 'measure' ? '#151a2b' : isPast ? 'rgba(124,140,255,0.18)' : '#151a2b'}
                    stroke={isActive ? '#c084fc' : isPast ? '#7c8cff' : '#3a4266'}
                    strokeWidth={isActive ? 1.8 : 1.2}
                  />
                  <text
                    x={x} y={op.target * CELL + CELL / 2 + 4} textAnchor="middle"
                    fontSize={gateLabel(op).length > 3 ? 8.5 : 11.5}
                    fill={isPast ? '#e7eaf6' : '#96a0c2'}
                    className="font-mono"
                  >
                    {gateLabel(op)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
