'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RecentSessions() {
  const [sessions, setSessions] = useState([]);
  const router = useRouter();

  useEffect(() => {
    try {
      const stored = localStorage.getItem('andon_sessions');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSessions(parsed.slice(0, 5));
      }
    } catch {}
  }, []);

  if (sessions.length === 0) return null;

  const openSession = (session) => {
    sessionStorage.setItem('loadSessionId', session.id);
    router.push('/chat');
  };

  const deleteSession = (e, sessionId) => {
    e.stopPropagation();
    try {
      const stored = JSON.parse(localStorage.getItem('andon_sessions') || '[]');
      const filtered = stored.filter((s) => s.id !== sessionId);
      localStorage.setItem('andon_sessions', JSON.stringify(filtered));
      setSessions(filtered.slice(0, 5));
    } catch {}
  };

  return (
    <div className="px-5 mb-6">
      <h2 className="text-sm font-medium text-charcoal/50 mb-3">
        Recent Sessions
      </h2>
      <div className="space-y-2">
        {sessions.map((session) => (
          <button
            key={session.id}
            onClick={() => openSession(session)}
            className="w-full bg-white rounded-xl p-3.5 border border-stone/40 text-left card-hover group relative"
          >
            <p className="text-sm text-charcoal truncate pr-6">{session.title}</p>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] text-charcoal/40">{session.date}</span>
              <span className="text-[11px] text-charcoal/30">·</span>
              <span className="text-[11px] text-charcoal/40">
                {session.messageCount} messages
              </span>
            </div>
            <span
              onClick={(e) => deleteSession(e, session.id)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/0 group-hover:text-charcoal/30 hover:!text-charcoal/60 transition-colors text-xs cursor-pointer"
              aria-label="セッション削除"
            >
              ✕
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
