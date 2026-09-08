'use client';

import { useState } from 'react';
import Link from 'next/link';
import RichText from './RichText';
import { Badge, Button } from './ui';
import { DIFFICULTY, TYPE_LABEL, gradeAnswer, formatValue } from '@/lib/physics/problems';
import { recordProblem, getProblemProgress } from '@/lib/physics/progress';

// 問題集の1問。選択式・数値はその場で採点、記述式は模範解答と観点で自己採点する。
// 解答後に段階的な解説を表示し、単元の進捗に記録する。

const DIFF_TONE = { basic: 'photon', standard: 'quantum', advanced: 'violet' };

export default function ProblemCard({ problem, index, defaultOpen = true, onRecorded }) {
  const [open, setOpen] = useState(defaultOpen);
  const [choice, setChoice] = useState(null);
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);     // { correct, detail } | { self: true }
  const [revealed, setRevealed] = useState(false); // 解答を先に見た
  const [hinted, setHinted] = useState(false);
  const [history, setHistory] = useState(() => getProblemProgress(problem.id));

  const p = problem;
  const done = Boolean(result);

  const finish = (correct, counts) => {
    recordProblem(p.id, p.module, correct, { counts });
    setHistory(getProblemProgress(p.id));
    onRecorded?.(p, correct);
  };

  const check = () => {
    if (done) return;
    const ua = p.type === 'mc' ? choice : text;
    const g = gradeAnswer(p, ua);
    if (!g) return;
    setResult(g);
    finish(g.correct, !revealed);
  };

  const selfGrade = (ok) => {
    if (done) return;
    setResult({ self: true, correct: ok });
    finish(ok, !revealed);
  };

  const canCheck = p.type === 'mc' ? choice !== null : p.type === 'numeric' ? text.trim() !== '' : text.trim().length >= 5;
  const showSolution = done || revealed;

  return (
    <div className="rounded-2xl border border-edge/80 bg-panel/60 min-w-0" data-problem={p.id}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
        data-role="toggle"
      >
        <Badge tone={DIFF_TONE[p.difficulty] || 'default'}>{DIFFICULTY[p.difficulty]?.label || p.difficulty}</Badge>
        <Badge>{TYPE_LABEL[p.type]}</Badge>
        <span className="text-[12.5px] text-qink flex-1 truncate">問 {index + 1}</span>
        {history && (
          <span className={`text-[10.5px] tabular-nums ${history.lastCorrect ? 'text-quantum' : 'text-amberq'}`}>
            {history.correct}/{history.attempts} 正解
          </span>
        )}
        <span className="text-qmute text-[12px]">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <RichText text={p.question} className="text-[13px]" />

          {p.type === 'mc' && (
            <div className="space-y-1.5">
              {p.choices.map((c, ci) => {
                const picked = choice === ci;
                const isAnswer = showSolution && ci === p.answer;
                const wrongPick = done && picked && !isAnswer;
                return (
                  <button
                    key={ci}
                    onClick={() => !done && setChoice(ci)}
                    disabled={done}
                    data-role="choice"
                    data-index={ci}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 text-[12.5px] transition-colors disabled:cursor-default flex gap-2 ${
                      isAnswer ? 'border-quantum/60 bg-quantum/10 text-qink'
                      : wrongPick ? 'border-plasma/50 bg-plasma/10 text-qink'
                      : picked ? 'border-quantum/50 bg-quantum/10 text-qink'
                      : 'border-edge/70 text-qmute hover:border-quantum/40'
                    }`}
                  >
                    <span className="text-[11px] tabular-nums text-qmute/70 mt-[2px] shrink-0">{ci + 1}.</span>
                    <span className="flex-1 min-w-0"><RichText text={c} className="text-[12.5px]" /></span>
                  </button>
                );
              })}
            </div>
          )}

          {p.type === 'numeric' && (
            <div className="flex items-center gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) check(); }}
                disabled={done}
                data-role="numeric"
                inputMode="decimal"
                placeholder="数値（例: 9.8、1.5e3、2.0×10^-3）"
                className="flex-1 rounded-xl bg-vacuum/50 border border-edge px-3 py-2 text-[12.5px] placeholder:text-qmute/50 focus:border-quantum/60 focus:outline-none disabled:opacity-70"
              />
              {p.answer.unit && <span className="text-[12px] text-qmute shrink-0">{p.answer.unit}</span>}
            </div>
          )}

          {p.type === 'short' && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={done}
              rows={4}
              maxLength={4000}
              placeholder="考え方を書いてください（式は $...$ で書けます）。書いてから模範解答と比べます。"
              className="w-full rounded-xl bg-vacuum/50 border border-edge px-3 py-2.5 text-[12.5px] placeholder:text-qmute/50 focus:border-quantum/60 focus:outline-none disabled:opacity-70"
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            {p.type !== 'short' && (
              <Button variant="primary" onClick={check} disabled={!canCheck || done} data-role="check">答え合わせ</Button>
            )}
            {p.type === 'short' && !showSolution && (
              <Button variant="primary" onClick={() => setRevealed(true)} disabled={!canCheck}>模範解答と比べる</Button>
            )}
            {!showSolution && p.hint && (
              <Button variant="ghost" onClick={() => setHinted(true)}>ヒント</Button>
            )}
            {!showSolution && p.type !== 'short' && (
              <Button variant="subtle" onClick={() => setRevealed(true)} data-role="reveal">解答を見る</Button>
            )}
            {result && !result.self && (
              <Badge tone={result.correct ? 'quantum' : 'plasma'} className="ml-auto">{result.correct ? '正解' : '要復習'}</Badge>
            )}
          </div>

          {hinted && !showSolution && (
            <div className="rounded-xl border border-amberq/30 bg-amberq/5 px-3 py-2.5">
              <p className="text-[10.5px] text-amberq mb-1">ヒント</p>
              <RichText text={p.hint} className="text-[12px]" />
            </div>
          )}

          {result && !result.self && (
            <p className={`text-[12px] ${result.correct ? 'text-quantum' : 'text-plasma'}`}>{result.detail}</p>
          )}

          {showSolution && (
            <div className="rounded-xl border border-edge/70 bg-vacuum/40 px-3 py-3 space-y-3" data-role="solution">
              {revealed && !done && p.type !== 'short' && (
                <p className="text-[11px] text-qmute">解答を先に見た問題は、答え合わせしても習得判定には加算しません。</p>
              )}
              <div>
                <p className="text-[10.5px] text-photon mb-1">解答</p>
                {/* 番号を RichText に渡すと「1. …」が番号付きリストとして再採番されるため、別要素に分ける */}
                {p.type === 'mc' && (
                  <div className="flex gap-2">
                    <span className="text-[12.5px] tabular-nums text-qmute shrink-0">{p.answer + 1}.</span>
                    <div className="flex-1 min-w-0"><RichText text={p.choices[p.answer]} className="text-[12.5px]" /></div>
                  </div>
                )}
                {p.type === 'numeric' && <p className="text-[12.5px] text-qink">{formatValue(p.answer.value)}{p.answer.unit ? ` ${p.answer.unit}` : ''}</p>}
                {p.type === 'short' && <RichText text={p.answer} className="text-[12.5px]" />}
              </div>
              <div>
                <p className="text-[10.5px] text-photon mb-1">解説</p>
                <ol className="space-y-2">
                  {p.solution.map((st, i) => (
                    <li key={i} className="flex gap-2.5 text-[12.5px]">
                      <span className="w-5 h-5 shrink-0 rounded-md bg-photon/12 text-photon text-[10px] flex items-center justify-center mt-0.5">{i + 1}</span>
                      <div className="flex-1 min-w-0"><RichText text={st} className="text-[12.5px]" /></div>
                    </li>
                  ))}
                </ol>
              </div>
              {p.misconception && (
                <p className="text-[11.5px] text-amberq leading-relaxed">よくある誤り：{p.misconception}</p>
              )}
              {p.type === 'short' && p.rubric?.length > 0 && !done && (
                <div>
                  <p className="text-[10.5px] text-qmute mb-1">自分の解答に次が含まれているか確認してください</p>
                  <ul className="space-y-1">
                    {p.rubric.map((r, i) => (
                      <li key={i} className="flex gap-2 text-[12px]"><span className="text-quantum">·</span><span className="flex-1"><RichText text={r} className="text-[12px]" /></span></li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button variant="ghost" onClick={() => selfGrade(true)}>できていた</Button>
                    <Button variant="ghost" onClick={() => selfGrade(false)}>不足があった</Button>
                  </div>
                </div>
              )}
              {result?.self && (
                <p className={`text-[12px] ${result.correct ? 'text-quantum' : 'text-amberq'}`}>
                  {result.correct ? '「できていた」として記録しました。' : '「不足があった」として記録しました。復習の対象になります。'}
                </p>
              )}
              <Link
                href={`/physics/tutor?module=${p.module}&problem=${p.id}`}
                className="inline-block text-[11.5px] text-quantum hover:underline"
              >
                この問題の解説をチューターに詳しく聞く →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
