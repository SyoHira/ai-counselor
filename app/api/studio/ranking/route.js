import { checkStudioAuth } from '@/lib/affiliate/auth.mjs';
import { fetchRanking, rankingToText } from '@/lib/affiliate/rakuten.mjs';

export async function GET(request) {
  const auth = checkStudioAuth(request);
  if (!auth.ok) {
    return Response.json({ error: 'UNAUTHORIZED', message: auth.message }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  try {
    const items = await fetchRanking({ genreId: searchParams.get('genreId') || '0' });
    return Response.json({ items, text: rankingToText(items) });
  } catch (error) {
    const status = error.code === 'RAKUTEN_NOT_CONFIGURED' ? 503 : 502;
    return Response.json({ error: error.code || 'RAKUTEN_ERROR', message: error.message }, { status });
  }
}
