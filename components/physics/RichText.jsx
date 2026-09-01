'use client';

import { Fragment, useMemo } from 'react';
import Tex from './Tex';

// $...$ / $$...$$ の数式と、軽量なMarkdown（見出し・箇条書き・強調・コード）を描画する。

function splitInline(text) {
  const out = [];
  const re = /(\$\$[^$]+\$\$|\$[^$\n]+\$|`[^`]+`|\*\*[^*]+\*\*)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    const tok = m[0];
    if (tok.startsWith('$$')) out.push({ t: 'math', v: tok.slice(2, -2), display: true });
    else if (tok.startsWith('$')) out.push({ t: 'math', v: tok.slice(1, -1) });
    else if (tok.startsWith('`')) out.push({ t: 'code', v: tok.slice(1, -1) });
    else out.push({ t: 'bold', v: tok.slice(2, -2) });
    last = m.index + tok.length;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

function Inline({ text }) {
  const parts = useMemo(() => splitInline(text), [text]);
  return (
    <>
      {parts.map((p, i) => {
        if (p.t === 'math') return <Tex key={i} display={p.display}>{p.v}</Tex>;
        if (p.t === 'code') return <code key={i} className="px-1 py-0.5 rounded bg-edge/60 text-photon text-[0.9em] font-mono">{p.v}</code>;
        if (p.t === 'bold') return <strong key={i} className="font-semibold text-qink">{p.v}</strong>;
        return <Fragment key={i}>{p.v}</Fragment>;
      })}
    </>
  );
}

export default function RichText({ text = '', className = '' }) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  return (
    <div className={`space-y-2.5 leading-[1.85] ${className}`}>
      {blocks.map((b, i) => {
        if (b.type === 'code') {
          return (
            <pre key={i} className="overflow-x-auto rounded-lg bg-vacuum/80 border border-edge p-3 text-[12px] font-mono text-photon">
              <code>{b.content}</code>
            </pre>
          );
        }
        if (b.type === 'display-math') {
          return <Tex key={i} display className="my-3 text-center">{b.content}</Tex>;
        }
        if (b.type === 'heading') {
          const size = b.level <= 2 ? 'text-[15px]' : 'text-[14px]';
          return (
            <h3 key={i} className={`${size} font-semibold text-qink mt-4 first:mt-0`}>
              <Inline text={b.content} />
            </h3>
          );
        }
        if (b.type === 'ul') {
          return (
            <ul key={i} className="space-y-1.5 pl-1">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2">
                  <span className="text-quantum select-none mt-[2px]">·</span>
                  <span className="flex-1"><Inline text={it} /></span>
                </li>
              ))}
            </ul>
          );
        }
        if (b.type === 'ol') {
          return (
            <ol key={i} className="space-y-1.5 pl-1">
              {b.items.map((it, j) => (
                <li key={j} className="flex gap-2">
                  <span className="text-quantum select-none tabular-nums text-[13px] mt-[2px]">{j + 1}.</span>
                  <span className="flex-1"><Inline text={it} /></span>
                </li>
              ))}
            </ol>
          );
        }
        return <p key={i}><Inline text={b.content} /></p>;
      })}
    </div>
  );
}

function parseBlocks(text) {
  const lines = String(text).split('\n');
  const blocks = [];
  let i = 0;
  let para = [];

  const flush = () => {
    if (para.length) {
      blocks.push({ type: 'p', content: para.join('\n') });
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      flush();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      blocks.push({ type: 'code', content: buf.join('\n') });
      continue;
    }

    // 独立行の $$ ... $$（複数行にまたがる場合を含む）
    if (/^\s*\$\$\s*$/.test(line)) {
      flush();
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*\$\$\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++;
      blocks.push({ type: 'display-math', content: buf.join('\n') });
      continue;
    }
    const oneLine = line.match(/^\s*\$\$(.+)\$\$\s*$/);
    if (oneLine) {
      flush();
      blocks.push({ type: 'display-math', content: oneLine[1] });
      i++;
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      blocks.push({ type: 'heading', level: h[1].length, content: h[2] });
      i++;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      flush();
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      flush();
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)]\s+/, ''));
      blocks.push({ type: 'ol', items });
      continue;
    }

    if (line.trim() === '') {
      flush();
      i++;
      continue;
    }

    para.push(line);
    i++;
  }
  flush();
  return blocks;
}
