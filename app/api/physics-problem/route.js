import Anthropic from '@anthropic-ai/sdk';
import { buildProblemPrompt, GRADER_PROMPT } from '@/lib/physics/tutorPrompt';
import { getModule } from '@/lib/physics/curriculum';
import { MODEL, getApiKey, missingKeyResponse, toErrorResponse, extractJson } from '@/lib/physics/anthropicError';

export const maxDuration = 300;

async function complete(client, system, userText, maxTokens = 16000) {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    thinking: { type: 'adaptive' },
    system,
    messages: [{ role: 'user', content: userText }],
  });
  if (message.stop_reason === 'refusal') {
    throw new Error('リクエストが安全性の理由で処理されませんでした。');
  }
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;
    const apiKey = getApiKey();
    if (!apiKey) return missingKeyResponse();
    const client = new Anthropic({ apiKey });

    if (action === 'generate') {
      const { moduleId, level = 'ug', difficulty = 'standard', count = 3 } = body;
      const mod = moduleId ? getModule(moduleId) : null;
      const system = buildProblemPrompt({ level, module: mod, difficulty });
      const n = Math.min(Math.max(parseInt(count, 10) || 3, 1), 5);
      const text = await complete(
        client,
        system,
        `${n}問を作成してください。${n >= 2 ? '少なくとも1問は選択式(mc)、1問は記述式(short)にしてください。' : ''}`
      );
      const json = extractJson(text);
      if (!json || !Array.isArray(json.problems)) {
        return Response.json({ error: 'PARSE_ERROR', message: '問題の生成結果を解釈できませんでした。もう一度お試しください。' }, { status: 502 });
      }
      const problems = json.problems.slice(0, n).map((p, i) => ({
        id: p.id || `p${i + 1}`,
        type: p.type === 'mc' && Array.isArray(p.choices) && p.choices.length >= 2 ? 'mc' : 'short',
        question: String(p.question || ''),
        choices: Array.isArray(p.choices) ? p.choices.map(String) : [],
        answer: String(p.answer || ''),
        explanation: String(p.explanation || ''),
        hint: String(p.hint || ''),
      })).filter((p) => p.question);
      return Response.json({ problems });
    }

    if (action === 'grade') {
      const { question, answer, userAnswer, explanation, level = 'ug' } = body;
      if (!question || !userAnswer) {
        return Response.json({ error: 'INVALID_REQUEST', message: '問題文と解答が必要です。' }, { status: 400 });
      }
      const text = await complete(
        client,
        GRADER_PROMPT,
        `対象レベル: ${level}

【問題】
${String(question).slice(0, 4000)}

【模範解答】
${String(answer || '（未提供）').slice(0, 4000)}

【解説】
${String(explanation || '（未提供）').slice(0, 4000)}

【学習者の解答】
${String(userAnswer).slice(0, 4000)}`,
        8000
      );
      const json = extractJson(text);
      if (!json) {
        return Response.json({ error: 'PARSE_ERROR', message: '採点結果を解釈できませんでした。' }, { status: 502 });
      }
      return Response.json({
        correct: Boolean(json.correct),
        score: Math.max(0, Math.min(100, parseInt(json.score, 10) || 0)),
        feedback: String(json.feedback || ''),
        misconception: String(json.misconception || ''),
      });
    }

    return Response.json({ error: 'INVALID_ACTION', message: 'action は generate か grade を指定してください。' }, { status: 400 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
