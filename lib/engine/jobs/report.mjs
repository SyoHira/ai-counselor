// 週次レポート: 統計を集計し、Claude に結論と次の打ち手をまとめさせる
import { setSetting } from '../db.mjs';
import { loadProductRows, buildProductModel, summarizeArms, loadHookArms, loadSlotArms, FEATURE_NAMES } from '../analytics.mjs';
import { generateJson, llmConfigured } from '../llm.mjs';
import { reportSchema, reportPrompt } from '../prompts.mjs';

export async function buildStats() {
  const rows = await loadProductRows({ statuses: ['active', 'retired'] });
  const model = buildProductModel(rows);
  const summaries = summarizeArms(model.arms);
  const hooks = await loadHookArms();
  const slots = await loadSlotArms();
  return {
    products: rows.map((r) => {
      const s = summaries.find((x) => x.id === r.id);
      return {
        name: r.name.slice(0, 40), network: r.network, status: r.status, views: r.views, clicks: r.clicks, orders: r.orders,
        commission: r.commission, ctr: [s.ctr.lo, s.ctr.mean, s.ctr.hi].map((v) => +(v * 100).toFixed(3)),
        ev: Math.round(s.ev.mid), probBest: +s.probBest.toFixed(3),
      };
    }),
    hooks: hooks.map((h) => ({ type: h.id, posts: h.posts, views: h.views, engagementRate: +((h.a / (h.a + h.b)) * 100).toFixed(2) })),
    slots: slots.map((s) => ({ slot: s.id, posts: s.posts, meanViews: Math.round(s.meanViews) })),
    featureWeights: model.featureModel
      ? Object.fromEntries(FEATURE_NAMES.map((n, i) => [n, +model.featureModel.weights[i + 1].toFixed(3)]))
      : null,
  };
}

export async function report() {
  const stats = await buildStats();
  let narrative = null;
  if (llmConfigured() && stats.products.some((p) => p.views > 0)) {
    narrative = (await generateJson({ schema: reportSchema, prompt: reportPrompt({ stats }), effort: 'low' })).result;
  }
  await setSetting('last_report', { stats, narrative, createdAt: new Date().toISOString() });
  return { products: stats.products.length, narrative: Boolean(narrative) };
}
