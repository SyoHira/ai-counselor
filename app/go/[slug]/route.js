import crypto from 'node:crypto';
import { one, query } from '@/lib/engine/db.mjs';

export const dynamic = 'force-dynamic';

// リンクプレビュー用のクローラーはクリックに数えない
const BOT = /bot|crawler|spider|preview|facebookexternalhit|meta-externalagent|slack|discord|curl|wget/i;

export async function GET(request, { params }) {
  const row = await one(
    `select po.id as post_id, p.id as product_id, p.url from posts po join products p on p.id = po.product_id where po.link_slug = $1`,
    [params.slug]
  );
  if (!row?.url) return new Response('Not found', { status: 404 });

  const ua = request.headers.get('user-agent') ?? '';
  if (!BOT.test(ua)) {
    // 同一人物の重複を日単位で数えられるよう、IP+UA+日付のハッシュだけ保存（生IPは保存しない）
    const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
    const day = new Date().toISOString().slice(0, 10);
    const visitor = crypto.createHash('sha256').update(`${ip}|${ua}|${day}`).digest('hex').slice(0, 16);
    await query('insert into clicks (slug, post_id, product_id, visitor, referer) values ($1,$2,$3,$4,$5)', [
      params.slug, row.post_id, row.product_id, visitor, (request.headers.get('referer') ?? '').slice(0, 200),
    ]);
  }
  return Response.redirect(row.url, 302);
}
