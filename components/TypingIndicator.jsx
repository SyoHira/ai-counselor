'use client';

export default function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="w-8 h-8 rounded-lg bg-charcoal flex items-center justify-center shrink-0 mr-2 mt-1">
        <span className="text-cream text-xs font-serif font-semibold">A</span>
      </div>
      <div className="bg-white border border-stone/40 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
        <span className="typing-dot w-2 h-2 bg-charcoal/40 rounded-full inline-block" />
        <span className="typing-dot w-2 h-2 bg-charcoal/40 rounded-full inline-block" />
        <span className="typing-dot w-2 h-2 bg-charcoal/40 rounded-full inline-block" />
      </div>
    </div>
  );
}
