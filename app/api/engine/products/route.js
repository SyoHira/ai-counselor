import { query, one } from '@/lib/engine/db.mjs';
import { amazonLink } from '@/lib/engine/sources/amazon.mjs';
import { config } from '@/lib/engine/config.mjs';
import { studioHandler, badRequest } from '@/lib/engine/http.mjs';

export const dynamic = 'force-dynamic';

const ASIN = /^[A-Z0-9]{10}$/;

// 手動登録（PA-API が使えない間の Amazon 商品や、自分で使っている商品）
export const POST = studioHandler(async (request) => {
  const b = await request.json();
  const network = b.network === 'amazon' ? 'amazon' : 'rakuten';
  const externalId = String(b.externalId ?? '').trim();
  const name = String(b.name ?? '').trim().slice(0, 200);
  if (!externalId || !name) throw badRequest('ID と商品名は必須です');

  let url = String(b.url ?? '').trim();
  let trackingId = '';
  if (network === 'amazon') {
    if (!ASIN.test(externalId)) throw badRequest('ASIN は英数字10桁です');
    const ids = config().amazonTrackingIds;
    trackingId = String(b.trackingId ?? '').trim() || ids[0] || process.env.AMAZON_PARTNER_TAG || '';
    if (!trackingId) throw badRequest('トラッキングID（AMAZON_TRACKING_IDS）を設定してください');
    url = amazonLink(externalId, trackingId);
  } else if (!/^https:\/\//.test(url)) {
    throw badRequest('楽天のアフィリエイトURL（https://）を入れてください');
  }

  const row = await one(
    `insert into products (network, external_id, name, price, url, category, pain, experienced, tracking_id, commission_rate, status, activated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, $11, case when $11 = 'active' then now() end)
     on conflict (network, external_id) do update set name = excluded.name, url = excluded.url, price = excluded.price,
       pain = excluded.pain, experienced = excluded.experienced, tracking_id = excluded.tracking_id
     returning id`,
    [network, externalId, name, Number(b.price) || 0, url, String(b.category ?? ''), String(b.pain ?? ''), Boolean(b.experienced),
      trackingId, Number(b.commissionRate) || 0, b.activate ? 'active' : 'candidate']
  );
  return { id: row.id };
});

export const PATCH = studioHandler(async (request) => {
  const { id, status, experienced } = await request.json();
  if (status && !['active', 'candidate', 'retired'].includes(status)) throw badRequest('invalid status');
  if (status) {
    await query(
      `update products set status = $2,
         activated_at = case when $2 = 'active' then now() else activated_at end,
         retired_at = case when $2 = 'retired' then now() else retired_at end where id = $1`,
      [id, status]
    );
    if (status === 'retired') await query(`update posts set status = 'rejected' where product_id = $1 and status in ('draft','approved','scheduled','flagged')`, [id]);
  }
  if (typeof experienced === 'boolean') await query('update products set experienced = $2 where id = $1', [id, experienced]);
  return { ok: true };
});
