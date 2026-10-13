import { NextResponse } from 'next/server';
import { COOKIE_NAME, isUnlocked, passcodeEnabled } from './lib/passcode.js';

export async function middleware(request) {
  if (!passcodeEnabled()) return NextResponse.next();
  if (await isUnlocked(request.cookies.get(COOKIE_NAME)?.value)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'パスコードを入力してください。', code: 'LOCKED' }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = '/unlock';
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|unlock|api/unlock).*)'],
};
