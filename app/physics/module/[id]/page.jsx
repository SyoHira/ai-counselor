'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getModule, levelOf, trackOf, dependents, learningPath } from '@/lib/physics/curriculum';
import { getModuleProgress, setStatus, STATUS } from '@/lib/physics/progress';
import { Card, SectionTitle, Badge, Button, LinkButton, levelTone, statusTone } from '@/components/physics/ui';
import Tex from '@/components/physics/Tex';
import ProblemCard from '@/components/physics/ProblemCard';
import { problemsFor } from '@/lib/physics/problems';
import { EQUATION_MEANING } from '@/lib/physics/equationMeaning';
import { connectionsOf } from '@/lib/physics/connections';
import { phenomenaFor } from '@/lib/physics/phenomena';
import RichText from '@/components/physics/RichText';

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
  const problems = problemsFor(mod.id);
  const connections = connectionsOf(mod.id);
  const phenomena = phenomenaFor(mod.id);

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
          <SectionTitle sub="式を「読み下す」と、現実の何が決まるかが見える">核心となる式</SectionTitle>
          <div className="space-y-5">
            {mod.equations.map((eq, i) => {
              const meaning = EQUATION_MEANING[`${mod.id}#${i}`];
              return (
                <div key={i} data-equation={i}>
                  <div className="rounded-xl bg-vacuum/60 border border-edge/60 px-3 py-2.5 overflow-x-auto">
                    <Tex display>{eq.tex}</Tex>
                  </div>
                  <p className="text-[11.5px] text-qmute mt-1.5">{eq.note}</p>
                  {meaning && (
                    <div className="mt-2.5 grid sm:grid-cols-2 gap-2.5">
                      <div className="rounded-xl border border-quantum/25 bg-quantum/[0.05] px-3 py-2.5">
                        <p className="text-[10.5px] text-quantum mb-1">式を読む</p>
                        <RichText text={meaning.reads} className="text-[12px] leading-[1.8]" />
                      </div>
                      <div className="rounded-xl border border-photon/25 bg-photon/[0.05] px-3 py-2.5">
                        <p className="text-[10.5px] text-photon mb-1">現実では</p>
                        <RichText text={meaning.example} className="text-[12px] leading-[1.8]" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {phenomena.length > 0 && (
        <section>
          <SectionTitle sub="この単元の式が、身近な現象のどこで効いているか">身近な現象でつかむ</SectionTitle>
          <div className="grid sm:grid-cols-2 gap-2">
            {phenomena.map((ph) => (
              <Link
                key={ph.id}
                href={`/physics/phenomena#${ph.id}`}
                className="rounded-xl bg-panel/60 border border-edge/70 hover:border-photon/50 transition-colors px-3 py-2.5 flex gap-2.5"
              >
                <span className="text-[18px] shrink-0">{ph.icon}</span>
                <div className="min-w-0">
                  <div className="text-[12.5px] text-qink leading-snug"><RichText text={ph.title} className="text-[12.5px]" /></div>
                  <p className="text-[11px] text-qmute mt-0.5 leading-relaxed">{ph.hook}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {connections.length > 0 && (
        <section>
          <SectionTitle sub="前提関係とは別に、違う分野で同じ構造が現れる場所">他分野とのつながり</SectionTitle>
          <Card className="p-2 divide-y divide-edge/50">
            {connections.map((c) => (
              <div key={c.module.id} className="px-2 py-3" data-connection={c.module.id}>
                <Link href={`/physics/module/${c.module.id}`} className="flex items-center gap-2 group">
                  <span className="text-[14px]">{trackOf(c.module.track).icon}</span>
                  <Badge tone={levelTone(c.module.level)}>{levelOf(c.module.level).label}</Badge>
                  <span className="text-[12.5px] text-qink group-hover:text-quantum transition-colors">{c.module.title}</span>
                  <span className="text-[10.5px] text-qmute ml-auto shrink-0">{trackOf(c.module.track).label}</span>
                </Link>
                <div className="mt-1.5 pl-6"><RichText text={c.why} className="text-[11.5px] text-qmute leading-[1.75]" /></div>
              </div>
            ))}
          </Card>
        </section>
      )}

      {problems.length > 0 && (
        <section>
          <SectionTitle sub="解いたあとに段階的な解説を読む。正誤は学習の状態に記録される">演習で確かめる（{problems.length}問）</SectionTitle>
          <div className="space-y-2.5">
            {problems.map((p, i) => (
              <ProblemCard key={p.id} problem={p} index={i} defaultOpen={i === 0} />
            ))}
          </div>
        </section>
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
