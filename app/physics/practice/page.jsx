'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LEVELS, MODULES, getModule, levelOf } from '@/lib/physics/curriculum';
import { canonicalModuleId } from '@/lib/physics/moduleIds';
import { problemsFor, pickProblems, DIFFICULTY, PROBLEM_STATS } from '@/lib/physics/problems';
import { recordAttempt, getModuleProgress, loadProgress, logSession, dueForReview } from '@/lib/physics/progress';
import { Card, SectionTitle, Button, Badge, levelTone } from '@/components/physics/ui';
import RichText from '@/components/physics/RichText';
import ProblemCard from '@/components/physics/ProblemCard';

// 演習ページ。既定は「問題集」（教材に組み込まれた問題。APIキー不要でその場で採点・解説）。
// 「AIで生成」は Anthropic API を使って追加の問題を作り、記述解答を添削する。

const AI_DIFFICULTIES = [
  { id: 'easy', label: '基礎', hint: '定義と公式の確認' },
  { id: 'standard', label: '標準', hint: '典型問題' },
  { id: 'hard', label: '発展', hint: '応用・近似の判断' },
];

function ModuleSelect({ value, onChange, disabled, allowEmpty = true, emptyLabel }) {
  return (
    <select
      value={value}
      aria-label="単元"
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl bg-panel border border-edge px-3 py-2 text-[12px] focus:border-quantum/60 focus:outline-none"
    >
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {LEVELS.map((lv) => (
        <optgroup key={lv.id} label={lv.full}>
          {MODULES.filter((m) => m.level === lv.id).map((m) => (
            <option key={m.id} value={m.id}>{m.title}{problemsFor(m.id).length ? `（${problemsFor(m.id).length}問）` : ''}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// ── 問題集 ───────────────────────────────────────────
function BankPractice({ moduleId, setModuleId }) {
  const [difficulty, setDifficulty] = useState('all');
  const [progress, setProgress] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const sync = () => { setProgress(loadProgress()); setTick((t) => t + 1); };
    sync();
    window.addEventListener('physics-progress-change', sync);
    return () => window.removeEventListener('physics-progress-change', sync);
  }, []);

  const mod = moduleId ? getModule(moduleId) : null;
  const modProgress = mod && progress ? progress.modules[mod.id] : null;

  // 単元未指定：復習期限が来た単元 → 学習中の単元 → 直近のセッションの単元 から出題
  const mixed = useMemo(() => {
    if (mod || !progress) return { problems: [], reason: '' };
    const due = dueForReview(progress);
    if (due.length) return { problems: pickProblems(due, progress, 6), reason: '復習の時期が来た単元から出題しています' };
    const learning = Object.entries(progress.modules).filter(([, v]) => v.status === 'learning').map(([id]) => id);
    if (learning.length) return { problems: pickProblems(learning, progress, 6), reason: '学習中の単元から出題しています' };
    return { problems: [], reason: '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mod, progress]);

  const list = useMemo(() => {
    const base = mod ? problemsFor(mod.id) : mixed.problems;
    return difficulty === 'all' ? base : base.filter((p) => p.difficulty === difficulty);
  }, [mod, mixed, difficulty]);

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div>
          <p className="text-[11px] text-qmute mb-1.5">単元</p>
          <ModuleSelect value={moduleId} onChange={setModuleId} emptyLabel="— 復習が必要な単元から自動で出題 —" />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {[{ id: 'all', label: 'すべて' }, ...Object.values(DIFFICULTY)].map((d) => (
            <button
              key={d.id}
              onClick={() => setDifficulty(d.id)}
              title={d.hint}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] border transition-colors ${
                difficulty === d.id ? 'bg-photon/15 text-photon border-photon/40' : 'bg-panel border-edge text-qmute hover:border-photon/40'
              }`}
            >
              {d.label}
            </button>
          ))}
          {mod && (
            <Link href={`/physics/module/${mod.id}`} className="text-[11.5px] text-qmute hover:text-quantum ml-auto">
              単元を開く →
            </Link>
          )}
        </div>
        {mod && (
          <div className="flex items-center gap-2 text-[11px] text-qmute">
            <Badge tone={levelTone(mod.level)}>{levelOf(mod.level).label}</Badge>
            <span className="truncate">{mod.summary}</span>
            {modProgress?.attempts > 0 && (
              <span className="ml-auto tabular-nums shrink-0">{modProgress.attempts} 問中 {modProgress.correct} 問正解</span>
            )}
          </div>
        )}
        {!mod && mixed.reason && <p className="text-[11px] text-photon">{mixed.reason}</p>}
      </Card>

      {list.length > 0 ? (
        <div className="space-y-2.5" key={`${moduleId}-${difficulty}-${tick === 0 ? 'init' : 'ready'}`}>
          {list.map((p, i) => (
            <div key={p.id}>
              {!mod && (
                <p className="text-[10.5px] text-qmute mb-1 px-1">
                  <Link href={`/physics/module/${p.module}`} className="hover:text-quantum">{getModule(p.module)?.title}</Link>
                </p>
              )}
              <ProblemCard problem={p} index={i} defaultOpen={i === 0 || Boolean(mod)} />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-qmute text-center py-8 leading-relaxed">
          {mod
            ? difficulty === 'all' ? 'この単元にはまだ問題集がありません。「AIで生成」を使ってください。' : 'この難易度の問題はありません。'
            : '復習期限の来た単元も学習中の単元もまだありません。単元を選ぶか、カリキュラムから学習を始めてください。'}
        </p>
      )}

      <p className="text-[10.5px] text-qmute/70 text-right">問題集 {PROBLEM_STATS.total} 問 / {PROBLEM_STATS.modules} 単元</p>
    </div>
  );
}

// ── AI生成 ───────────────────────────────────────────
function AiPractice({ moduleId, setModuleId }) {
  const [level, setLevel] = useState(getModule(moduleId)?.level || 'ug');
  const [difficulty, setDifficulty] = useState('standard');
  const [problems, setProblems] = useState([]);
  const [answers, setAnswers] = useState({});
  const [results, setResults] = useState({});
  const [revealed, setRevealed] = useState({});
  const [hinted, setHinted] = useState({});
  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);
  const requestRef = useRef(null);
  const busy = loading || Boolean(grading);

  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null; }, []);

  const clearProblems = () => {
    setProblems([]); setAnswers({}); setResults({}); setRevealed({}); setHinted({}); setError('');
  };

  const mod = moduleId ? getModule(moduleId) : null;

  useEffect(() => {
    if (mod) {
      setLevel(mod.level);
      setProgress(getModuleProgress(mod.id));
    } else setProgress(null);
  }, [mod]);

  const generate = async () => {
    if (requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError('');
    setProblems([]); setAnswers({}); setResults({}); setRevealed({}); setHinted({});
    try {
      const res = await fetch('/api/physics-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ action: 'generate', moduleId, level, difficulty, count: 3 }),
      });
      const data = await res.json();
      if (requestRef.current !== controller) return;
      if (!res.ok) throw new Error(data.message || `エラー (${res.status})`);
      setProblems(data.problems || []);
      logSession({ type: 'practice', moduleId: moduleId || null, level, difficulty });
    } catch (e) {
      if (requestRef.current === controller && e.name !== 'AbortError') setError(e.message || '問題の生成に失敗しました。');
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setLoading(false); }
    }
  };

  const grade = async (p) => {
    if (requestRef.current || results[p.id]) return;
    const userAnswer = (answers[p.id] || '').trim();
    if (!userAnswer) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setGrading(p.id);
    setError('');
    try {
      const res = await fetch('/api/physics-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ action: 'grade', question: p.question, answer: p.answer, explanation: p.explanation, userAnswer, level }),
      });
      const data = await res.json();
      if (requestRef.current !== controller) return;
      if (!res.ok) throw new Error(data.message || `エラー (${res.status})`);
      setResults((r) => ({ ...r, [p.id]: data }));
      setRevealed((r) => ({ ...r, [p.id]: true }));
      if (moduleId && !revealed[p.id]) {
        recordAttempt(moduleId, data.correct);
        setProgress(getModuleProgress(moduleId));
      }
    } catch (e) {
      if (requestRef.current === controller && e.name !== 'AbortError') setError(e.message || '採点に失敗しました。');
    } finally {
      if (requestRef.current === controller) { requestRef.current = null; setGrading(''); }
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div>
          <p className="text-[11px] text-qmute mb-1.5">単元（未選択なら分野横断の総合問題）</p>
          <ModuleSelect value={moduleId} onChange={(v) => { clearProblems(); setModuleId(v); }} disabled={busy} emptyLabel="— 単元を指定しない —" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              disabled={busy}
              onClick={() => { clearProblems(); setLevel(l.id); }}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] border transition-colors ${
                level === l.id ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
              }`}
            >
              {l.full}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {AI_DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              disabled={busy}
              onClick={() => { clearProblems(); setDifficulty(d.id); }}
              title={d.hint}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] border transition-colors ${
                difficulty === d.id ? 'bg-photon/15 text-photon border-photon/40' : 'bg-panel border-edge text-qmute hover:border-photon/40'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Button variant="primary" onClick={generate} disabled={busy}>
            {loading ? '生成中…' : '問題を作る（3問）'}
          </Button>
          {mod && (
            <Link href={`/physics/module/${mod.id}`} className="text-[11.5px] text-qmute hover:text-quantum">単元を開く →</Link>
          )}
          {progress?.attempts > 0 && (
            <span className="text-[11px] text-qmute ml-auto tabular-nums">この単元 {progress.attempts} 問中 {progress.correct} 問正解</span>
          )}
        </div>
      </Card>

      {error && (
        <div className="rounded-xl border border-plasma/40 bg-plasma/10 px-3.5 py-2.5 text-[12px] text-plasma">{error}</div>
      )}

      {problems.map((p, i) => {
        const result = results[p.id];
        return (
          <Card key={p.id} className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Badge tone={levelTone(level)}>問 {i + 1}</Badge>
              <Badge>{p.type === 'mc' ? '選択式' : '記述式'}</Badge>
              {result && (
                <Badge tone={result.correct ? 'quantum' : 'plasma'} className="ml-auto">
                  {result.correct ? '正解' : '要復習'} ／ {result.score}点
                </Badge>
              )}
            </div>
            <RichText text={p.question} className="text-[13px]" />
            {p.type === 'mc' ? (
              <div className="space-y-1.5">
                {p.choices.map((c, ci) => (
                  <button
                    key={ci}
                    onClick={() => setAnswers((a) => ({ ...a, [p.id]: c }))}
                    disabled={Boolean(result)}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 text-[12.5px] transition-colors disabled:cursor-default ${
                      answers[p.id] === c ? 'border-quantum/50 bg-quantum/10 text-qink' : 'border-edge/70 text-qmute hover:border-quantum/40'
                    }`}
                  >
                    <RichText text={c} className="text-[12.5px]" />
                  </button>
                ))}
              </div>
            ) : (
              <textarea
                value={answers[p.id] || ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [p.id]: e.target.value }))}
                disabled={Boolean(result)}
                maxLength={4000}
                rows={4}
                placeholder="考え方も含めて書いてください（式は $...$ で書けます）"
                className="w-full rounded-xl bg-vacuum/50 border border-edge px-3 py-2.5 text-[12.5px] placeholder:text-qmute/50 focus:border-quantum/60 focus:outline-none disabled:opacity-70"
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => grade(p)} disabled={!answers[p.id]?.trim() || Boolean(result) || busy}>
                {grading === p.id ? '採点中…' : '採点する'}
              </Button>
              {!result && p.hint && (
                <Button variant="ghost" onClick={() => setHinted((h) => ({ ...h, [p.id]: true }))}>ヒント</Button>
              )}
              {!result && (
                <Button variant="subtle" onClick={() => setRevealed((r) => ({ ...r, [p.id]: true }))}>解答を見る</Button>
              )}
            </div>
            {hinted[p.id] && !result && (
              <div className="rounded-xl border border-amberq/30 bg-amberq/5 px-3 py-2.5">
                <p className="text-[10.5px] text-amberq mb-1">ヒント</p>
                <RichText text={p.hint} className="text-[12px]" />
              </div>
            )}
            {result && (
              <div className="rounded-xl border border-edge/70 bg-vacuum/40 px-3 py-3 space-y-2">
                <p className="text-[10.5px] text-quantum">添削</p>
                <RichText text={result.feedback} className="text-[12.5px]" />
                {result.misconception && <p className="text-[11.5px] text-amberq">典型的な誤解：{result.misconception}</p>}
              </div>
            )}
            {revealed[p.id] && (
              <div className="rounded-xl border border-edge/70 bg-vacuum/40 px-3 py-3 space-y-2">
                {!result && <p className="text-[11px] text-qmute">解答を見た問題は、添削できますが習得判定には加算しません。</p>}
                <p className="text-[10.5px] text-photon">模範解答</p>
                <RichText text={p.answer} className="text-[12.5px]" />
                {p.explanation && (
                  <>
                    <p className="text-[10.5px] text-photon pt-1">解説</p>
                    <RichText text={p.explanation} className="text-[12.5px]" />
                  </>
                )}
              </div>
            )}
          </Card>
        );
      })}

      {!problems.length && !loading && (
        <p className="text-[12px] text-qmute text-center py-8">単元とレベルを選んで「問題を作る」を押してください。</p>
      )}
    </div>
  );
}

// ── ページ本体 ────────────────────────────────────────
function PracticeInner() {
  const params = useSearchParams();
  const initialModule = canonicalModuleId(params.get('module') || '');
  const [tab, setTab] = useState(params.get('mode') === 'ai' ? 'ai' : 'bank');
  const [moduleId, setModuleId] = useState(initialModule);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">演習</h1>
          <p className="text-[12px] text-qmute mt-1 leading-relaxed">
            {tab === 'bank'
              ? '教材に組み込まれた問題集。その場で答え合わせをして、段階的な解説を読みます。'
              : 'AIが単元とレベルに合わせて問題を作り、記述解答も添削します（APIキーが必要）。'}
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-panel border border-edge p-1" role="tablist">
          {[{ id: 'bank', label: '問題集' }, { id: 'ai', label: 'AIで生成' }].map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-[12px] transition-colors ${tab === t.id ? 'bg-quantum/15 text-quantum' : 'text-qmute hover:text-qink'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'bank'
        ? <BankPractice moduleId={moduleId} setModuleId={setModuleId} />
        : <AiPractice moduleId={moduleId} setModuleId={setModuleId} />}
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense fallback={<div className="text-[12px] text-qmute">読み込み中…</div>}>
      <PracticeInner />
    </Suspense>
  );
}
