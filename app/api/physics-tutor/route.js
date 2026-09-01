import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '@/lib/physics/tutorPrompt';
import { getModule } from '@/lib/physics/curriculum';
import { MODEL, getApiKey, missingKeyResponse, toErrorResponse } from '@/lib/physics/anthropicError';

export const maxDuration = 300;

export async function POST(request) {
  try {
    const { messages, level, mode, moduleId } = await request.json();

    const sanitized = (Array.isArray(messages) ? messages : [])
      .filter((m) => ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' && m.content.trim())
      .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }))
      .slice(-24);

    if (!sanitized.length) {
      return Response.json({ error: 'INVALID_REQUEST', message: 'メッセージが必要です。' }, { status: 400 });
    }

    const apiKey = getApiKey();
    if (!apiKey) return missingKeyResponse();

    const system = buildSystemPrompt({
      level: ['hs', 'ug', 'grad', 'phd'].includes(level) ? level : 'ug',
      mode,
      module: moduleId ? getModule(moduleId) : null,
    });

    const client = new Anthropic({ apiKey });
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      thinking: { type: 'adaptive' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: sanitized,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const send = (obj) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        try {
          let announcedThinking = false;
          for await (const event of stream) {
            if (event.type !== 'content_block_delta') continue;
            if (event.delta?.type === 'text_delta') {
              send({ text: event.delta.text });
            } else if (event.delta?.type === 'thinking_delta' && !announcedThinking) {
              announcedThinking = true;
              send({ phase: 'thinking' });
            }
          }
          send({ done: true });
        } catch (err) {
          send({ error: err?.message || 'ストリームが中断されました。' });
        } finally {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        }
      },
      cancel() {
        stream.abort();
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
