import Anthropic from '@anthropic-ai/sdk';

const client = p => new Anthropic({ apiKey: p.key, maxRetries: 0, timeout: 240000 });
const finishOf = reason => reason === 'end_turn' ? 'stop' : reason || 'unknown';
const usageOf = u => u ? { inputTokens: u.input_tokens ?? null, outputTokens: u.output_tokens ?? null, costUsd: null } : null;

export async function* streamAnthropic(p, { system, messages, maxTokens, signal }) {
  const stream = client(p).messages.stream({
    model: p.model, max_tokens: maxTokens, thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages,
  }, { signal });
  let announced = false;
  for await (const event of stream) {
    if (event.type !== 'content_block_delta') continue;
    if (event.delta?.type === 'text_delta' && event.delta.text) yield { text: event.delta.text };
    else if (event.delta?.type === 'thinking_delta' && !announced) { announced = true; yield { thinking: true }; }
  }
  const message = await stream.finalMessage();
  yield { done: true, finish: finishOf(message.stop_reason), usage: usageOf(message.usage) };
}

export async function completeAnthropic(p, { system, messages, maxTokens, signal }) {
  const message = await client(p).messages.create({
    model: p.model, max_tokens: maxTokens, thinking: { type: 'adaptive' }, system, messages,
  }, { signal });
  return {
    text: message.content.filter(b => b.type === 'text').map(b => b.text).join('\n'),
    finish: finishOf(message.stop_reason),
    usage: usageOf(message.usage),
  };
}
