import { query, one } from '@/lib/engine/db.mjs';
import { lineCheck } from '@/lib/engine/jobs/line.mjs';
import { studioHandler, badRequest } from '@/lib/engine/http.mjs';

export const dynamic = 'force-dynamic';

// ステップ配信の本文: approve / edit（再判定）/ regenerate（削除して次回の line-steps で作り直す）
export const PATCH = studioHandler(async (request) => {
  const { id, action, text } = await request.json();
  const step = await one('select * from line_steps where id = $1', [id]);
  if (!step) throw badRequest('step not found');
  if (action === 'approve') {
    const issues = lineCheck(step.text);
    if (issues.length) throw badRequest(`承認できません: ${issues.join(' / ')}`);
    await query(`update line_steps set status = 'approved' where id = $1`, [id]);
  } else if (action === 'edit') {
    if (typeof text !== 'string' || !text.trim()) throw badRequest('text required');
    const issues = lineCheck(text);
    await query('update line_steps set text = $2, status = $3, compliance = $4 where id = $1', [
      id, text, issues.length ? 'flagged' : 'draft', JSON.stringify({ issues }),
    ]);
    return { issues };
  } else if (action === 'regenerate') {
    await query('delete from line_steps where segment = $1', [step.segment]);
  } else {
    throw badRequest('unknown action');
  }
  return { ok: true };
});
