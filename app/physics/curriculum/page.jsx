'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LEVELS, TRACKS, MODULES } from '@/lib/physics/curriculum';
import { loadProgress } from '@/lib/physics/progress';
import { Badge, SectionTitle, levelTone } from '@/components/physics/ui';
import ModuleCard from '@/components/physics/ModuleCard';

function CurriculumInner() {
  const router = useRouter();
  const params = useSearchParams();
  const [progress, setProgress] = useState({ modules: {} });
  const [query, setQuery] = useState('');

  const level = params.get('level') || 'all';
  const track = params.get('track') || 'all';

  useEffect(() => {
    const sync = () => setProgress(loadProgress());
    sync();
    window.addEventListener('physics-progress-change', sync);
    return () => window.removeEventListener('physics-progress-change', sync);
  }, []);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params.toString());
    if (value === 'all') next.delete(key);
    else next.set(key, value);
    router.replace(`/physics/curriculum${next.toString() ? `?${next}` : ''}`, { scroll: false });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MODULES.filter((m) => {
      if (level !== 'all' && m.level !== level) return false;
      if (track !== 'all' && m.track !== track) return false;
      if (q && ![m.title, m.summary, ...(m.keywords || [])].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [level, track, query]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const m of filtered) {
      if (!map.has(m.level)) map.set(m.level, []);
      map.get(m.level).push(m);
    }
    return LEVELS.filter((l) => map.has(l.id)).map((l) => ({ level: l, items: map.get(l.id) }));
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">カリキュラム</h1>
        <p className="text-[12px] text-qmute mt-1">
          全 {MODULES.length} 単元。前提関係でつながっているので、詰まったら前提の単元に戻ってください。
        </p>
      </div>

      <div className="space-y-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="キーワードで検索（例: エンタングルメント、繰り込み、Bloch）"
          className="w-full rounded-xl bg-panel border border-edge px-4 py-2.5 text-[12.5px] placeholder:text-qmute/60 focus:border-quantum/60 focus:outline-none"
        />

        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={level === 'all'} onClick={() => setFilter('level', 'all')}>全レベル</FilterChip>
          {LEVELS.map((l) => (
            <FilterChip key={l.id} active={level === l.id} onClick={() => setFilter('level', l.id)}>
              {l.full}
            </FilterChip>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={track === 'all'} onClick={() => setFilter('track', 'all')}>全領域</FilterChip>
          {TRACKS.map((t) => (
            <FilterChip key={t.id} active={track === t.id} onClick={() => setFilter('track', t.id)} core={t.core}>
              <span className="mr-1">{t.icon}</span>
              {t.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {grouped.length === 0 && (
        <p className="text-[12px] text-qmute py-8 text-center">条件に合う単元がありません。</p>
      )}

      {grouped.map(({ level: lv, items }) => (
        <section key={lv.id}>
          <SectionTitle
            sub={lv.desc}
            right={<Badge tone={levelTone(lv.id)}>{items.length} 単元</Badge>}
          >
            {lv.full}
          </SectionTitle>
          <div className="grid sm:grid-cols-2 gap-3">
            {items.map((m) => (
              <ModuleCard key={m.id} module={m} progress={progress.modules[m.id]} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function FilterChip({ active, onClick, children, core }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-[11.5px] font-medium transition-colors border ${
        active
          ? 'bg-quantum/15 text-quantum border-quantum/40'
          : `bg-panel border-edge hover:border-quantum/40 ${core ? 'text-qink' : 'text-qmute'}`
      }`}
    >
      {children}
    </button>
  );
}

export default function CurriculumPage() {
  return (
    <Suspense fallback={<div className="text-[12px] text-qmute">読み込み中…</div>}>
      <CurriculumInner />
    </Suspense>
  );
}
