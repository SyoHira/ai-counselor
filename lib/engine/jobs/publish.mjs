// 時刻が来た投稿を Threads に出す。リンクは返信で付ける（15分ごと）
import { query } from '../db.mjs';
import { config } from '../config.mjs';
import { threadsCredentials, publishText, publishReply } from '../channels/threads.mjs';

const STALE_MS = 3 * 3600000; // 3時間以上遅れた枠は出さずに再割り当てへ戻す

export function linkFor(post, product, cfg = config()) {
  if (product.network === 'amazon') return product.url; // Amazon はリンク直貼り（トラッキングIDで計測）
  return cfg.publicBaseUrl ? `${cfg.publicBaseUrl}/go/${post.link_slug}` : product.url;
}

export async function publish() {
  const cfg = config();
  const creds = await threadsCredentials();
  if (!creds) return { skipped: 'THREADS_USER_ID / THREADS_ACCESS_TOKEN 未設定' };

  const due = await query(
    `select po.*, p.network, p.url, p.name from posts po join products p on p.id = po.product_id
     where po.status = 'scheduled' and po.slot_at <= now() order by po.slot_at limit 5`
  );
  const summary = { published: 0, requeued: 0, failed: 0 };

  for (const post of due) {
    if (Date.now() - new Date(post.slot_at).getTime() > STALE_MS) {
      await query(`update posts set status = 'approved', slot_at = null where id = $1`, [post.id]);
      summary.requeued++;
      continue;
    }
    // 二重投稿防止: 先に publishing に変えられた行だけ処理する
    const claimed = await query(`update posts set status = 'publishing' where id = $1 and status = 'scheduled' returning id`, [post.id]);
    if (!claimed.length) continue;

    try {
      const mediaId = await publishText(creds, post.text);
      let replyId = null;
      if (cfg.linkMode === 'reply') {
        const label = post.network === 'amazon' ? 'Amazon' : '楽天';
        replyId = await publishReply(creds, mediaId, `▶ ${label}で見る\n${linkFor(post, post)}\n#PR`);
      }
      await query(
        `update posts set status = 'published', published_at = now(), threads_media_id = $2, threads_reply_id = $3, error = null where id = $1`,
        [post.id, mediaId, replyId]
      );
      summary.published++;
    } catch (e) {
      await query(`update posts set status = 'failed', error = $2 where id = $1`, [post.id, e.message]);
      summary.failed++;
    }
  }
  return summary;
}
