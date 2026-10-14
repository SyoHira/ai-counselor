// Claude 構造化出力の共通呼び出し（Studio API と自動運転ジョブで共用）
import Anthropic from '@anthropic-ai/sdk';
import { studioSystemPrompt } from '../affiliate/prompts.mjs';
import { config } from './config.mjs';

export class LlmError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

let client;

export function llmConfigured() {
  const key = process.env.ANTHROPIC_API_KEY;
  return Boolean(key && key !== 'your-api-key-here');
}

export async function generateJson({ schema, prompt, effort = 'medium' }) {
  if (!llmConfigured()) throw new LlmError('API_KEY_NOT_CONFIGURED', 'ANTHROPIC_API_KEY が設定されていません。');
  client ??= new Anthropic();

  // 長い出力でもタイムアウトしないよう stream → finalMessage。拒否時はサーバー側で別モデルにフォールバック
  const message = await client.beta.messages
    .stream({
      model: config().model,
      max_tokens: 32000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: studioSystemPrompt,
      output_config: { effort, format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: prompt }],
    })
    .finalMessage();

  if (message.stop_reason === 'refusal') throw new LlmError('REFUSAL', 'この内容は生成できませんでした。入力を見直してください。');
  if (message.stop_reason === 'max_tokens') throw new LlmError('TOO_LONG', '出力が長すぎました。件数を減らしてください。');

  const text = message.content.find((b) => b.type === 'text')?.text ?? '';
  return { result: JSON.parse(text), usage: message.usage };
}

// Web検索つきの調査（Claude のサーバー側 web_search）。本文と参照したURLを返す。
// サーバー側ループが上限に達すると pause_turn で返るので、応答をそのまま足して続きを依頼する
export async function researchWeb({ prompt, maxUses = 8, maxContinuations = 4 }) {
  if (!llmConfigured()) throw new LlmError('API_KEY_NOT_CONFIGURED', 'ANTHROPIC_API_KEY が設定されていません。');
  client ??= new Anthropic();

  const messages = [{ role: 'user', content: prompt }];
  const texts = [];
  const sources = new Map();
  for (let i = 0; i <= maxContinuations; i++) {
    const message = await client.beta.messages
      .stream({
        model: config().model,
        max_tokens: 32000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxUses, user_location: { type: 'approximate', country: 'JP' } }],
        messages,
      })
      .finalMessage();

    for (const block of message.content) {
      if (block.type === 'text') texts.push(block.text);
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const r of block.content) if (r.url) sources.set(r.url, r.title ?? '');
      }
    }
    if (message.stop_reason === 'refusal') throw new LlmError('REFUSAL', '調査を実行できませんでした。');
    if (message.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: message.content });
  }
  return { text: texts.join('\n'), sources: [...sources].map(([url, title]) => ({ url, title })) };
}

// 会話の返答（LINE での AI 相談）。短く速く返すため effort は low
export async function generateText({ system, messages, maxTokens = 1200, effort = 'low' }) {
  if (!llmConfigured()) throw new LlmError('API_KEY_NOT_CONFIGURED', 'ANTHROPIC_API_KEY が設定されていません。');
  client ??= new Anthropic();
  const message = await client.beta.messages
    .stream({
      model: config().model,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      output_config: { effort },
      messages,
    })
    .finalMessage();
  if (message.stop_reason === 'refusal') throw new LlmError('REFUSAL', 'refused');
  return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}
