import Anthropic from '@anthropic-ai/sdk';
import { PhysicsApiError } from './apiValidation.js';

export const MODEL = 'claude-opus-5';

export function getApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === 'your-api-key-here') return null;
  return key;
}

export function missingKeyResponse() {
  return Response.json(
    {
      error: 'API_KEY_NOT_CONFIGURED',
      message: 'ANTHROPIC_API_KEY が設定されていません。.env.local に設定してください。',
    },
    { status: 503 }
  );
}

export function toErrorResponse(error) {
  if (error instanceof PhysicsApiError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return Response.json({ error: 'AUTH_ERROR', message: 'APIキーが無効です。' }, { status: 401 });
  }
  if (error instanceof Anthropic.RateLimitError) {
    return Response.json({ error: 'RATE_LIMIT', message: 'リクエストが多すぎます。少し待ってから再試行してください。' }, { status: 429 });
  }
  if (error instanceof Anthropic.BadRequestError) {
    return Response.json({ error: 'BAD_REQUEST', message: 'AIへのリクエストを処理できませんでした。設定または入力を確認してください。' }, { status: 400 });
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status === 529 ? 503 : error.status || 500;
    return Response.json(
      { error: 'API_ERROR', message: status === 503 ? 'AIサーバーが混雑しています。時間を置いてお試しください。' : 'APIエラーが発生しました。' },
      { status }
    );
  }
  console.error('physics api error:', error?.message || error);
  return Response.json({ error: 'UNKNOWN', message: '予期しないエラーが発生しました。' }, { status: 500 });
}

/** モデル出力からJSONを取り出す（コードフェンスや前置きが混ざっても復元する） */
export function extractJson(text) {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : trimmed;
  try {
    return JSON.parse(body);
  } catch {
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}
