'use client';

import { useMemo } from 'react';
import katex from 'katex';

export default function Tex({ children, display = false, className = '' }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(String(children ?? ''), {
        displayMode: display,
        throwOnError: false,
        strict: 'ignore',
        trust: false,
        output: 'html',
      });
    } catch {
      return `<span class="text-plasma">${String(children ?? '')}</span>`;
    }
  }, [children, display]);

  const Tag = display ? 'div' : 'span';
  return (
    <Tag
      className={`${display ? 'overflow-x-auto py-1' : ''} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
