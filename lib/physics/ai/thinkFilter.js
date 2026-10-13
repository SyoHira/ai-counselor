// Qwen / DeepSeek 系は思考過程を <think>…</think> として本文に混ぜることがある。
// ストリームの途中でタグが分割されても、思考部分だけを取り除く。
const OPEN = '<think>';
const CLOSE = '</think>';

function partialSuffix(text, tag) {
  for (let n = Math.min(tag.length - 1, text.length); n > 0; n--) {
    if (tag.startsWith(text.slice(-n))) return n;
  }
  return 0;
}

export function createThinkFilter() {
  let pending = '';
  let inThink = false;
  let sawThink = false;
  return {
    get thinking() { return sawThink; },
    push(chunk) {
      pending += chunk;
      let out = '';
      while (pending) {
        if (inThink) {
          const end = pending.indexOf(CLOSE);
          if (end === -1) { pending = pending.slice(pending.length - partialSuffix(pending, CLOSE)); break; }
          pending = pending.slice(end + CLOSE.length);
          inThink = false;
        } else {
          const start = pending.indexOf(OPEN);
          if (start === -1) {
            const keep = partialSuffix(pending, OPEN);
            out += pending.slice(0, pending.length - keep);
            pending = pending.slice(pending.length - keep);
            break;
          }
          out += pending.slice(0, start);
          pending = pending.slice(start + OPEN.length);
          inThink = true;
          sawThink = true;
        }
      }
      return out;
    },
    flush() {
      const rest = inThink ? '' : pending;
      pending = '';
      return rest;
    },
  };
}

export function stripThink(text) {
  const f = createThinkFilter();
  return (f.push(text) + f.flush()).trim();
}
