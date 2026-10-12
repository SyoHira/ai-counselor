'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PHENOMENA, phenomenonModules } from '@/lib/physics/phenomena';
import { levelOf, trackOf } from '@/lib/physics/curriculum';
import { loadProgress } from '@/lib/physics/progress';
import { Card, SectionTitle, Badge, levelTone, statusTone } from '@/components/physics/ui';
import { STATUS } from '@/lib/physics/progress';
import RichText from '@/components/physics/RichText';

// 「身近な現象から探す」。日常の事象を起点に、どの単元のどの式が効いているかへ降りていく。
// 単元を順に読めば、高校の式から博士レベルの概念まで1本の筋で現象がほどける。

const ALL_TAGS = [...new Set(PHENOMENA.flatMap((p) => p.tags))];

export default function PhenomenaPage() {
  const [tag, setTag] = useState('all');
  const [progress, setProgress] = useState({ modules: {} });

  useEffect(() => {
    const sync = () => setProgress(loadProgress());
    sync();
    window.addEventListener('physics-progress-change', sync);
    return () => window.removeEventListener('physics-progress-change', sync);
  }, []);

  // ハッシュで指定された現象へスクロール（単元ページからのリンク）
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const el = document.getElementById(id);
    if (el) setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
  }, []);

  const list = useMemo(() => (tag === 'all' ? PHENOMENA : PHENOMENA.filter((p) => p.tags.includes(tag))), [tag]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">身近な現象から探す</h1>
        <p className="text-[12px] text-qmute mt-1 leading-relaxed">
          日常の「なぜ」を起点に、効いている式と単元へ降りていきます。単元は基礎から発展の順に並んでいるので、
          上から読めば高校の式がどこで博士レベルの概念につながるかが1本の筋で見えます。
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {[{ id: 'all', label: `すべて（${PHENOMENA.length}）` }, ...ALL_TAGS.map((t) => ({ id: t, label: t }))].map((t) => (
          <button
            key={t.id}
            onClick={() => setTag(t.id)}
            className={`px-2.5 py-1 rounded-lg text-[11.5px] border transition-colors ${
              tag === t.id ? 'bg-photon/15 text-photon border-photon/40' : 'bg-panel border-edge text-qmute hover:border-photon/40'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {list.map((ph) => {
          const mods = phenomenonModules(ph);
          return (
            <Card key={ph.id} id={ph.id} className="p-4 scroll-mt-20" data-phenomenon={ph.id}>
              <div className="flex gap-3">
                <span className="text-[26px] leading-none shrink-0 mt-0.5">{ph.icon}</span>
                <div className="min-w-0 flex-1">
                  <div role="heading" aria-level={2} className="text-[15px] font-semibold text-qink leading-snug"><RichText text={ph.title} className="text-[15px]" /></div>
                  <p className="text-[12px] text-photon mt-1">{ph.hook}</p>
                  <div className="mt-2.5"><RichText text={ph.story} className="text-[12.5px] text-qink/90" /></div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {ph.tags.map((t) => <span key={t} className="px-1.5 py-0.5 rounded bg-edge/40 text-qmute text-[10px]">#{t}</span>)}
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-edge/50">
                <p className="text-[10.5px] text-qmute mb-1.5">効いている単元（基礎 → 発展）</p>
                <ol className="space-y-1">
                  {mods.map((m, i) => {
                    const st = progress.modules[m.id]?.status || 'todo';
                    return (
                      <li key={m.id}>
                        <Link href={`/physics/module/${m.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-panel group">
                          <span className="text-[10.5px] text-qmute/60 tabular-nums w-4 shrink-0">{i + 1}</span>
                          <span className="text-[13px]">{trackOf(m.track).icon}</span>
                          <Badge tone={levelTone(m.level)}>{levelOf(m.level).label}</Badge>
                          <span className="text-[12.5px] text-qink group-hover:text-quantum transition-colors flex-1 min-w-0 truncate">{m.title}</span>
                          <Badge tone={statusTone(st)}>{STATUS[st]?.label}</Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
