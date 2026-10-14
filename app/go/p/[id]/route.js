import crypto from 'node:crypto';
import { one, query } from '@/lib/engine/db.mjs';

export const dynamic = 'force-dynamic';

const BOT = /bot|crawler|spider|preview|facebookexternalhit|meta-externalagent|slack|discord|curl|wget/i;

// ガイドページからの商品リンク（/go/p/<商品ID>?g=<ガイド>）。クリックを記録して広告主ページへ
export async function GET(request, { params }) {
  const product = await one(`select id, url from products where id = $1 and status = 'active'`, [Number(params.id) || 0]);
  if (!product?.url) return new Response('Not found', { status: 404 });

  const ua = request.headers.get('user-agent') ?? '';
  if (!BOT.test(ua)) {
    const guide = (new URL(request.url).searchParams.get('g') ?? '').slice(0, 40);
    const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim();
    const day = new Date().toISOString().slice(0, 10);
    const visitor = crypto.createHash('sha256').update(`${ip}|${ua}|${day}`).digest('hex').slice(0, 16);
    await query('insert into clicks (slug, post_id, product_id, visitor, referer) values ($1, null, $2, $3, $4)', [
      `guide:${guide}`, product.id, visitor, (request.headers.get('referer') ?? '').slice(0, 200),
    ]);
  }
  return Response.redirect(product.url, 302);
}
