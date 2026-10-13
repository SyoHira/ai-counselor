// Threads Graph API（自分のアカウントへの投稿・返信・インサイト取得）。
// アクセストークンは長期トークン（60日）。settings に保存し、refresh ジョブで更新する。
import { getSetting, setSetting } from '../db.mjs';

const BASE = 'https://graph.threads.net/v1.0';

export async function threadsCredentials() {
  const token = (await getSetting('threads_token'))?.token || process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  return token && userId ? { token, userId } : null;
}

async function post(url, params) {
  const res = await fetch(url, { method: 'POST', body: new URLSearchParams(params) });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Threads: ${data.error?.message || res.status}`);
  return data;
}

async function createAndPublish({ token, userId }, params) {
  const container = await post(`${BASE}/${userId}/threads`, { media_type: 'TEXT', access_token: token, ...params });
  // コンテナ作成直後は publish が失敗することがあるため少し待つ
  await new Promise((r) => setTimeout(r, Number(process.env.THREADS_PUBLISH_DELAY_MS ?? 3000)));
  const published = await post(`${BASE}/${userId}/threads_publish`, {
    creation_id: container.id,
    access_token: token,
  });
  return published.id;
}

export async function publishText(creds, text) {
  return createAndPublish(creds, { text });
}

export async function publishReply(creds, replyToId, text) {
  return createAndPublish(creds, { text, reply_to_id: replyToId });
}

const METRICS = ['views', 'likes', 'replies', 'reposts', 'quotes', 'shares'];

export async function fetchInsights({ token }, mediaId) {
  const params = new URLSearchParams({ metric: METRICS.join(','), access_token: token });
  const res = await fetch(`${BASE}/${mediaId}/insights?${params}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Threads insights: ${data.error?.message || res.status}`);
  const out = Object.fromEntries(METRICS.map((m) => [m, 0]));
  for (const metric of data.data ?? []) {
    out[metric.name] = metric.total_value?.value ?? metric.values?.[0]?.value ?? 0;
  }
  return out;
}

export async function refreshToken() {
  const creds = await threadsCredentials();
  if (!creds) return { skipped: 'Threads 未設定' };
  const params = new URLSearchParams({ grant_type: 'th_refresh_token', access_token: creds.token });
  const res = await fetch(`https://graph.threads.net/refresh_access_token?${params}`);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Threads token refresh: ${data.error?.message || res.status}`);
  await setSetting('threads_token', { token: data.access_token, expiresIn: data.expires_in, refreshedAt: new Date().toISOString() });
  return { refreshed: true, expiresIn: data.expires_in };
}
