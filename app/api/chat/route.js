import Anthropic from '@anthropic-ai/sdk';
import { systemPrompt } from '@/lib/systemPrompt';

export async function POST(request) {
  try {
    const { messages } = await request.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json(
        { error: 'INVALID_REQUEST', message: 'Messages required' },
        { status: 400 }
      );
    }

    // Sanitize messages — only allow valid roles and string content
    const sanitized = messages
      .filter(
        (m) =>
          ['user', 'assistant'].includes(m.role) &&
          typeof m.content === 'string'
      )
      .map((m) => ({ role: m.role, content: m.content.slice(0, 5000) }));

    if (sanitized.length === 0) {
      return Response.json(
        { error: 'INVALID_REQUEST', message: 'No valid messages' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey || apiKey === 'your-api-key-here') {
      return Response.json(
        {
          error: 'API_KEY_NOT_CONFIGURED',
          message:
            'ANTHROPIC_API_KEY が設定されていません。.env.local にAPIキーを設定してください。',
        },
        { status: 503 }
      );
    }

    const client = new Anthropic({ apiKey });

    // Use streaming for faster perceived response
    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: systemPrompt,
      messages: sanitized,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta?.type === 'text_delta'
            ) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: err.message })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Anthropic API error:', error?.message || error);

    if (error?.status === 401) {
      return Response.json(
        {
          error: 'AUTH_ERROR',
          message: 'APIキーが無効です。.env.local を確認してください。',
        },
        { status: 401 }
      );
    }

    if (error?.status === 429) {
      return Response.json(
        {
          error: 'RATE_LIMIT',
          message: 'リクエストが多すぎます。少し時間を置いてください。',
        },
        { status: 429 }
      );
    }

    if (error?.status === 529 || error?.status === 503) {
      return Response.json(
        {
          error: 'OVERLOADED',
          message:
            'AIサーバーが混雑しています。しばらくしてからお試しください。',
        },
        { status: 503 }
      );
    }

    return Response.json(
      { error: 'UNKNOWN', message: '予期しないエラーが発生しました。' },
      { status: 500 }
    );
  }
}
