import { getModule } from './curriculum.js';
import { getProblem } from './problems.js';

export class PhysicsApiError extends Error {
  constructor(message, status = 400, code = 'INVALID_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 8000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const invalid = () => { throw new PhysicsApiError('入力の形式・長さ・選択値を確認してください。'); };
const badOutput = () => { throw new PhysicsApiError('AIの応答を解釈できませんでした。もう一度お試しください。', 502, 'INVALID_AI_RESPONSE'); };

/** Limit bytes while reading, including requests without Content-Length. */
export async function readPhysicsRequest(request) {
  const limit = 256 * 1024;
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new PhysicsApiError('JSON形式で送信してください。', 415, 'UNSUPPORTED_MEDIA_TYPE');
  }
  if (Number(request.headers.get('content-length')) > limit) {
    throw new PhysicsApiError('入力が長すぎます。', 413, 'REQUEST_TOO_LARGE');
  }
  if (!request.body) invalid();
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, raw = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new PhysicsApiError('入力が長すぎます。', 413, 'REQUEST_TOO_LARGE');
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  let body;
  try { body = JSON.parse(raw); } catch { invalid(); }
  if (!object(body)) invalid();
  return body;
}

const PROVIDERS = ['auto', 'gemini', 'openrouter', 'ollama', 'anthropic'];

function context(body) {
  const provider = body.provider ?? 'auto';
  if (!PROVIDERS.includes(provider)) invalid();
  const level = body.level ?? 'ug';
  if (!['hs', 'ug', 'grad', 'phd'].includes(level)) invalid();
  const moduleId = body.moduleId ?? '';
  if (typeof moduleId !== 'string' || (moduleId && !getModule(moduleId))) invalid();
  return { provider, level, module: moduleId ? getModule(moduleId) : null };
}

export function validateTutor(body) {
  const ctx = context(body);
  const mode = body.mode ?? 'intuition';
  if (!['intuition', 'derive', 'example', 'socratic', 'check', 'research'].includes(mode)) invalid();
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 24) invalid();
  if (!body.messages.every(m => object(m) && ['user', 'assistant'].includes(m.role) && text(m.content))) invalid();
  if (body.messages.at(-1).role !== 'user') invalid();
  const problemId = body.problemId ?? '';
  if (typeof problemId !== 'string') invalid();
  const problem = problemId ? getProblem(problemId) : null;
  if (problemId && !problem) invalid();
  // 問題を指定するなら、その問題が属する単元と一致していなければならない
  if (problem && (!ctx.module || problem.module !== ctx.module.id)) invalid();
  return { ...ctx, mode, problem, messages: body.messages.map(({ role, content }) => ({ role, content })) };
}

export function validateProblem(body) {
  const ctx = context(body);
  if (body.action === 'generate') {
    const difficulty = body.difficulty ?? 'standard';
    const count = body.count ?? 3;
    if (!['easy', 'standard', 'hard'].includes(difficulty) || !Number.isInteger(count) || count < 1 || count > 5) invalid();
    return { ...ctx, difficulty, count, action: 'generate' };
  }
  if (body.action === 'grade') {
    if (!text(body.question, 4000) || !text(body.userAnswer, 4000) || !text(body.answer, 4000)) invalid();
    if (body.explanation !== undefined && (typeof body.explanation !== 'string' || body.explanation.length > 4000)) invalid();
    return { ...ctx, action: 'grade', question: body.question, answer: body.answer, userAnswer: body.userAnswer, explanation: body.explanation || '' };
  }
  invalid();
}

export function validateProblems(json, count) {
  if (!object(json) || !Array.isArray(json.problems) || json.problems.length !== count) badOutput();
  return json.problems.map((p, i) => {
    if (!object(p) || !['mc', 'short'].includes(p.type) || !text(p.question, 4000) || !text(p.answer, 4000) || !text(p.explanation, 4000)) badOutput();
    if (typeof p.hint !== 'string' || p.hint.length > 4000 || !Array.isArray(p.choices)) badOutput();
    if (p.type === 'mc' && (p.choices.length < 2 || p.choices.length > 6 || !p.choices.every(c => text(c, 4000)) || new Set(p.choices).size !== p.choices.length || !p.choices.includes(p.answer))) badOutput();
    if (p.type === 'short' && p.choices.length) badOutput();
    return { id: `p${i + 1}`, type: p.type, question: p.question, choices: p.choices, answer: p.answer, explanation: p.explanation, hint: p.hint };
  });
}

export function validateGrade(json) {
  if (!object(json) || typeof json.correct !== 'boolean' || !Number.isInteger(json.score) || json.score < 0 || json.score > 100 || !text(json.feedback)) badOutput();
  if (json.misconception !== undefined && (typeof json.misconception !== 'string' || json.misconception.length > 8000)) badOutput();
  return { correct: json.correct, score: json.score, feedback: json.feedback, misconception: json.misconception || '' };
}
