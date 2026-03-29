'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function QuickMessage() {
  const [text, setText] = useState('');
  const router = useRouter();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    sessionStorage.setItem('pendingMessage', text.trim());
    router.push('/chat');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="mx-5 mb-6">
      <h2 className="text-sm font-medium text-charcoal/50 mb-3">
        What&apos;s on your mind?
      </h2>
      <form onSubmit={handleSubmit} className="relative">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="何でも相談してください..."
          className="w-full bg-white rounded-2xl px-4 py-3.5 pr-12 text-sm border border-stone/60 focus:outline-none focus:border-charcoal/30 placeholder:text-charcoal/30 transition-colors"
        />
        <button
          type="submit"
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-charcoal flex items-center justify-center transition-opacity ${
            text.trim() ? 'opacity-100' : 'opacity-20'
          }`}
          disabled={!text.trim()}
        >
          <span className="text-cream text-sm">→</span>
        </button>
      </form>
    </div>
  );
}
