'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LEVELS, MODULES, getModule } from '@/lib/physics/curriculum';
import { recordAttempt, getModuleProgress, logSession } from '@/lib/physics/progress';
import { Card, SectionTitle, Button, Badge, levelTone } from '@/components/physics/ui';
import RichText from '@/components/physics/RichText';

const DIFFICULTIES = [
  { id: 'easy', label: '基礎', hint: '定義と公式の確認' },
  { id: 'standard', label: '標準', hint: '典型問題' },
  { id: 'hard', label: '発展', hint: '応用・近似の判断' },
];

function PracticeInner() {
  const params = useSearchParams();
  const initialModule = params.get('module') || '';

  const [moduleId, setModuleId] = useState(initialModule);
  const [level, setLevel] = useState(getModule(initialModule)?.level || 'ug');
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

  const mod = moduleId ? getModule(moduleId) : null;

  useEffect(() => {
    if (mod) {
      setLevel(mod.level);
      setProgress(getModuleProgress(mod.id));
    }
  }, [mod]);

  const generate = async () => {
    setLoading(true);
    setError('');
    setProblems([]);
    setAnswers({});
    setResults({});
    setRevealed({});
    setHinted({});
    try {
      const res = await fetch('/api/physics-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', moduleId, level, difficulty, count: 3 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `エラー (${res.status})`);
      setProblems(data.problems || []);
      logSession({ type: 'practice', moduleId: moduleId || null, level, difficulty });
    } catch (e) {
      setError(e.message || '問題の生成に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const grade = async (p) => {
    const userAnswer = (answers[p.id] || '').trim();
    if (!userAnswer) return;
    setGrading(p.id);
    setError('');
    try {
      const res = await fetch('/api/physics-problem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grade',
          question: p.question,
          answer: p.answer,
          explanation: p.explanation,
          userAnswer,
          level,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `エラー (${res.status})`);
      setResults((r) => ({ ...r, [p.id]: data }));
      setRevealed((r) => ({ ...r, [p.id]: true }));
      if (moduleId) {
        recordAttempt(moduleId, data.correct);
        setProgress(getModuleProgress(moduleId));
      }
    } catch (e) {
      setError(e.message || '採点に失敗しました。');
    } finally {
      setGrading('');
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">演習</h1>
        <p className="text-[12px] text-qmute mt-1 leading-relaxed">
          単元とレベルに合わせて問題を生成し、記述解答も含めて添削します。
          答えが合っていても理由が誤っていれば、そこを指摘します。
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <div>
          <p className="text-[11px] text-qmute mb-1.5">単元（未選択なら分野横断の総合問題）</p>
          <select
            value={moduleId}
            onChange={(e) => setModuleId(e.target.value)}
            className="w-full rounded-xl bg-panel border border-edge px-3 py-2 text-[12px] focus:border-quantum/60 focus:outline-none"
          >
            <option value="">— 単元を指定しない —</option>
            {LEVELS.map((lv) => (
              <optgroup key={lv.id} label={lv.full}>
                {MODULES.filter((m) => m.level === lv.id).map((m) => (
                  <option key={m.id} value={m.id}>{m.title}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              onClick={() => setLevel(l.id)}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] border transition-colors ${
                level === l.id ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
              }`}
            >
              {l.full}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {DIFFICULTIES.map((d) => (
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
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button variant="primary" onClick={generate} disabled={loading}>
            {loading ? '生成中…' : '問題を作る（3問）'}
          </Button>
          {mod && (
            <Link href={`/physics/module/${mod.id}`} className="text-[11.5px] text-qmute hover:text-quantum">
              単元を開く →
            </Link>
          )}
          {progress?.attempts > 0 && (
            <span className="text-[11px] text-qmute ml-auto tabular-nums">
              この単元 {progress.attempts} 問中 {progress.correct} 問正解
            </span>
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
                      answers[p.id] === c
                        ? 'border-quantum/50 bg-quantum/10 text-qink'
                        : 'border-edge/70 text-qmute hover:border-quantum/40'
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
                rows={4}
                placeholder="考え方も含めて書いてください（式は $...$ で書けます）"
                className="w-full rounded-xl bg-vacuum/50 border border-edge px-3 py-2.5 text-[12.5px] placeholder:text-qmute/50 focus:border-quantum/60 focus:outline-none disabled:opacity-70"
              />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={() => grade(p)}
                disabled={!answers[p.id] || Boolean(result) || grading === p.id}
              >
                {grading === p.id ? '採点中…' : '採点する'}
              </Button>
              {!result && p.hint && (
                <Button variant="ghost" onClick={() => setHinted((h) => ({ ...h, [p.id]: true }))}>
                  ヒント
                </Button>
              )}
              {!result && (
                <Button variant="subtle" onClick={() => setRevealed((r) => ({ ...r, [p.id]: true }))}>
                  解答を見る
                </Button>
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
                {result.misconception && (
                  <p className="text-[11.5px] text-amberq">典型的な誤解：{result.misconception}</p>
                )}
              </div>
            )}

            {revealed[p.id] && (
              <div className="rounded-xl border border-edge/70 bg-vacuum/40 px-3 py-3 space-y-2">
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
        <p className="text-[12px] text-qmute text-center py-8">
          単元とレベルを選んで「問題を作る」を押してください。
        </p>
      )}
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
