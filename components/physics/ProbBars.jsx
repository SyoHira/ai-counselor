'use client';

export default function ProbBars({ entries, max = 1, unit = '%', color = 'from-quantum to-violetq', empty = 'データがありません' }) {
  if (!entries.length) return <p className="text-[11.5px] text-qmute py-4 text-center">{empty}</p>;
  return (
    <div className="space-y-1.5">
      {entries.map((e) => (
        <div key={e.label} className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-qmute w-16 shrink-0">|{e.label}⟩</span>
          <div className="flex-1 h-4 rounded-md bg-edge/50 overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${color} transition-[width] duration-300`}
              style={{ width: `${Math.min(100, (e.p / max) * 100)}%` }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-qink w-14 text-right shrink-0">
            {unit === '%' ? `${(e.p * 100).toFixed(1)}%` : e.p}
          </span>
        </div>
      ))}
    </div>
  );
}
