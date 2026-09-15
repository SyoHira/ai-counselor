/**
 * Google Gemini アダプタ（任意）。
 *
 * GEMINI_API_KEY と GEMINI_MODEL の両方が設定されているときだけ有効。
 * 有効化前に利用規約を確認すること（openai.js と同じ理由）。
 */

const MODEL = process.env.GEMINI_MODEL;

export const geminiProvider = {
  id: 'gemini',
  get model() {
    return MODEL;
  },
  enabled: () => Boolean(process.env.GEMINI_API_KEY && MODEL),

  async ask(questionText) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: questionText }] }],
      }),
    });

    if (!res.ok) {
      throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }

    const json = await res.json();
    const text = (json.candidates?.[0]?.content?.parts ?? [])
      .map((p) => p.text ?? '')
      .join('\n');

    return {
      text,
      refused: false,
      raw: { model: MODEL, finishReason: json.candidates?.[0]?.finishReason },
    };
  },
};
