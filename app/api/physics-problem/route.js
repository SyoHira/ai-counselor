import { buildProblemPrompt, GRADER_PROMPT } from '../../../lib/physics/tutorPrompt.js';
import { toErrorResponse, extractJson } from '../../../lib/physics/ai/errorResponse.js';
import { planProviders, completeWithFallback } from '../../../lib/physics/ai/router.js';
import { readPhysicsRequest, validateProblem, validateProblems, validateGrade } from '../../../lib/physics/apiValidation.js';

export const maxDuration = 300;

export async function POST(request) {
  try {
    const input = validateProblem(await readPhysicsRequest(request));
    const providers = planProviders(input.provider);
    if (input.action === 'generate') {
      const n = input.count;
      const { value, by } = await completeWithFallback(providers, {
        feature: 'generate', system: buildProblemPrompt(input), maxTokens: 16000, signal: request.signal,
        messages: [{ role: 'user', content: `${n}問を作成してください。${n >= 2 ? '少なくとも1問は選択式(mc)、1問は記述式(short)にしてください。' : ''}` }],
      }, text => validateProblems(extractJson(text), n));
      return Response.json({ problems: value, by });
    }
    const { value, by } = await completeWithFallback(providers, {
      feature: 'grade', system: GRADER_PROMPT, maxTokens: 8000, signal: request.signal,
      messages: [{ role: 'user', content: `対象レベル: ${input.level}\n\n【問題】\n${input.question}\n\n【模範解答】\n${input.answer}\n\n【解説】\n${input.explanation}\n\n【学習者の解答】\n${input.userAnswer}` }],
    }, text => validateGrade(extractJson(text)));
    return Response.json({ ...value, by });
  } catch (error) {
    return toErrorResponse(error);
  }
}
