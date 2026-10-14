import { query } from '@/lib/engine/db.mjs';
import { activateOffer } from '@/lib/engine/jobs/offers.mjs';
import { studioHandler, badRequest } from '@/lib/engine/http.mjs';

export const dynamic = 'force-dynamic';

// applied: 提携申請済み / activate: アフィリURLを入れて配信開始 / reject: 使わない / end: 配信停止
export const PATCH = studioHandler(async (request) => {
  const { id, action, affiliateUrl } = await request.json();
  if (action === 'activate') return activateOffer(id, String(affiliateUrl ?? '').trim());
  const status = { applied: 'applied', reject: 'rejected', end: 'ended' }[action];
  if (!status) throw badRequest('unknown action');
  await query('update offers set status = $2 where id = $1', [id, status]);
  if (status === 'ended') {
    await query(`update products set status = 'retired', retired_at = now() where id = (select product_id from offers where id = $1)`, [id]);
  }
  return { ok: true };
});
