// 枠の割り当て: 日ごとに「時刻」と「商品」をそれぞれ Thompson sampling で選び、承認済み投稿を入れる（毎日）
import crypto from 'node:crypto';
import { query } from '../db.mjs';
import { config } from '../config.mjs';
import { thompsonAllocate } from '../stats.mjs';
import { loadProductRows, buildProductModel, loadSlotArms } from '../analytics.mjs';
import { jstDate, addDays, jstDateTime } from '../time.mjs';

export async function schedule() {
  const cfg = config();
  const products = await loadProductRows({ statuses: ['active'] });
  if (!products.length) return { skipped: '配信中の商品がありません' };

  const { arms } = buildProductModel(products);
  const slotArms = await loadSlotArms();
  const today = jstDate();
  const summary = { scheduled: 0, days: [] };

  for (let d = 0; d <= cfg.postsQueueDays; d++) {
    const day = addDays(today, d);
    const dayStart = jstDateTime(day, '00:00');
    const dayEnd = jstDateTime(addDays(day, 1), '00:00');
    const existing = await query(
      `select slot_at, product_id from posts where status in ('scheduled','published') and slot_at >= $1 and slot_at < $2`,
      [dayStart, dayEnd]
    );
    const free = cfg.postsPerDay - existing.length;
    if (free <= 0) continue;

    const taken = new Set(existing.map((e) => new Date(e.slot_at).getTime()));
    const now = Date.now() + 10 * 60000; // 10分以上先の枠だけ
    const openSlots = slotArms.filter((s) => {
      const t = jstDateTime(day, s.id).getTime();
      return t > now && !taken.has(t);
    });
    const slots = thompsonAllocate(openSlots, free, { maxPerArm: 1 }).sort();

    // 同じ日に同じ商品は1回まで。在庫がある商品だけが候補
    const usedToday = new Set(existing.map((e) => e.product_id));
    const stocked = await query(`select distinct product_id from posts where status = 'approved'`);
    const stockedIds = new Set(stocked.map((s) => s.product_id));
    const candidates = arms.filter((a) => stockedIds.has(a.id) && !usedToday.has(a.id));
    const picks = thompsonAllocate(candidates, slots.length, { maxPerArm: 1 });

    for (const [i, productId] of picks.entries()) {
      const [post] = await query(
        `select id from posts where product_id = $1 and status = 'approved' order by created_at limit 1`,
        [productId]
      );
      if (!post) continue;
      await query(`update posts set status = 'scheduled', slot_at = $2, link_slug = $3 where id = $1`, [
        post.id,
        jstDateTime(day, slots[i]),
        crypto.randomBytes(5).toString('base64url'),
      ]);
      summary.scheduled++;
    }
    summary.days.push({ day, filled: picks.length, free });
  }
  return summary;
}
