// LINE Messaging API（署名検証・返信・プッシュ・マルチキャスト）
import crypto from 'node:crypto';

const API = 'https://api.line.me/v2/bot/message';

export function lineConfigured() {
  return Boolean(process.env.LINE_CHANNEL_SECRET && process.env.LINE_CHANNEL_ACCESS_TOKEN);
}

export function verifySignature(rawBody, signature, secret = process.env.LINE_CHANNEL_SECRET) {
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest();
  const given = Buffer.from(signature, 'base64');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

async function send(path, body) {
  const res = await fetch(`${API}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`LINE ${path}: ${data.message || res.status}`);
  }
}

export const text = (t, quickReply) => ({ type: 'text', text: t.slice(0, 5000), ...(quickReply ? { quickReply } : {}) });

export function quickReplies(items) {
  return { items: items.map(({ label, data }) => ({ type: 'action', action: { type: 'postback', label: label.slice(0, 20), data, displayText: label } })) };
}

export const reply = (replyToken, messages) => send('reply', { replyToken, messages });
export const push = (to, messages) => send('push', { to, messages });
// 同じ本文を最大500人に一括送信
export async function multicast(userIds, messages) {
  for (let i = 0; i < userIds.length; i += 500) await send('multicast', { to: userIds.slice(i, i + 500), messages });
}
