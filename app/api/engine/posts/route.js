import { query, one } from '@/lib/engine/db.mjs';
import { ruleCheck } from '@/lib/engine/compliance.mjs';
import { studioHandler, badRequest } from '@/lib/engine/http.mjs';

export const dynamic = 'force-dynamic';

// approve / reject / edit（編集時はルール判定をやり直す）
export const PATCH = studioHandler(async (request) => {
  const { id, action, text } = await request.json();
  const post = await one(
    'select po.*, p.network, p.experienced, p.category from posts po join products p on p.id = po.product_id where po.id = $1',
    [id]
  );
  if (!post) throw badRequest('post not found');
  if (['published', 'publishing'].includes(post.status)) throw badRequest('公開済みの投稿は変更できません');

  if (action === 'edit') {
    if (typeof text !== 'string' || !text.trim()) throw badRequest('text required');
    const issues = ruleCheck(text, post);
    await query(`update posts set text = $2, compliance = $3, status = $4 where id = $1`, [
      id, text, JSON.stringify({ issues, editedAt: new Date().toISOString() }), issues.length ? 'flagged' : 'draft',
    ]);
    return { issues };
  }
  if (action === 'approve') {
    const issues = ruleCheck(post.text, post);
    if (issues.length) throw badRequest(`承認できません: ${issues.join(' / ')}`);
    await query(`update posts set status = 'approved' where id = $1`, [id]);
    return { ok: true };
  }
  if (action === 'reject') {
    await query(`update posts set status = 'rejected', slot_at = null where id = $1`, [id]);
    return { ok: true };
  }
  throw badRequest('unknown action');
});
