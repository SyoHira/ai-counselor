'use client';

import { useState, useRef, useEffect } from 'react';

export default function ChatInput({ onSend, disabled }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 100) + 'px';
    }
  }, [text]);

  const handleSubmit = () => {
    if (!text.trim() || disabled) return;
    onSend(text.trim());
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="fixed bottom-[52px] left-0 right-0 nav-blur bg-cream/80 border-t border-stone/40 z-40">
      <div className="max-w-lg mx-auto flex items-end gap-2 px-4 py-2.5">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="メッセージを入力..."
          rows={1}
          className="flex-1 bg-white rounded-2xl px-4 py-2.5 text-sm border border-stone/60 focus:outline-none focus:border-charcoal/30 placeholder:text-charcoal/30 transition-colors max-h-[100px]"
          disabled={disabled}
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || disabled}
          className={`w-9 h-9 rounded-full bg-charcoal flex items-center justify-center shrink-0 transition-opacity ${
            text.trim() && !disabled ? 'opacity-100' : 'opacity-20'
          }`}
        >
          <span className="text-cream text-sm">→</span>
        </button>
      </div>
    </div>
  );
}
