'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import ChatBubble from '@/components/ChatBubble';
import ChatInput from '@/components/ChatInput';
import TypingIndicator from '@/components/TypingIndicator';

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function saveSession(id, messages) {
  if (messages.length === 0) return;
  try {
    const stored = JSON.parse(localStorage.getItem('andon_sessions') || '[]');
    const firstUserMsg = messages.find((m) => m.role === 'user');
    const title = firstUserMsg ? firstUserMsg.content.slice(0, 30) : 'New session';
    const existing = stored.findIndex((s) => s.id === id);
    const entry = {
      id,
      title,
      date: new Date().toLocaleDateString('ja-JP'),
      messageCount: messages.length,
      messages,
    };
    if (existing >= 0) {
      stored[existing] = entry;
    } else {
      stored.unshift(entry);
    }
    localStorage.setItem('andon_sessions', JSON.stringify(stored.slice(0, 20)));
  } catch {}
}

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState(() => generateId());
  const scrollRef = useRef(null);
  const initialized = useRef(false);
  const router = useRouter();

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }
    });
  }, []);

  const sendMessage = useCallback(
    async (text, currentMessages = []) => {
      const userMsg = { role: 'user', content: text };
      const newMessages = [...currentMessages, userMsg];
      setMessages(newMessages);
      setIsLoading(true);
      scrollToBottom();

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: newMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });

        // Non-streaming error responses (JSON)
        if (!res.ok) {
          const data = await res.json();
          const errorMessages = {
            API_KEY_NOT_CONFIGURED:
              '⚠ AIが接続されていません。管理者にお問い合わせください。',
            AUTH_ERROR:
              '⚠ AI接続の認証に失敗しました。設定を確認してください。',
            RATE_LIMIT:
              'リクエストが多すぎます。少し時間を置いてからお試しください。',
            OVERLOADED:
              'AIサーバーが混雑しています。しばらくしてからお試しください。',
          };
          const fallback =
            '申し訳ありません。接続に問題が発生しました。もう一度お試しください。';
          throw new Error(errorMessages[data?.error] || fallback);
        }

        // Streaming response (SSE)
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let aiContent = '';
        const aiMsg = { role: 'assistant', content: '' };
        const withAi = [...newMessages, aiMsg];
        setMessages(withAi);
        setIsLoading(false);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const payload = line.slice(6);
            if (payload === '[DONE]') break;
            try {
              const parsed = JSON.parse(payload);
              if (parsed.text) {
                aiContent += parsed.text;
                const updated = [
                  ...newMessages,
                  { role: 'assistant', content: aiContent },
                ];
                setMessages(updated);
                scrollToBottom();
              }
              if (parsed.error) {
                throw new Error(parsed.error);
              }
            } catch (parseErr) {
              if (parseErr.message !== 'Unexpected end of JSON input') {
                // Re-throw real errors, ignore partial JSON
                if (parseErr.message && !parseErr.message.includes('JSON')) {
                  throw parseErr;
                }
              }
            }
          }
        }

        const finalMessages = [
          ...newMessages,
          { role: 'assistant', content: aiContent || 'すみません、うまく返答できませんでした。' },
        ];
        setMessages(finalMessages);
        saveSession(sessionId, finalMessages);
        return;
      } catch (err) {
        const errorMsg = {
          role: 'assistant',
          content:
            err.message ||
            '申し訳ありません。接続に問題が発生しました。もう一度お試しください。',
        };
        const updated = [...newMessages, errorMsg];
        setMessages(updated);
        saveSession(sessionId, updated);
      } finally {
        setIsLoading(false);
        scrollToBottom();
      }
    },
    [sessionId, scrollToBottom]
  );

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Load existing session — reuse the original session ID
    const loadId = sessionStorage.getItem('loadSessionId');
    if (loadId) {
      sessionStorage.removeItem('loadSessionId');
      try {
        const stored = JSON.parse(
          localStorage.getItem('andon_sessions') || '[]'
        );
        const session = stored.find((s) => s.id === loadId);
        if (session?.messages) {
          setSessionId(loadId);
          setMessages(session.messages);
          setTimeout(scrollToBottom, 100);
          return;
        }
      } catch {}
    }

    // Handle pending message from home
    const pending = sessionStorage.getItem('pendingMessage');
    if (pending) {
      sessionStorage.removeItem('pendingMessage');
      sendMessage(pending, []);
    }
  }, [sendMessage, scrollToBottom]);

  const handleSend = (text) => {
    sendMessage(text, messages);
  };

  const handleNewChat = () => {
    setMessages([]);
    setSessionId(generateId());
  };

  const isEmpty = messages.length === 0 && !isLoading;

  return (
    <div className="max-w-lg mx-auto flex flex-col h-[100dvh]">
      {/* Header */}
      <header className="px-4 pt-safe-top pb-3 border-b border-stone/40 bg-cream sticky top-0 z-30">
        <div className="flex items-center justify-between pt-10">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => router.push('/')}
              className="text-charcoal/40 hover:text-charcoal transition-colors mr-1"
              aria-label="ホームに戻る"
            >
              ←
            </button>
            <div className="w-8 h-8 rounded-lg bg-charcoal flex items-center justify-center">
              <span className="text-cream text-xs font-serif font-semibold">
                A
              </span>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-charcoal">Andon</h1>
              <p className="text-[10px] text-charcoal/40">
                AI Wellness Companion
              </p>
            </div>
          </div>
          {messages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="text-[11px] text-charcoal/40 hover:text-charcoal transition-colors px-2 py-1 rounded-lg hover:bg-stone/30"
            >
              New Chat
            </button>
          )}
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 pb-[130px]"
      >
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <span className="text-5xl mb-4 opacity-30">☁</span>
            <p className="text-sm font-medium text-charcoal/50 mb-1">
              Safe space to explore your mind.
            </p>
            <p className="text-xs text-charcoal/35">
              あなたの感覚に寄り添って、一緒に整理します。
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <ChatBubble key={`${sessionId}-${i}`} role={msg.role} content={msg.content} />
        ))}

        {isLoading && <TypingIndicator />}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isLoading} />

      <BottomNav />
    </div>
  );
}
