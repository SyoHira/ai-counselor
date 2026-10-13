import { NextResponse } from 'next/server';
import { COOKIE_MAX_AGE, COOKIE_NAME, passcodeEnabled, safeEqual, safeNext, unlockToken } from '../../../lib/passcode.js';

export async function POST(request) {
  if (!passcodeEnabled()) return NextResponse.json({ ok: true, next: '/physics' });
  let body;
  try { body = await request.json(); } catch { body = {}; }
  // 総当たりを遅らせる
  await new Promise(resolve => setTimeout(resolve, 400));
  if (!safeEqual(String(body.passcode ?? ''), process.env.APP_PASSCODE)) {
    return NextResponse.json({ error: 'パスコードが違います。' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true, next: safeNext(body.next) });
  res.cookies.set(COOKIE_NAME, await unlockToken(), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
