'use client';

import Link from 'next/link';
import { Badge, Meter, levelTone, statusTone } from './ui';
import { levelOf, trackOf } from '@/lib/physics/curriculum';
import { STATUS } from '@/lib/physics/progress';

export default function ModuleCard({ module, progress, reason, compact = false }) {
  const status = progress?.status || 'todo';
  const level = levelOf(module.level);
  const track = trackOf(module.track);
  const weight = STATUS[status]?.weight ?? 0;

  return (
    <Link
      href={`/physics/module/${module.id}`}
      className="group block rounded-2xl bg-panel/70 border border-edge/80 hover:border-quantum/50 transition-colors p-4"
    >
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <Badge tone={levelTone(module.level)}>{level.label}</Badge>
        <span className="text-[11px] text-qmute flex items-center gap-1">
          <span className="text-[12px]">{track.icon}</span>
          {track.label}
        </span>
        <span className="ml-auto text-[10.5px] text-qmute/70 tabular-nums">{module.minutes}分</span>
      </div>
      <h3 className="text-[13.5px] font-semibold leading-snug text-qink group-hover:text-quantum transition-colors">
        {module.title}
      </h3>
      {!compact && (
        <p className="text-[11.5px] text-qmute mt-1.5 leading-relaxed line-clamp-2">{module.summary}</p>
      )}
      <div className="flex items-center gap-2 mt-3">
        <Meter value={weight} className="flex-1" />
        <Badge tone={statusTone(status)}>{STATUS[status]?.label || '未着手'}</Badge>
      </div>
      {reason && <p className="text-[10.5px] text-photon mt-2">{reason}</p>}
    </Link>
  );
}
