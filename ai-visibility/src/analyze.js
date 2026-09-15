import path from 'node:path';
import fs from 'node:fs';
import { readRaw } from './measure.js';
import { readLabels } from './classify.js';
import { mentionedBrandIds } from './normalize.js';

const key = (r) => `${r.questionId}|${r.provider}|${r.model}|${r.run}`;

/**
 * 「揺らぎ」と「実際の傾向」を分ける。
 *
 * 同じ質問を N 回投げたとき、N 回中 K 回だけ名前が出るのが普通。
 * 1回しか出ないものを「出ている」と数えると、翌週の再計測で必ずブレて、
 * 顧客に誤ったアラートを出すことになる。だから出現は必ず率で持つ。
 */
function rate(hit, total) {
  return total === 0 ? 0 : hit / total;
}

export function analyze({ targets, outDir }) {
  const records = readRaw(path.join(outDir, 'raw.jsonl')).filter((r) => !r.refused);
  const labels = readLabels(outDir);
  const brands = targets.brands;

  // 質問 × プロバイダ ごとに試行をまとめる
  const groups = new Map();
  for (const r of records) {
    const g = `${r.questionId}|${r.provider}`;
    if (!groups.has(g)) {
      groups.set(g, {
        questionId: r.questionId,
        questionText: r.questionText,
        typeId: r.typeId,
        kind: r.kind,
        weight: r.weight,
        meta: r.meta,
        provider: r.provider,
        model: r.model,
        runs: [],
      });
    }
    groups.get(g).runs.push(r);
  }

  const questionStats = [];
  for (const g of groups.values()) {
    const n = g.runs.length;
    const perBrandHits = new Map();
    let safety = 0;
    let evidenceLimits = 0;
    const stances = [];

    for (const r of g.runs) {
      for (const id of mentionedBrandIds(r.text, brands)) {
        perBrandHits.set(id, (perBrandHits.get(id) ?? 0) + 1);
      }
      const l = labels.get(key(r));
      if (l) {
        if (l.mentions_safety) safety++;
        if (l.mentions_evidence_limits) evidenceLimits++;
        stances.push(l.stance);
      }
    }

    questionStats.push({
      ...g,
      runCount: n,
      brandRates: Object.fromEntries(
        [...perBrandHits].map(([id, hit]) => [id, { hit, n, rate: rate(hit, n) }]),
      ),
      safetyRate: rate(safety, stances.length || n),
      evidenceLimitRate: rate(evidenceLimits, stances.length || n),
      stances,
      // 全試行で同じ結果なら安定。割れているなら、そこは週次で動く可能性が高い。
      unstable: [...perBrandHits.values()].some((h) => h > 0 && h < n),
    });
  }

  // ブランドごとの集計（unbranded のみ。指名質問は事業インパクトが小さい）
  const unbranded = questionStats.filter((q) => q.kind === 'unbranded');
  const brandSummary = brands.map((b) => {
    let weighted = 0;
    let weightTotal = 0;
    let stable = 0;
    let occasional = 0;
    for (const q of unbranded) {
      const r = q.brandRates[b.id]?.rate ?? 0;
      weighted += r * q.weight;
      weightTotal += q.weight;
      // 過半数の試行で出れば「安定して出る」。1回だけなら「たまに出る」。
      // ここを区別せず「出た質問数」で報告すると、実態を大きく過大に見せる。
      if (r >= 0.5) stable++;
      else if (r > 0) occasional++;
    }
    return {
      id: b.id,
      name: b.name,
      client: Boolean(b.client),
      // 重み付き出現率。質問の重要度を反映した「見えている度合い」
      visibility: weightTotal ? weighted / weightTotal : 0,
      stableQuestions: stable,
      occasionalQuestions: occasional,
      totalQuestions: unbranded.length,
    };
  });

  brandSummary.sort((a, b) => b.visibility - a.visibility);
  brandSummary.forEach((b, i) => (b.rank = i + 1));

  const summary = {
    generatedAt: new Date().toISOString(),
    category: targets.category,
    recordCount: records.length,
    labeledCount: labels.size,
    providers: [...new Set(records.map((r) => r.provider))],
    brandSummary,
    questionStats,
  };

  fs.writeFileSync(
    path.join(outDir, 'summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8',
  );
  return summary;
}
