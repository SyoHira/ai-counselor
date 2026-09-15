import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5';

let client;
function getClient() {
  // 引数なしの構築で ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / ant プロファイルを解決する
  client ??= new Anthropic();
  return client;
}

export const anthropicProvider = {
  id: 'anthropic',
  model: MODEL,
  enabled: () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),

  async ask(questionText) {
    const res = await getClient().messages.create({
      model: MODEL,
      // 消費者向けの回答は長くないが、思考ぶんの余裕を持たせる
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: questionText }],
    });

    if (res.stop_reason === 'refusal') {
      return {
        text: '',
        refused: true,
        refusalCategory: res.stop_details?.category ?? null,
        raw: { id: res.id, model: res.model, stop_reason: res.stop_reason },
      };
    }

    const text = res.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    return {
      text,
      refused: false,
      raw: {
        id: res.id,
        model: res.model,
        stop_reason: res.stop_reason,
        usage: res.usage,
      },
    };
  },
};
