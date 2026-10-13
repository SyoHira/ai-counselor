// DB の実績から事後分布を作る。配信枠の配分・商品の入れ替え・ダッシュボードが共通で使う。
import { query } from './db.mjs';
import { config, HOOK_TYPES } from './config.mjs';
import {
  randBeta, randGamma, betaSummary, fitBetaPrior, shiftPrior, probabilityBest, slope, standardize, fitBinomialLogit, quantiles,
} from './stats.mjs';

const DAY = 86400000;

// 商品ごとの実績（閲覧・クリック・注文・報酬）と特徴量
export async function loadProductRows({ statuses = ['active', 'candidate', 'retired'] } = {}) {
  const rows = await query(
    `select p.*,
       coalesce((select sum(m.views) from posts po join post_metrics m on m.post_id = po.id where po.product_id = p.id), 0)::int as views,
       coalesce((select count(*) from posts po where po.product_id = p.id and po.status = 'published'), 0)::int as published,
       coalesce((select count(*) from clicks c where c.product_id = p.id), 0)::int as go_clicks,
       coalesce((select sum(c.clicks) from conversions c where c.product_id = p.id), 0)::int as report_clicks,
       coalesce((select sum(c.orders) from conversions c where c.product_id = p.id), 0)::int as orders,
       coalesce((select sum(c.commission) from conversions c where c.product_id = p.id), 0)::int as commission
     from products p where p.status = any($1)`,
    [statuses]
  );

  const since = new Date(Date.now() - 14 * DAY);
  const snaps = await query(
    'select network, external_id, rank, captured_at from rank_snapshots where captured_at >= $1 order by captured_at',
    [since]
  );
  const byItem = new Map();
  for (const s of snaps) {
    const k = `${s.network}:${s.external_id}`;
    if (!byItem.has(k)) byItem.set(k, []);
    byItem.get(k).push(s);
  }

  return rows.map((r) => {
    const series = byItem.get(`${r.network}:${r.external_id}`) ?? [];
    const latest = series.at(-1)?.rank ?? null;
    const t0 = series[0] ? new Date(series[0].captured_at).getTime() : 0;
    const velocity = slope(
      series.map((s) => (new Date(s.captured_at).getTime() - t0) / DAY),
      series.map((s) => Math.log(s.rank))
    );
    // Amazon はリンク直貼り（/go を通さない）のでレポートのクリック数、楽天は /go のクリック数を優先
    const clicks = Math.max(r.go_clicks, r.report_clicks);
    return { ...r, clicks, latestRank: latest, rankVelocity: velocity, rankPoints: series.length };
  });
}

function features(r, priceTarget) {
  return [
    Math.log(r.latestRank ?? 200),
    -r.rankVelocity, // 正 = 上昇中
    Math.log1p(r.review_count),
    r.review_avg || 0,
    Math.abs(Math.log(Math.max(r.price, 1) / priceTarget)),
    r.network === 'amazon' ? 1 : 0,
  ];
}
export const FEATURE_NAMES = ['log順位', '順位上昇率', 'log(レビュー数)', 'レビュー平均', '価格の乖離', 'Amazon'];

// 収益モデル: 1000閲覧あたり期待報酬 = CTR × CVR × 単価 × 料率 × 1000
export function buildProductModel(rows, { rng = Math.random } = {}) {
  const { priceTarget, defaultCommission } = config();
  const ctrPrior = fitBetaPrior(
    rows.map((r) => ({ successes: Math.min(r.clicks, r.views), trials: r.views })),
    { mean: 0.004, strength: 500 }
  );
  const cvrPrior = fitBetaPrior(
    rows.map((r) => ({ successes: Math.min(r.orders, r.clicks), trials: r.clicks })),
    { mean: 0.03, strength: 60 }
  );

  // 十分なデータがあれば特徴量 → CTR のロジスティック回帰でコールドスタートの事前平均を作る
  const trained = rows.filter((r) => r.views >= 500);
  let featureModel = null;
  if (trained.length >= 8) {
    const scaler = standardize(trained.map((r) => features(r, priceTarget)));
    const fit = fitBinomialLogit(
      trained.map((r) => scaler.apply(features(r, priceTarget))),
      trained.map((r) => Math.min(r.clicks, r.views)),
      trained.map((r) => r.views),
      { l2: 2 }
    );
    featureModel = { weights: fit.weights, predict: (r) => fit.predict(scaler.apply(features(r, priceTarget))) };
  }

  const arms = rows.map((r) => {
    const prior = featureModel ? shiftPrior(ctrPrior, featureModel.predict(r)) : ctrPrior;
    const ctr = { a: prior.alpha + Math.min(r.clicks, r.views), b: prior.beta + Math.max(r.views - r.clicks, 0) };
    const cvr = { a: cvrPrior.alpha + Math.min(r.orders, r.clicks), b: cvrPrior.beta + Math.max(r.clicks - r.orders, 0) };
    const rate = r.commission_rate || defaultCommission[r.network] || 0.03;
    const value = (r.price || priceTarget) * rate;
    return {
      id: r.id,
      row: r,
      ctr,
      cvr,
      value,
      sample: () => randBeta(ctr.a, ctr.b, rng) * randBeta(cvr.a, cvr.b, rng) * value * 1000,
    };
  });

  return { arms, ctrPrior, cvrPrior, featureModel };
}

