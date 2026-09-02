'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getModule, levelOf, trackOf, dependents, learningPath } from '@/lib/physics/curriculum';
import { getModuleProgress, setStatus, STATUS } from '@/lib/physics/progress';
import { Card, SectionTitle, Badge, Button, LinkButton, levelTone, statusTone } from '@/components/physics/ui';
import Tex from '@/components/physics/Tex';

const LAB_INFO = {
  circuit: { href: '/physics/lab/circuit', label: '量子回路シミュレータ' },
  bloch: { href: '/physics/lab/bloch', label: 'Bloch球ラボ' },
  well: { href: '/physics/lab/well', label: '固有状態ソルバ' },
  math: { href: '/physics/lab/math', label: '物理数学ビジュアライザ' },
  tunnel: { href: '/physics/lab/tunnel', label: '波束トンネル' },
};

export default function ModulePage({ params }) {
  const mod = getModule(params.id);
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!mod) return;
    const sync = () => setProgress(getModuleProgress(mod.id));
    sync();
    window.addEventListener('physics-progress-change', sync);
    return () => window.removeEventListener('physics-progress-change', sync);
  }, [mod]);

  if (!mod) return notFound();

  const level = levelOf(mod.level);
  const track = trackOf(mod.track);
  const path = learningPath(mod.id).filter((m) => m.id !== mod.id);
  const next = dependents(mod.id);
  const status = progress?.status || 'todo';

  return (
    <div className="space-y-6">
      <Link href={`/physics/curriculum?track=${mod.track}`} className="text-[11.5px] text-qmute hover:text-quantum inline-flex items-center gap-1">
        ← {track.icon} {track.label}
      </Link>

      <header>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Badge tone={levelTone(mod.level)}>{level.full}</Badge>
          {mod.course && <Badge tone="photon">{mod.course}</Badge>}
          <Badge tone={statusTone(status)}>{STATUS[status]?.label}</Badge>
          <span className="text-[11px] text-qmute">目安 {mod.minutes} 分</span>
          <span className="text-[10.5px] text-qmute/50 font-mono ml-auto">{mod.id}</span>
        </div>
        <h1 className="text-[20px] sm:text-[23px] font-semibold leading-snug tracking-tight">{mod.title}</h1>
        <p className="text-[13px] text-qmute mt-2.5 leading-relaxed">{mod.summary}</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <LinkButton href={`/physics/tutor?module=${mod.id}`} variant="primary">チューターに聞く</LinkButton>
        <LinkButton href={`/physics/practice?module=${mod.id}`}>演習をつくる</LinkButton>
        {(mod.labs || []).map((l) => LAB_INFO[l] && (
          <LinkButton key={l} href={LAB_INFO[l].href}>{LAB_INFO[l].label}</LinkButton>
        ))}
      </div>

      {mod.intuition && (
        <Card className="p-4 border-photon/30 bg-photon/[0.04]">
          <SectionTitle sub="式の前に、まず絵で掴む">イメージでつかむ</SectionTitle>
          <p className="text-[13px] leading-[1.9] text-qink">{mod.intuition}</p>
        </Card>
      )}

      <Card className="p-4">
        <SectionTitle sub="この単元を終えたときにできるようになること">到達目標</SectionTitle>
        <ul className="space-y-2">
          {mod.goals.map((g, i) => (
            <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed">
              <span className="w-5 h-5 shrink-0 rounded-md bg-quantum/12 text-quantum text-[10px] flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span>{g}</span>
            </li>
          ))}
        </ul>
      </Card>

      {mod.equations?.length > 0 && (
        <Card className="p-4">
          <SectionTitle sub="この単元の骨格になる式">核心となる式</SectionTitle>
          <div className="space-y-4">
            {mod.equations.map((eq, i) => (
              <div key={i}>
                <div className="rounded-xl bg-vacuum/60 border border-edge/60 px-3 py-2.5 overflow-x-auto">
                  <Tex display>{eq.tex}</Tex>
                </div>
                <p className="text-[11.5px] text-qmute mt-1.5">{eq.note}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <SectionTitle sub="習得すると学習の状態が記録され、復習の時期に再提示されます">学習の状態</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {['learning', 'mastered', 'todo'].map((s) => (
            <Button
              key={s}
              variant={status === s ? 'primary' : 'ghost'}
              onClick={() => setStatus(mod.id, s)}
            >
              {STATUS[s].label}にする
            </Button>
          ))}
        </div>
        {progress?.attempts > 0 && (
          <p className="text-[11.5px] text-qmute mt-3">
            演習 {progress.attempts} 問中 {progress.correct} 問正解
            {progress.reviewAt && ` ／ 次の復習 ${new Date(progress.reviewAt).toLocaleDateString('ja-JP')}`}
          </p>
        )}
      </Card>

      {path.length > 0 && (
        <section>
          <SectionTitle sub="この単元にたどり着くまでに押さえておく内容">前提となる学習パス</SectionTitle>
          <Card className="p-2 divide-y divide-edge/50">
            {path.map((m, i) => (
              <Link key={m.id} href={`/physics/module/${m.id}`} className="flex items-center gap-3 px-2 py-2.5 group">
                <span className="text-[10.5px] text-qmute/60 tabular-nums w-5 shrink-0">{i + 1}</span>
                <Badge tone={levelTone(m.level)}>{levelOf(m.level).label}</Badge>
                <span className="text-[12.5px] group-hover:text-quantum transition-colors flex-1">{m.title}</span>
                <span className="text-[14px] text-qmute/50">{trackOf(m.track).icon}</span>
              </Link>
            ))}
          </Card>
        </section>
      )}

      {next.length > 0 && (
        <section>
          <SectionTitle sub="この単元を前提にしている内容">この先に開ける単元</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-2">
            {next.map((m) => (
              <Link
                key={m.id}
                href={`/physics/module/${m.id}`}
                className="rounded-xl bg-panel/60 border border-edge/70 hover:border-quantum/50 transition-colors px-3 py-2.5 flex items-center gap-2"
              >
                <Badge tone={levelTone(m.level)}>{levelOf(m.level).label}</Badge>
                <span className="text-[12px] flex-1">{m.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {mod.keywords?.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-2">
          {mod.keywords.map((k) => (
            <span key={k} className="px-2 py-0.5 rounded-md bg-edge/40 text-qmute text-[10.5px]">#{k}</span>
          ))}
        </div>
      )}
    </div>
  );
}
