// 公開済み投稿の反応を取得（6時間ごと）。公開から21日以内のものだけ追う
import { query } from '../db.mjs';
import { threadsCredentials, fetchInsights } from '../channels/threads.mjs';

export async function metrics() {
  const creds = await threadsCredentials();
  if (!creds) return { skipped: 'Threads 未設定' };
  const posts = await query(
    `select id, threads_media_id from posts where status = 'published' and threads_media_id is not null
     and published_at > now() - interval '21 days'`
  );
  const summary = { updated: 0, errors: 0 };
  for (const post of posts) {
    try {
      const m = await fetchInsights(creds, post.threads_media_id);
      await query(
        `insert into post_metrics (post_id, views, likes, replies, reposts, quotes, shares, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7, now())
         on conflict (post_id) do update set views = excluded.views, likes = excluded.likes, replies = excluded.replies,
           reposts = excluded.reposts, quotes = excluded.quotes, shares = excluded.shares, updated_at = now()`,
        [post.id, m.views, m.likes, m.replies, m.reposts, m.quotes, m.shares]
      );
      summary.updated++;
    } catch {
      summary.errors++;
    }
  }
  return summary;
}
