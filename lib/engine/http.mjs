import { checkStudioAuth } from '../affiliate/auth.mjs';

// Studio パスワードで保護した JSON API ハンドラ
export function studioHandler(fn) {
  return async (request, ctx) => {
    const auth = checkStudioAuth(request);
    if (!auth.ok) return Response.json({ error: 'UNAUTHORIZED', message: auth.message }, { status: 401 });
    try {
      return Response.json(await fn(request, ctx));
    } catch (e) {
      const status = e.status ?? 500;
      return Response.json({ error: e.code ?? 'ERROR', message: e.message }, { status });
    }
  };
}

export function badRequest(message) {
  return Object.assign(new Error(message), { status: 400, code: 'INVALID_REQUEST' });
}
