// 公開デプロイ用のパスコード保護。APP_PASSCODE が未設定ならローカル開発とみなして保護しない。
// middleware（Edge）と API（Node）の両方で動くよう Web Crypto だけを使う。

export const COOKIE_NAME = 'physics_unlock';
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export function passcodeEnabled(env = process.env) {
  return Boolean(env.APP_PASSCODE);
}

// クッキーにはパスコードそのものではなく、APP_SECRET で署名した値だけを置く
export async function unlockToken(env = process.env) {
  const secret = env.APP_SECRET || env.APP_PASSCODE;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`unlock:${env.APP_PASSCODE}`));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function isUnlocked(cookieValue, env = process.env) {
  if (!passcodeEnabled(env)) return true;
  if (!cookieValue) return false;
  return safeEqual(cookieValue, await unlockToken(env));
}

// 外部URLへのリダイレクトに使われないよう、同一サイト内のパスだけを通す
export function safeNext(next) {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/physics';
  return next;
}
