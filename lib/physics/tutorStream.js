/** Read fragmented SSE frames; a clean transport close is not proof of completion. */
export async function readTutorStream(body, onEvent) {
  if (!body) throw new Error('AIの応答がありません。');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', complete = false;
  const line = value => {
    if (!value.startsWith('data:')) return;
    const payload = value.slice(5).trim();
    if (!payload || payload === '[DONE]') return;
    const event = JSON.parse(payload);
    if (event.error) throw new Error(event.error);
    if (event.done === true) complete = true;
    onEvent(event);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const value of lines) line(value);
      if (done) break;
    }
    if (buffer.trim()) line(buffer);
    if (!complete) throw new Error('応答が途中で途切れました。もう一度お試しください。');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
