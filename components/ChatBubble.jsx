'use client';

export default function ChatBubble({ role, content }) {
  const isUser = role === 'user';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 chat-bubble-enter`}
    >
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-charcoal flex items-center justify-center shrink-0 mr-2 mt-1">
          <span className="text-cream text-xs font-serif font-semibold">A</span>
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-charcoal text-cream rounded-br-md'
            : 'bg-white border border-stone/40 text-charcoal rounded-bl-md shadow-sm'
        }`}
      >
        <p
          className={`text-sm leading-relaxed whitespace-pre-wrap ${
            !isUser ? 'ai-message' : ''
          }`}
        >
          {content}
        </p>
      </div>
    </div>
  );
}
