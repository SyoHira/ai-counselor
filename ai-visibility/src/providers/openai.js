/**
 * OpenAI アダプタ（任意）。
 *
 * OPENAI_API_KEY が設定されているときだけ計測対象に加わる。
 * 有効化する前に、利用規約で「回答の記録・比較・第三者への提供」が
 * 許容されているかを必ず確認すること。規約外の自動アクセスはしない。
 *
 * OPENAI_MODEL は自分で指定する。ここで既定値を決め打ちすると、
 * 存在しないモデル名で静かに失敗する。
 */

const MODEL = process.env.OPENAI_MODEL;

export const openaiProvider = {
  id: 'openai',
  get model() {
    return MODEL;
  },
  enabled: () => Boolean(process.env.OPENAI_API_KEY && MODEL),

  async ask(questionText) {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: questionText }],
      }),
    });

    if (!res.ok) {
      throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    const json = await res.json();
    return {
      text: json.choices?.[0]?.message?.content ?? '',
      refused: false,
      raw: { id: json.id, model: json.model, usage: json.usage },
    };
  },
};
