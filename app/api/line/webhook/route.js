import { verifySignature, lineConfigured } from '@/lib/engine/channels/line.mjs';
import { handleLineEvent } from '@/lib/engine/line-bot.mjs';
import { systemPrompt } from '@/lib/systemPrompt';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  if (!lineConfigured()) return new Response('LINE not configured', { status: 503 });
  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get('x-line-signature'))) return new Response('invalid signature', { status: 401 });

  const { events = [] } = JSON.parse(raw);
  // 1件の失敗で他のイベントを落とさない。LINE には常に 200 を返す（再送の嵐を避ける）
  await Promise.all(
    events.map((e) => handleLineEvent(e, { systemPrompt }).catch((err) => console.error('LINE event error:', err.message)))
  );
  return new Response('ok');
}