export function summarizeArms(arms, rng = Math.random) {
  const pBest = arms.length ? probabilityBest(arms) : new Map();
  return arms.map((arm) => {
    const ctr = betaSummary(arm.ctr.a, arm.ctr.b, rng, 2000);
    const evDraws = Array.from({ length: 2000 }, arm.sample);
    const [evLo, evMid, evHi] = quantiles(evDraws, [0.05, 0.5, 0.95]);
    return {
      id: arm.id,
      ctr,
      cvrMean: arm.cvr.a / (arm.cvr.a + arm.cvr.b),
      valuePerOrder: Math.round(arm.value),
      ev: { lo: evLo, mid: evMid, hi: evHi },
      probBest: pBest.get(arm.id) ?? 0,
    };
  });
}

// 冒頭の型ごとの反応率（いいね・返信・リポスト・引用・シェア ÷ 閲覧）
export async function loadHookArms({ rng = Math.random } = {}) {
  const rows = await query(
    `select po.hook_type, sum(m.views)::int as views,
       sum(m.likes + m.replies + m.reposts + m.quotes + m.shares)::int as engaged, count(*)::int as posts
     from posts po join post_metrics m on m.post_id = po.id
     where po.hook_type <> '' group by po.hook_type`
  );
  const byType = new Map(rows.map((r) => [r.hook_type, r]));
  const data = HOOK_TYPES.map((t) => byType.get(t) ?? { hook_type: t, views: 0, engaged: 0, posts: 0 });
  const prior = fitBetaPrior(data.map((d) => ({ successes: Math.min(d.engaged, d.views), trials: d.views })), { mean: 0.03, strength: 100 });
  return data.map((d) => {
    const a = prior.alpha + Math.min(d.engaged, d.views);
    const b = prior.beta + Math.max(d.views - d.engaged, 0);
    return { id: d.hook_type, ...d, a, b, sample: () => randBeta(a, b, rng) };
  });
}

// 投稿時刻ごとの閲覧数（ガンマ・ポアソン）
export async function loadSlotArms({ rng = Math.random } = {}) {
  const { slotCandidates } = config();
  const rows = await query(
    `select to_char(po.slot_at at time zone 'Asia/Tokyo', 'HH24:MI') as slot,
       sum(m.views)::int as views, count(*)::int as posts
     from posts po join post_metrics m on m.post_id = po.id
     where po.slot_at is not null group by 1`
  );
  const bySlot = new Map(rows.map((r) => [r.slot, r]));
  const totalViews = rows.reduce((s, r) => s + r.views, 0);
  const totalPosts = rows.reduce((s, r) => s + r.posts, 0);
  const mean = totalPosts ? totalViews / totalPosts : 500;
  // 事前分布: 平均 = 全体平均、強さ = 投稿2本分
  const alpha0 = 2;
  const beta0 = alpha0 / mean;
  return slotCandidates.map((slot) => {
    const d = bySlot.get(slot) ?? { views: 0, posts: 0 };
    const shape = alpha0 + d.views;
    const rate = beta0 + d.posts;
    return { id: slot, views: d.views, posts: d.posts, meanViews: shape / rate, sample: () => randGamma(shape, rng) / rate };
  });
}
