import { query, getSetting } from '@/lib/engine/db.mjs';
import { loadProductRows, buildProductModel, summarizeArms, loadHookArms, loadSlotArms, FEATURE_NAMES } from '@/lib/engine/analytics.mjs';
import { config } from '@/lib/engine/config.mjs';
import { studioHandler } from '@/lib/engine/http.mjs';
import { linkFor } from '@/lib/engine/jobs/publish.mjs';

export const dynamic = 'force-dynamic';

export const GET = studioHandler(async () => {
  const cfg = config();
  const rows = await loadProductRows();
  const model = buildProductModel(rows.filter((r) => r.status !== 'candidate'));
  const arms = summarizeArms(model.arms);
  const hooks = await loadHookArms();
  const slots = await loadSlotArms();

  const totals = (await query(
    `select
       coalesce((select sum(views) from post_metrics m join posts po on po.id = m.post_id where po.published_at > now() - interval '7 days'), 0)::int as views7,
       (select count(*) from clicks where ts > now() - interval '7 days')::int as clicks7,
       (select count(*) from posts where status = 'published' and published_at > now() - interval '7 days')::int as published7,
       coalesce((select sum(orders) from conversions where period_end > now() - interval '30 days'), 0)::int as orders30,
       coalesce((select sum(commission) from conversions where period_end > now() - interval '30 days'), 0)::int as commission30`
  ))[0];

  const queue = await query(
    `select po.id, po.text, po.status, po.hook_type, po.slot_at, po.compliance, po.error, po.link_slug, p.name as product, p.network, p.url
     from posts po join products p on p.id = po.product_id
     where po.status in ('draft','flagged','approved','scheduled','failed') order by po.slot_at nulls last, po.created_at limit 200`
  );
  const recent = await query(
    `select po.id, po.text, po.hook_type, po.published_at, p.name as product, coalesce(m.views,0)::int as views,
       coalesce(m.likes + m.replies + m.reposts + m.quotes + m.shares, 0)::int as engaged,
       (select count(*) from clicks c where c.post_id = po.id)::int as clicks
     from posts po join products p on p.id = po.product_id left join post_metrics m on m.post_id = po.id
     where po.status = 'published' order by po.published_at desc limit 50`
  );
  const offers = await query(
    `select * from offers order by case status when 'active' then 0 when 'applied' then 1 when 'discovered' then 2 else 3 end, expected_value desc limit 200`
  );
  const lineUsers = await query(
    `select coalesce(nullif(segment, ''), '未選択') as segment, count(*) filter (where not blocked)::int as active,
       count(*) filter (where blocked)::int as blocked from line_users group by 1 order by 1`
  );
  const lineSteps = await query('select * from line_steps order by segment, step');
  const guides = await query(
    `select g.slug, g.segment, g.title, g.status, g.compliance, g.views, g.updated_at,
       (select count(*) from clicks c where c.slug = 'guide:' || g.slug)::int as clicks
     from guides g order by g.slug`
  );
  const runs = await query('select job, status, summary, started_at, finished_at from job_runs order by id desc limit 20');

  return {
    config: { autoPublish: cfg.autoPublish, linkMode: cfg.linkMode, postsPerDay: cfg.postsPerDay, activeProducts: cfg.activeProducts },
    totals,
    products: rows
      .map((r) => ({ ...r, stats: arms.find((a) => a.id === r.id) ?? null }))
      .sort((a, b) => (a.status === b.status ? (b.stats?.ev.mid ?? b.prior_score) - (a.stats?.ev.mid ?? a.prior_score) : a.status.localeCompare(b.status))),
    hooks: hooks.map(({ sample, ...h }) => ({ ...h, rate: h.a / (h.a + h.b) })),
    slots: slots.map(({ sample, ...s }) => s),
    featureWeights: model.featureModel ? FEATURE_NAMES.map((n, i) => ({ name: n, weight: model.featureModel.weights[i + 1] })) : null,
    priors: { ctr: model.ctrPrior, cvr: model.cvrPrior },
    queue: queue.map((q) => ({ ...q, link: q.link_slug ? linkFor(q, q, cfg) : null })),
    recent,
    offers,
    line: { users: lineUsers, steps: lineSteps },
    guides,
    runs,
    report: await getSetting('last_report'),
  };
});
