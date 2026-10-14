// 配信する商品の入れ替え: 実績で負けが確定した商品を外し、空いた枠を候補から埋める（毎日）
import { query } from '../db.mjs';
import { config, segmentFor } from '../config.mjs';
import { loadProductRows, buildProductModel, summarizeArms } from '../analytics.mjs';
import { generateJson, llmConfigured } from '../llm.mjs';
import { pickSchema, pickPrompt } from '../prompts.mjs';

export async function portfolio() {
  const cfg = config();
  const summary = { retired: [], activated: [] };

  // 1. 外す: 十分な閲覧があり、最良である確率が閾値未満
  const active = (await loadProductRows({ statuses: ['active'] })).filter((r) => r.channels.includes('threads'));
  if (active.length >= 3) {
    const stats = summarizeArms(buildProductModel(active).arms);
    for (const s of stats) {
      const row = active.find((r) => r.id === s.id);
      if (row.views >= cfg.minViewsToJudge && s.probBest < cfg.retireProbBest) {
        await query(`update products set status = 'retired', retired_at = now() where id = $1`, [row.id]);
        await query(`update posts set status = 'rejected' where product_id = $1 and status in ('draft','approved','scheduled','flagged')`, [row.id]);
        summary.retired.push(row.name);
      }
    }
  }

  // 2. 埋める: 候補を事前スコア（特徴量モデル or ヒューリスティック）で並べ、上位を Claude に審査させる
  const [{ n }] = await query(`select count(*)::int as n from products where status = 'active' and channels like '%threads%' and network <> 'asp'`);
  const vacancies = cfg.activeProducts - n;
  if (vacancies <= 0) return summary;

  const candidates = (await loadProductRows({ statuses: ['candidate'] })).filter(
    (r) => r.price === 0 || (r.price >= cfg.priceTarget * 0.4 && r.price <= cfg.priceTarget * 2.5)
  );
  if (!candidates.length) return { ...summary, note: '候補がありません（ingest か手動登録が必要）' };

  const all = await loadProductRows();
  const model = buildProductModel(all);
  const evById = new Map(summarizeArms(model.arms.filter((a) => candidates.some((c) => c.id === a.id))).map((s) => [s.id, s.ev.mid]));
  const heuristic = (r) =>
    -Math.log(r.latestRank ?? 200) * 0.6 + -r.rankVelocity * 3 + Math.log1p(r.review_count) * 0.3 + (r.review_avg - 4) * 0.5;
  const scored = candidates
    .map((r) => ({ ...r, score: model.featureModel ? evById.get(r.id) : heuristic(r) }))
    .sort((a, b) => b.score - a.score);
  for (const r of scored) await query('update products set prior_score = $2 where id = $1', [r.id, r.score ?? 0]);

  const shortlist = scored.slice(0, Math.max(vacancies * 4, 20));
  if (!llmConfigured()) return { ...summary, note: 'ANTHROPIC_API_KEY 未設定のため選定をスキップ' };

  const { result } = await generateJson({ schema: pickSchema, prompt: pickPrompt({ candidates: shortlist, count: vacancies }) });
  for (const pick of result.picks.slice(0, vacancies)) {
    const row = shortlist.find((r) => r.id === pick.id);
    if (!row) continue;
    await query(
      `update products set status = 'active', activated_at = now(), pain = $2, category = coalesce(nullif(category, ''), $3), segment = $4 where id = $1`,
      [row.id, pick.painOneLiner, pick.category, segmentFor(`${pick.category} ${row.name} ${pick.painOneLiner}`)]
    );
    summary.activated.push(row.name);
  }
  return summary;
}
