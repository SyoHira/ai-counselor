// 問題集のスキーマとオフライン採点。
// 問題データ本体は problemBank.js（生成物）。ここでは検索・採点・進捗連携の補助関数を置く。
//
// 問題の形:
// {
//   id: 'mech-hs-01-1',            // <moduleId>-<番号>
//   module: 'mech-hs-01',
//   type: 'mc' | 'numeric' | 'short',
//   difficulty: 'basic' | 'standard' | 'advanced',
//   question: '…',                 // RichText（$…$ 可）
//   choices: ['…'],                // mc のみ
//   answer: 1                      // mc: 正解の添字
//         | { value, unit, tol }   // numeric: 相対許容 tol（既定 0.02）、absTol も可
//         | '…',                   // short: 模範解答
//   solution: ['…', '…'],          // 段階的な解説（順序あり）
//   misconception: '…',            // 誤答が魅力的に見える理由（任意）
//   hint: '…',                     // 任意
//   rubric: ['…'],                 // short の自己採点観点（任意）
// }

import { PROBLEM_BANK } from './problemBank.js';
import { canonicalModuleId } from './moduleIds.js';

export const PROBLEMS = PROBLEM_BANK;
export const PROBLEM_MAP = new Map(PROBLEMS.map((p) => [p.id, p]));

export const DIFFICULTY = {
  basic: { id: 'basic', label: '基礎', hint: '定義と式の確認' },
  standard: { id: 'standard', label: '標準', hint: '典型問題' },
  advanced: { id: 'advanced', label: '発展', hint: '近似の判断・分野の接続' },
};
export const TYPE_LABEL = { mc: '選択式', numeric: '数値', short: '記述式' };

const byModule = new Map();
for (const p of PROBLEMS) {
  if (!byModule.has(p.module)) byModule.set(p.module, []);
  byModule.get(p.module).push(p);
}

export function problemsFor(moduleId) {
  return byModule.get(canonicalModuleId(moduleId)) || [];
}

export function getProblem(id) {
  return PROBLEM_MAP.get(id) || null;
}

/**
 * 数値の解答文字列を数に直す。全角・カンマ・×10^n・e表記を受け付ける。
 * 解釈できなければ null。
 */
export function parseNumber(input) {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = String(input ?? '').trim();
  if (!s) return null;
  s = s.replace(/[０-９．－＋，]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  s = s.replace(/[−–]/g, '-').replace(/,/g, '').replace(/\s+/g, '');
  // 1.5×10^3, 1.5x10^3, 1.5*10^3, 1.5・10^3
  const sci = s.match(/^([+-]?\d*\.?\d+)[×x\*・]10\^?\(?([+-]?\d+)\)?$/i);
  if (sci) return Number(sci[1]) * 10 ** Number(sci[2]);
  const pow = s.match(/^10\^?\(?([+-]?\d+)\)?$/);
  if (pow) return 10 ** Number(pow[1]);
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/**
 * オフライン採点。mc と numeric を判定する。short は自己採点なので null を返す。
 * 戻り値: { correct: boolean, detail: string } | null
 */
export function gradeAnswer(problem, userAnswer) {
  if (!problem) return null;
  if (problem.type === 'mc') {
    const idx = typeof userAnswer === 'number' ? userAnswer : Number(userAnswer);
    if (!Number.isInteger(idx) || idx < 0 || idx >= problem.choices.length) return { correct: false, detail: '選択肢を選んでください。' };
    const correct = idx === problem.answer;
    return { correct, detail: correct ? '正解です。' : `正解は「${problem.choices[problem.answer]}」です。` };
  }
  if (problem.type === 'numeric') {
    const v = parseNumber(userAnswer);
    const a = problem.answer;
    if (v === null) return { correct: false, detail: '数値として読み取れませんでした。例: 9.8、1.5e3、2.0×10^-3' };
    const relTol = typeof a.tol === 'number' ? a.tol : 0.02;
    const absTol = typeof a.absTol === 'number' ? a.absTol : 0;
    const allowed = Math.max(Math.abs(a.value) * relTol, absTol);
    const correct = Math.abs(v - a.value) <= allowed;
    const shown = formatValue(a.value);
    return {
      correct,
      detail: correct
        ? `正解です（${shown}${a.unit ? ' ' + a.unit : ''}）。`
        : `正解は ${shown}${a.unit ? ' ' + a.unit : ''} です（許容 ±${relTol * 100}%）。`,
    };
  }
  return null;
}

export function formatValue(v) {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1e5 || abs < 1e-3) {
    const e = Math.floor(Math.log10(abs));
    const m = v / 10 ** e;
    return `${Number(m.toPrecision(3))}×10^${e}`;
  }
  return String(Number(v.toPrecision(3)));
}

/** 復習向け：指定した単元群から、未正解・未着手を優先して問題を選ぶ */
export function pickProblems(moduleIds, progress, limit = 5) {
  const out = [];
  const score = (p) => {
    const r = progress?.problems?.[p.id];
    if (!r) return 0;
    if (!r.lastCorrect) return 1;
    return 2 + Math.min(r.correct, 3);
  };
  const pool = moduleIds.flatMap((id) => problemsFor(id));
  pool.sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id));
  for (const p of pool) {
    if (out.length >= limit) break;
    out.push(p);
  }
  return out;
}

export const PROBLEM_STATS = (() => {
  const byType = { mc: 0, numeric: 0, short: 0 };
  const byDifficulty = { basic: 0, standard: 0, advanced: 0 };
  for (const p of PROBLEMS) { byType[p.type]++; byDifficulty[p.difficulty]++; }
  return { total: PROBLEMS.length, modules: byModule.size, byType, byDifficulty };
})();
