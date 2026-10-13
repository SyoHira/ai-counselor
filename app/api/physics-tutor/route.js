import { buildSystemPrompt } from '../../../lib/physics/tutorPrompt.js';
import { toErrorResponse } from '../../../lib/physics/ai/errorResponse.js';
import { planProviders, streamWithFallback } from '../../../lib/physics/ai/router.js';
import { readPhysicsRequest, validateTutor } from '../../../lib/physics/apiValidation.js';

export const maxDuration = 300;

export async function POST(request) {
  try {
    const input = validateTutor(await readPhysicsRequest(request));
    const providers = planProviders(input.provider);
    const upstream = new AbortController();
    request.signal?.addEventListener('abort', () => upstream.abort(), { once: true });
    const encoder = new TextEncoder();
    let cancelled = false;
    const readable = new ReadableStream({
      async start(controller) {
        const send = value => { if (!cancelled) controller.enqueue(encoder.encode(`data: ${typeof value === 'string' ? value : JSON.stringify(value)}\n\n`)); };
        try {
          await streamWithFallback(providers, {
            feature: 'tutor', system: buildSystemPrompt(input), messages: input.messages, maxTokens: 32000, signal: upstream.signal,
          }, send);
          send({ done: true });
        } catch (error) {
          if (!cancelled) {
            const payload = await toErrorResponse(error).json();
            send({ error: payload.message, code: payload.error });
          }
        } finally {
          if (!cancelled) { send('[DONE]'); controller.close(); }
        }
      },
      cancel() { cancelled = true; upstream.abort(); },
    });
    return new Response(readable, { headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive',
    } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
