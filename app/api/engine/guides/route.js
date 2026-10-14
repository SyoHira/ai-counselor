import { query, one } from '@/lib/engine/db.mjs';
import { studioHandler, badRequest } from '@/lib/engine/http.mjs';

export const dynamic = 'force-dynamic';

// publish / unpublish / regenerate（下書きに戻し、次回の guides ジョブで作り直す）
export const PATCH = studioHandler(async (request) => {
  const { slug, action } = await request.json();
  const guide = await one('select * from guides where slug = $1', [slug]);
  if (!guide) throw badRequest('guide not found');
  if (action === 'publish') {
    if (guide.compliance?.issues?.length) throw badRequest(`公開できません: ${guide.compliance.issues.join(' / ')}`);
    await query(`update guides set status = 'published' where slug = $1`, [slug]);
  } else if (action === 'unpublish' || action === 'regenerate') {
    await query(`update guides set status = 'draft' where slug = $1`, [slug]);
  } else {
    throw badRequest('unknown action');
  }
  return { ok: true };
});
