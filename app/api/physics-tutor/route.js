import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '../../../lib/physics/tutorPrompt.js';
import { MODEL, getApiKey, missingKeyResponse, toErrorResponse } from '../../../lib/physics/anthropicError.js';
import { readPhysicsRequest, validateTutor, PhysicsApiError } from '../../../lib/physics/apiValidation.js';

export const maxDuration = 300;

export async function POST(request) {
  try {
    const input = validateTutor(await readPhysicsRequest(request));
    const apiKey = getApiKey();
    if (!apiKey) return missingKeyResponse();
    const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 240000 });
    const stream = client.messages.stream({
      model: MODEL, max_tokens: 32000, thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: buildSystemPrompt(input), cache_control: { type: 'ephemeral' } }],
      messages: input.messages,
    }, { signal: request.signal });
    const encoder = new TextEncoder();
    let cancelled = false;
    const readable = new ReadableStream({
      async start(controller) {
        const send = value => { if (!cancelled) controller.enqueue(encoder.encode(`data: ${typeof value === 'string' ? value : JSON.stringify(value)}\n\n`)); };
        try {
          let announcedThinking = false;
          let hasText = false;
          for await (const event of stream) {
            if (event.type !== 'content_block_delta') continue;
            if (event.delta?.type === 'text_delta') {
              hasText ||= Boolean(event.delta.text);
              send({ text: event.delta.text });
            } else if (event.delta?.type === 'thinking_delta' && !announcedThinking) {
              announcedThinking = true;
              send({ phase: 'thinking' });
            }
          }
          const message = await stream.finalMessage();
          if (!hasText || message.stop_reason !== 'end_turn') {
            throw new PhysicsApiError('AIの応答が完了しませんでした。もう一度お試しください。', 502, 'INCOMPLETE_AI_RESPONSE');
          }
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
      cancel() { cancelled = true; stream.abort(); },
    });
    return new Response(readable, { headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive',
    } });
  } catch (error) {
    return toErrorResponse(error);
  }
}
