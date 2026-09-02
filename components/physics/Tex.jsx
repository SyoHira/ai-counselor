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
      return null;
    }
  }, [children, display]);

  const Tag = display ? 'div' : 'span';
  if (html === null) return <Tag className={`text-plasma ${className}`}>{String(children ?? '')}</Tag>;
  return (
    <Tag
      className={`${display ? 'overflow-x-auto py-1' : ''} ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
