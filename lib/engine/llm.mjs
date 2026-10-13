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
