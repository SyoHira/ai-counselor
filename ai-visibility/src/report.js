import fs from 'node:fs';
import path from 'node:path';
import { readRaw } from './measure.js';

const pct = (n) => `${Math.round(n * 100)}%`;
const jpDate = (iso) => new Date(iso).toLocaleDateString('ja-JP');

const STANCE_JA = {
  positive: '肯定的',
  mixed: '両論併記',
  negative: '否定的',
  neutral: '評価を避ける',
};

/**
 * 4部構成のレポートを生成する。
 *
 * 書き方の原則：測定結果だけを書く。「こうすべき」は書かない。
 * 提言を混ぜた瞬間にコンサルの営業資料になり、読まれなくなる。
 */
export function buildReport({ summary, targets, outDir, brandId }) {
  const brands = targets.brands;
  const me = summary.brandSummary.find((b) => b.id === brandId);
  if (!me) throw new Error(`ブランドが見つかりません: ${brandId}`);

  const brandName = (id) => brands.find((b) => b.id === id)?.name ?? id;
  const records = readRaw(path.join(outDir, 'raw.jsonl')).filter((r) => !r.refused);
  const unbranded = summary.questionStats.filter((q) => q.kind === 'unbranded');
  const top = summary.brandSummary.filter((b) => b.id !== brandId).slice(0, 5);
  const lines = [];

  // ---- 1. 結論 ----
  lines.push(`# ${me.name} — AI検索での見え方`);
  lines.push('');
  lines.push(
    `観測日：${jpDate(summary.generatedAt)}　／　カテゴリ：${summary.category}　／　対象AI：${summary.providers.join('、')}`,
  );
  lines.push('');
  lines.push('## 1. 結論');
  lines.push('');
  lines.push(
    `指名なしの質問 ${me.totalQuestions} 問のうち、**${me.name} の名前が安定して出たのは ${me.stableQuestions} 問**でした（出現率 ${pct(me.visibility)}）。`,
  );
  if (me.occasionalQuestions) {
    lines.push('');
    lines.push(
      `ほかに ${me.occasionalQuestions} 問では、名前が出る回と出ない回がありました。これは同じ質問でも回答が安定していないという意味で、競合が安定して出ている質問より弱い状態です。`,
    );
  }
  if (top.length) {
    const rival = top[0];
    lines.push('');
    lines.push(
      `同じ質問で最も多く名前が出たのは **${rival.name}**（安定して出たのは ${rival.stableQuestions} / ${rival.totalQuestions} 問、出現率 ${pct(rival.visibility)}）です。`,
    );
  }
  lines.push('');
  lines.push(
    `> 商品名を知らない人が AI に相談したときに名前が挙がるかどうかを測っています。指名検索（ブランド名での質問）は、すでに御社を知っている人の行動なので別枠で扱っています。`,
  );
  lines.push('');
  lines.push(
    `> 各質問は同じ条件で ${summary.questionStats[0]?.runCount ?? 3} 回ずつ実行しています。AIの回答は毎回揺れるため、1回の結果では「たまたま」と「実際にそう言われている」が区別できないためです。`,
  );
  lines.push('');

  // ---- 2. 実際の回答 ----
  lines.push('## 2. 実際の回答');
  lines.push('');
  const shown = unbranded
    .slice()
    .sort((a, b) => (a.brandRates[brandId]?.rate ?? 0) - (b.brandRates[brandId]?.rate ?? 0))
    .slice(0, 5);

  for (const q of shown) {
    const r = q.brandRates[brandId];
    lines.push(`### 「${q.questionText}」`);
    lines.push('');
    lines.push(
      `${q.provider} ／ ${q.runCount} 回中 ${r?.hit ?? 0} 回で ${me.name} に言及${q.unstable ? '（回によって結果が割れています）' : ''}`,
    );
    lines.push('');
    const sample = records.find(
      (x) => x.questionId === q.questionId && x.provider === q.provider,
    );
    if (sample?.text) {
      lines.push('```');
      lines.push(sample.text.slice(0, 600).trim() + (sample.text.length > 600 ? '…' : ''));
      lines.push('```');
      lines.push(`（${sample.provider} / ${sample.model} / ${jpDate(sample.startedAt)} 実施）`);
      lines.push('');
    }
  }

  // ---- 3. 競合比較 ----
  lines.push('## 3. 競合との比較');
  lines.push('');
  lines.push('| 順位 | ブランド | 安定して出る | たまに出る | 出現率 |');
  lines.push('|---:|---|---:|---:|---:|');
  for (const b of summary.brandSummary) {
    const mark = b.id === brandId ? ' ←' : '';
    lines.push(
      `| ${b.rank} | ${b.name}${mark} | ${b.stableQuestions} / ${b.totalQuestions} | ${b.occasionalQuestions} | ${pct(b.visibility)} |`,
    );
  }
  lines.push('');
  lines.push(
    '「安定して出る」は、同じ質問を複数回投げたときに過半数で名前が挙がった質問数です。1〜2回しか出ないものは「たまに出る」に分けています。両者を合算すると実態を過大に見せるためです。',
  );
  lines.push('');
  lines.push(
    '出現率は、質問の種類ごとの重み（カテゴリ推薦・比較・成分評価を重く、指名を軽く）を反映した加重平均です。',
  );
  lines.push('');

  // ---- 4. 安全性・根拠への言及 ----
  lines.push('## 4. AIが安全性・根拠にどう触れているか');
  lines.push('');
  lines.push(
    'この項目は健康食品に固有のものです。AIが安全性や根拠の限界に触れると、購入をためらう理由として働きます。一方で、まったく触れない回答は、その内容を引用した場合に表示上の問題につながる可能性があります。',
  );
  lines.push('');
  lines.push('| 質問 | AI | 安全性への言及 | 根拠の限界への言及 | 論調 |');
  lines.push('|---|---|---:|---:|---|');
  for (const q of unbranded) {
    const counts = q.stances.reduce((m, s) => m.set(s, (m.get(s) ?? 0) + 1), new Map());
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    lines.push(
      `| ${q.questionText.slice(0, 28)}… | ${q.provider} | ${pct(q.safetyRate)} | ${pct(q.evidenceLimitRate)} | ${STANCE_JA[dominant] ?? '—'} |`,
    );
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(
    '本レポートは、公開されているAIサービスに実際に質問して得られた回答を記録したものです。効果・効能についての判断や、表示の適法性についての判断は含みません。',
  );
  lines.push('');

  const md = lines.join('\n');
  const dir = path.join(outDir, 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${brandId}.md`);
  fs.writeFileSync(file, md, 'utf8');
  return { file, markdown: md };
}
