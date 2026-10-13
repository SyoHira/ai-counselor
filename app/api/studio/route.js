import Anthropic from '@anthropic-ai/sdk';
import { checkStudioAuth } from '@/lib/affiliate/auth';
import {
  studioSystemPrompt,
  selectSchema,
  selectPrompt,
  painsSchema,
  painsPrompt,
  postsSchema,
  postsPrompt,
  reviewSchema,
  reviewPrompt,
} from '@/lib/affiliate/prompts';

export const maxDuration = 300;

const MODEL = process.env.STUDIO_MODEL || 'claude-opus-5-5';

function clip(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function cleanProduct(p = {}) {
  return {
    name: clip(p.name, 200),
    price: Number(p.price) || 0,
    category: clip(p.category, 50),
    painOneLiner: clip(p.painOneLiner, 100),
    experienced: Boolean(p.experienced),
    postCount: Number(p.postCount) || 0,
  };
}

// task → { schema, prompt }
function buildTask(task, input = {}) {
  const priceTarget = Number(input.priceTarget) || 5000;
  switch (task) {
    case 'select':
      if (!input.rankingText?.trim()) return null;
      return {
        schema: selectSchema,
        prompt: selectPrompt({
          rankingText: clip(input.rankingText, 60000),
          priceTarget,
          count: Math.min(Number(input.count) || 10, 20),
          avoidNames: (input.avoidNames || []).slice(0, 50).map((n) => clip(n, 200)),
        }),
      };
    case 'pains':
      if (!input.product?.name) return null;
      return {
        schema: painsSchema,
        prompt: painsPrompt({
          product: cleanProduct(input.product),
          count: Math.min(Number(input.count) || 30, 50),
        }),
      };
    case 'posts':
      if (!input.product?.name || !Array.isArray(input.pains) || input.pains.length === 0) return null;
      return {
        schema: postsSchema,
        prompt: postsPrompt({
          product: cleanProduct(input.product),
          pains: input.pains.slice(0, 30).map((p) => ({ text: clip(p.text, 200), scene: clip(p.scene, 200) })),
        }),
      };
    case 'review':
      if (!input.report?.trim()) return null;
      return {
        schema: reviewSchema,
        prompt: reviewPrompt({
          report: clip(input.report, 30000),
          products: (input.products || []).slice(0, 30).map(cleanProduct),
          rankingText: clip(input.rankingText, 60000),
          priceTarget,
        }),
      };
    default:
      return null;
  }
}

export async function POST(request) {
  const auth = checkStudioAuth(request);
  if (!auth.ok) {
    return Response.json({ error: 'UNAUTHORIZED', message: auth.message }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your-api-key-here') {
    return Response.json(
      { error: 'API_KEY_NOT_CONFIGURED', message: 'ANTHROPIC_API_KEY が設定されていません。' },
      { status: 503 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'INVALID_REQUEST', message: 'JSONが不正です。' }, { status: 400 });
  }

  const built = buildTask(body.task, body.input);
  if (!built) {
    return Response.json({ error: 'INVALID_REQUEST', message: '入力が足りません。' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });

  try {
    // 投稿30本分の長い出力でもタイムアウトしないよう stream → finalMessage
    const message = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: studioSystemPrompt,
        output_config: {
          effort: 'medium',
          format: { type: 'json_schema', schema: built.schema },
        },
        messages: [{ role: 'user', content: built.prompt }],
      })
      .finalMessage();

    if (message.stop_reason === 'refusal') {
      return Response.json({ error: 'REFUSAL', message: 'この内容は生成できませんでした。入力を見直してください。' }, { status: 422 });
    }
    if (message.stop_reason === 'max_tokens') {
      return Response.json({ error: 'TOO_LONG', message: '出力が長すぎました。件数を減らしてください。' }, { status: 422 });
    }

    const text = message.content.find((b) => b.type === 'text')?.text ?? '';
    return Response.json({ result: JSON.parse(text), usage: message.usage });
  } catch (error) {
    console.error('Studio API error:', error?.message || error);
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: 'AUTH_ERROR', message: 'APIキーが無効です。' }, { status: 401 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: 'RATE_LIMIT', message: 'リクエストが多すぎます。少し時間を置いてください。' }, { status: 429 });
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json({ error: 'API_ERROR', message: `AI APIエラー (${error.status})` }, { status: 502 });
    }
    return Response.json({ error: 'UNKNOWN', message: '予期しないエラーが発生しました。' }, { status: 500 });
  }
}
