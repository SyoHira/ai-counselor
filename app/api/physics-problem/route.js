import Anthropic from '@anthropic-ai/sdk';
import { buildProblemPrompt, GRADER_PROMPT } from '../../../lib/physics/tutorPrompt.js';
import { MODEL, getApiKey, missingKeyResponse, toErrorResponse, extractJson } from '../../../lib/physics/anthropicError.js';
import { readPhysicsRequest, validateProblem, validateProblems, validateGrade, PhysicsApiError } from '../../../lib/physics/apiValidation.js';

export const maxDuration = 300;

async function complete(client, system, userText, signal, maxTokens = 16000) {
  const message = await client.messages.create({
    model: MODEL, max_tokens: maxTokens, thinking: { type: 'adaptive' },
    system, messages: [{ role: 'user', content: userText }],
  }, { signal });
  if (message.stop_reason !== 'end_turn') {
    throw new PhysicsApiError('AIの応答が完了しませんでした。もう一度お試しください。', 502, 'INCOMPLETE_AI_RESPONSE');
  }
  return message.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
}

export async function POST(request) {
  try {
    const input = validateProblem(await readPhysicsRequest(request));
    const apiKey = getApiKey();
    if (!apiKey) return missingKeyResponse();
    const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 240000 });
    if (input.action === 'generate') {
      const n = input.count;
      const text = await complete(client, buildProblemPrompt(input),
        `${n}問を作成してください。${n >= 2 ? '少なくとも1問は選択式(mc)、1問は記述式(short)にしてください。' : ''}`,
        request.signal);
      return Response.json({ problems: validateProblems(extractJson(text), n) });
    }
    const text = await complete(client, GRADER_PROMPT,
      `対象レベル: ${input.level}\n\n【問題】\n${input.question}\n\n【模範解答】\n${input.answer}\n\n【解説】\n${input.explanation}\n\n【学習者の解答】\n${input.userAnswer}`,
      request.signal, 8000);
    return Response.json(validateGrade(extractJson(text)));
  } catch (error) {
    return toErrorResponse(error);
  }
}
