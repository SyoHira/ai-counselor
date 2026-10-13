// Studio は運用者専用。STUDIO_PASSWORD 未設定時は開発環境のみ許可する。
export function checkStudioAuth(request) {
  const password = process.env.STUDIO_PASSWORD;
  if (!password) {
    return process.env.NODE_ENV === 'production'
      ? { ok: false, message: 'STUDIO_PASSWORD を設定してください。' }
      : { ok: true };
  }
  return request.headers.get('x-studio-password') === password
    ? { ok: true }
    : { ok: false, message: 'パスワードが違います。' };
}
