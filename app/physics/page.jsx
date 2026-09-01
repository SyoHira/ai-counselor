'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LEVELS, TRACKS, MODULES, STATS } from '@/lib/physics/curriculum';
import { loadProgress, computeStats, recommend, dueForReview } from '@/lib/physics/progress';
import { Card, SectionTitle, Meter, Ring, Badge, LinkButton, levelTone } from '@/components/physics/ui';
import ModuleCard from '@/components/physics/ModuleCard';

const LABS = [
  { href: '/physics/lab/circuit', title: '量子回路シミュレータ', desc: '最大6量子ビット。状態ベクトル・確率・エンタングルメントを逐次表示', icon: '⊗' },
  { href: '/physics/lab/bloch', title: 'Bloch球と1量子ビット', desc: 'ゲートを回転として見る。測定・デコヒーレンスも扱う', icon: '◉' },
  { href: '/physics/lab/well', title: '固有状態ソルバ', desc: '任意ポテンシャルの束縛状態を数値対角化で求める', icon: '∿' },
  { href: '/physics/lab/tunnel', title: '波束トンネル', desc: 'split-operator法で時間発展。透過率を実測する', icon: '⇢' },
];

export default function PhysicsHome() {
  const [state, setState] = useState(null);

  useEffect(() => {
    const sync = () => setState(loadProgress());
    sync();
    window.addEventListener('physics-progress-change', sync);
    return () => window.removeEventListener('physics-progress-change', sync);
  }, []);

  const stats = state ? computeStats(MODULES, state) : null;
  const recs = state ? recommend(MODULES, state, 4) : [];
  const due = state ? dueForReview(state) : [];
  const quantumCount = STATS.byTrack.qm + STATS.byTrack.qinfo;

  return (
    <div className="space-y-8">
      {/* ヒーロー */}
      <section className="relative overflow-hidden rounded-3xl border border-edge/80 bg-gradient-to-br from-panel to-deep phys-grid-bg">
        <div className="relative p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex-1">
              <p className="text-[11px] tracking-[0.18em] text-quantum uppercase mb-2">Physics Curriculum</p>
              <h1 className="text-[22px] sm:text-[26px] font-semibold leading-tight tracking-tight">
                高校の基礎から、博士レベルまで。
              </h1>
              <p className="text-[12.5px] text-qmute mt-2.5 leading-relaxed max-w-xl">
                全 {STATS.total} 単元・13領域を、前提関係でつないだ一本の道にしています。
                とくに量子力学と量子情報は {quantumCount} 単元を割き、理論だけでなく
                手を動かして確かめられるシミュレータを備えています。
              </p>
              <div className="flex flex-wrap gap-2 mt-4">
                <LinkButton href="/physics/curriculum" variant="primary">カリキュラムを見る</LinkButton>
                <LinkButton href="/physics/lab">量子ラボを開く</LinkButton>
                <LinkButton href="/physics/tutor">チューターに聞く</LinkButton>
              </div>
            </div>
            <div className="flex items-center gap-4 sm:flex-col sm:items-end">
              <Ring value={stats?.overall.ratio || 0} size={86} stroke={7} label="到達度" />
              <div className="text-[11px] text-qmute sm:text-right">
                <div>習得 <span className="text-qink tabular-nums font-medium">{stats?.overall.mastered ?? 0}</span> / {STATS.total} 単元</div>
                {due.length > 0 && <div className="text-photon mt-1">復習待ち {due.length} 件</div>}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 次の一手 */}
      <section>
        <SectionTitle sub="前提を満たしていて、いま取り組めるもの">次の一手</SectionTitle>
        {state === null ? (
          <div className="text-[12px] text-qmute">読み込み中…</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {recs.map(({ module, reason }) => (
              <ModuleCard
                key={module.id}
                module={module}
                progress={state.modules[module.id]}
                reason={reason}
              />
            ))}
          </div>
        )}
      </section>

      {/* 4段階 */}
      <section>
        <SectionTitle sub="段階ごとに到達目標が異なります">4つの習熟段階</SectionTitle>
        <div className="grid sm:grid-cols-2 gap-3">
          {LEVELS.map((lv) => {
            const s = stats?.byLevel[lv.id];
            return (
              <Link
                key={lv.id}
                href={`/physics/curriculum?level=${lv.id}`}
                className="group rounded-2xl bg-panel/70 border border-edge/80 hover:border-quantum/50 transition-colors p-4"
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Badge tone={levelTone(lv.id)}>{lv.label}</Badge>
                  <h3 className="text-[13.5px] font-semibold group-hover:text-quantum transition-colors">{lv.full}</h3>
                  <span className="ml-auto text-[10.5px] text-qmute tabular-nums">
                    {s ? `${s.mastered}/${s.total}` : `${STATS.byLevel[lv.id]} 単元`}
                  </span>
                </div>
                <p className="text-[11.5px] text-qmute leading-relaxed">{lv.desc}</p>
                <Meter value={s?.ratio || 0} className="mt-3" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* 量子ラボ */}
      <section>
        <SectionTitle sub="式を読むだけでは掴めないものを、動かして確かめる">量子ラボ</SectionTitle>
        <div className="grid sm:grid-cols-2 gap-3">
          {LABS.map((lab) => (
            <Link
              key={lab.href}
              href={lab.href}
              className="group rounded-2xl bg-panel/70 border border-edge/80 hover:border-quantum/50 transition-colors p-4 flex gap-3"
            >
              <span className="w-9 h-9 shrink-0 rounded-xl bg-quantum/12 text-quantum flex items-center justify-center text-[16px]">
                {lab.icon}
              </span>
              <div>
                <h3 className="text-[13.5px] font-semibold group-hover:text-quantum transition-colors">{lab.title}</h3>
                <p className="text-[11.5px] text-qmute mt-1 leading-relaxed">{lab.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 領域別 */}
      <section>
        <SectionTitle sub="量子系（ψ・⊗）に重心を置いた構成">領域別の進捗</SectionTitle>
        <Card className="p-4 divide-y divide-edge/60">
          {TRACKS.map((t) => {
            const s = stats?.byTrack[t.id];
            return (
              <Link
                key={t.id}
                href={`/physics/curriculum?track=${t.id}`}
                className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0 group"
              >
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[13px] shrink-0 ${t.core ? 'bg-quantum/15 text-quantum' : 'bg-edge/50 text-qmute'}`}>
                  {t.icon}
                </span>
                <span className="text-[12.5px] group-hover:text-quantum transition-colors w-40 sm:w-52 shrink-0">{t.label}</span>
                <Meter value={s?.ratio || 0} className="flex-1" color={t.core ? 'from-quantum to-photon' : 'from-edge to-qmute/60'} />
                <span className="text-[10.5px] text-qmute tabular-nums w-12 text-right shrink-0">
                  {s ? `${s.mastered}/${s.total}` : STATS.byTrack[t.id]}
                </span>
              </Link>
            );
          })}
        </Card>
      </section>
    </div>
  );
}
