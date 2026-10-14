import { query } from '@/lib/engine/db.mjs';
import { mapConversionRows } from '@/lib/engine/csv.mjs';
import { studioHandler, badRequest } from '@/lib/engine/http.mjs';

export const dynamic = 'force-dynamic';

// 成果レポート CSV を期間付きで取り込む。キーは商品コード / ASIN / トラッキングID
export const POST = studioHandler(async (request) => {
  const { network, periodStart, periodEnd, csv } = await request.json();
  if (!['rakuten', 'amazon', 'asp'].includes(network)) throw badRequest('network は rakuten / amazon / asp');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd ?? '')) throw badRequest('期間を指定してください');
  if (!csv?.trim()) throw badRequest('CSVが空です');

  let mapped;
  try {
    mapped = mapConversionRows(csv);
  } catch (e) {
    throw badRequest(e.message);
  }

  let matched = 0;
  for (const r of mapped.rows) {
    const [product] = await query(
      `select id from products where network = $1 and (external_id = $2 or (tracking_id <> '' and tracking_id = $2) or ($1 = 'asp' and name = $2)) limit 1`,
      [network, r.key]
    );
    if (product) matched++;
    await query(
      `insert into conversions (network, period_start, period_end, key, product_id, clicks, orders, revenue, commission)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (network, period_start, period_end, key) do update set product_id = excluded.product_id,
         clicks = excluded.clicks, orders = excluded.orders, revenue = excluded.revenue, commission = excluded.commission`,
      [network, periodStart, periodEnd, r.key, product?.id ?? null, r.clicks, r.orders, r.revenue, r.commission]
    );
  }
  return { rows: mapped.rows.length, matched, detected: mapped.detected };
});
