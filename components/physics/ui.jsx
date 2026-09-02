'use client';

import Link from 'next/link';

export function Card({ children, className = '', as: Tag = 'div', ...rest }) {
  return (
    <Tag
      className={`rounded-2xl bg-panel/70 border border-edge/80 min-w-0 ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, sub, right }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{children}</h2>
        {sub && <p className="text-[11.5px] text-qmute mt-0.5">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Meter({ value, className = '', color = 'from-quantum to-violetq' }) {
  const pct = Math.round(Math.min(1, Math.max(0, value || 0)) * 100);
  return (
    <div className={`h-1.5 rounded-full bg-edge/70 overflow-hidden ${className}`}>
      <div
        className={`h-full rounded-full bg-gradient-to-r ${color} transition-[width] duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Ring({ value, size = 64, stroke = 6, label }) {
  const pct = Math.min(1, Math.max(0, value || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#252b45" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="url(#ringGrad)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-700"
        />
        <defs>
          <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c8cff" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[15px] font-semibold tabular-nums leading-none">{Math.round(pct * 100)}</span>
        {label && <span className="text-[9px] text-qmute mt-0.5">{label}</span>}
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'default', className = '' }) {
  const tones = {
    default: 'bg-edge/60 text-qmute',
    quantum: 'bg-quantum/15 text-quantum',
    photon: 'bg-photon/15 text-photon',
    plasma: 'bg-plasma/15 text-plasma',
    violet: 'bg-violetq/15 text-violetq',
    amber: 'bg-amberq/15 text-amberq',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-medium ${tones[tone] || tones.default} ${className}`}>
      {children}
    </span>
  );
}

const LEVEL_TONE = { hs: 'photon', ug: 'quantum', grad: 'violet', phd: 'plasma' };
export function levelTone(level) {
  return LEVEL_TONE[level] || 'default';
}

const STATUS_TONE = { todo: 'default', learning: 'amber', review: 'photon', mastered: 'quantum' };
export function statusTone(status) {
  return STATUS_TONE[status] || 'default';
}

export function Button({ children, variant = 'primary', className = '', ...rest }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  const variants = {
    primary: 'bg-quantum text-vacuum hover:bg-quantum/90 px-4 py-2',
    ghost: 'bg-panel border border-edge text-qink hover:border-quantum/60 px-4 py-2',
    subtle: 'text-qmute hover:text-qink px-2.5 py-1.5',
    danger: 'bg-panel border border-plasma/40 text-plasma hover:bg-plasma/10 px-4 py-2',
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
}

export function LinkButton({ href, children, variant = 'ghost', className = '' }) {
  const variants = {
    primary: 'bg-quantum text-vacuum hover:bg-quantum/90',
    ghost: 'bg-panel border border-edge text-qink hover:border-quantum/60',
  };
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-[12.5px] font-medium transition-colors ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}
