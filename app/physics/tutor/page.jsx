'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LEVELS, getModule } from '@/lib/physics/curriculum';
import { MODES } from '@/lib/physics/tutorPrompt';
import { logSession } from '@/lib/physics/progress';
import { Card, Badge, levelTone } from '@/components/physics/ui';
import RichText from '@/components/physics/RichText';
import { readTutorStream } from '@/lib/physics/tutorStream';

const STORE_KEY = 'physics.tutor.v1';

const GENERIC_STARTERS = [
  '量子力学を学ぶ順番を、いまの自分に合わせて設計してほしい',
  '重ね合わせとエンタングルメントの違いを、誤解しやすい点まで含めて説明して',
  '量子コンピュータが「速い」とはどういう意味か、限界も含めて教えて',
  '波動関数の収縮は物理的な過程なのか、それとも知識の更新なのか',
];

function loadThreads() {
  if (typeof window === 'undefined') return {};
  try {
    const data = JSON.parse(window.localStorage.getItem(STORE_KEY) || '{}');
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    return Object.fromEntries(Object.entries(data).filter(([, messages]) => Array.isArray(messages))
      .map(([key, messages]) => [key, messages.filter(m => m && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string').slice(-24)]));
  } catch {
    return {};
  }
}

function saveThread(key, messages) {
  if (typeof window === 'undefined') return;
  try {
    const all = loadThreads();
    all[key] = messages.slice(-24);
    window.localStorage.setItem(STORE_KEY, JSON.stringify(all));
  } catch {
    /* 保存できなくても会話は続けられる */
  }
}

function TutorInner() {
  const params = useSearchParams();
  const moduleId = params.get('module') || '';
  const mod = moduleId ? getModule(moduleId) : null;

  const [level, setLevel] = useState(mod?.level || 'ug');
  const [mode, setMode] = useState('intuition');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef(null);
  const abortRef = useRef(null);
  const threadKey = moduleId || 'general';

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false); setThinking(false); setError('');
    setMessages(loadThreads()[threadKey] || []);
    if (mod) setLevel(mod.level);
    return () => { abortRef.current?.abort(); abortRef.current = null; };
  }, [threadKey, mod]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streaming]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || abortRef.current) return;
    setInput('');
    setError('');
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setStreaming(true);
    setThinking(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/physics-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.filter(m => m.content.trim()).slice(-24).map(m => ({ ...m, content: m.content.slice(0, 8000) })), level, mode, moduleId }),
        signal: controller.signal,
      });
      if (abortRef.current !== controller) return;

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `エラー (${res.status})`);
      }

      let acc = '';
      setMessages([...next, { role: 'assistant', content: '' }]);

      await readTutorStream(res.body, obj => {
          if (abortRef.current !== controller) return;
          if (obj.phase === 'thinking') { setThinking(true); return; }
          if (obj.text) {
            setThinking(false);
            acc += obj.text;
            setMessages([...next, { role: 'assistant', content: acc }]);
          }
      });
      if (abortRef.current !== controller) return;

      const finalMessages = [...next, { role: 'assistant', content: acc }];
      setMessages(finalMessages);
      saveThread(threadKey, finalMessages);
      logSession({ type: 'tutor', moduleId: moduleId || null, level, mode });
    } catch (e) {
      if (abortRef.current === controller && e.name !== 'AbortError') {
        setError(e.message || '通信に失敗しました。');
        setMessages(next);
      }
    } finally {
      if (abortRef.current === controller) {
        setStreaming(false); setThinking(false); abortRef.current = null;
      }
    }
  };

  const clear = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false); setThinking(false);
    setMessages([]);
    saveThread(threadKey, []);
    setError('');
  };

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false); setThinking(false);
    setMessages(current => current.filter(message => message.role !== 'assistant' || message.content));
  };

  const starters = mod
    ? [
        `「${mod.title}」の要点を、いまのレベルに合わせて説明して`,
        ...(mod.goals || []).slice(0, 2).map((g) => `${g}——これができるように教えて`),
        `${mod.title} でよくある誤解を教えて`,
      ]
    : GENERIC_STARTERS;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[19px] font-semibold tracking-tight">物理チューター</h1>
          <p className="text-[12px] text-qmute mt-1">
            レベルとモードを切り替えると、説明の深さと進め方が変わります。
          </p>
        </div>
        {messages.length > 0 && (
          <button onClick={clear} className="text-[11.5px] text-qmute hover:text-plasma shrink-0 mt-1">
            会話を消す
          </button>
        )}
      </div>

      {mod && (
        <Link href={`/physics/module/${mod.id}`}>
          <Card className="p-3 flex items-center gap-2.5 hover:border-quantum/50 transition-colors">
            <Badge tone={levelTone(mod.level)}>{mod.level === 'hs' ? '高校' : mod.level === 'ug' ? '学部' : mod.level === 'grad' ? '大学院' : '博士'}</Badge>
            <span className="text-[12.5px] flex-1">{mod.title}</span>
            <span className="text-[11px] text-qmute">単元を開く →</span>
          </Card>
        </Link>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {LEVELS.map((l) => (
            <button
              key={l.id}
              onClick={() => setLevel(l.id)}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] font-medium border transition-colors ${
                level === l.id ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
              }`}
            >
              {l.full}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              title={m.hint}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] font-medium border transition-colors ${
                mode === m.id ? 'bg-photon/15 text-photon border-photon/40' : 'bg-panel border-edge text-qmute hover:border-photon/40'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 min-h-[240px]">
        {messages.length === 0 && !streaming && (
          <Card className="p-4">
            <p className="text-[12px] text-qmute mb-3">こんなことから始められます</p>
            <div className="space-y-1.5">
              {starters.map((s, i) => (
                <button
                  key={i}
                  onClick={() => send(s)}
                  className="w-full text-left text-[12.5px] rounded-xl border border-edge/70 hover:border-quantum/50 hover:text-quantum px-3 py-2.5 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </Card>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
            {m.role === 'user' ? (
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-quantum/15 border border-quantum/25 px-3.5 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap">
                {m.content}
              </div>
            ) : (
              <Card className="p-4 text-[12.5px]">
                {m.content ? <RichText text={m.content} /> : <ThinkingDots label="考えています" />}
              </Card>
            )}
          </div>
        ))}

        {streaming && thinking && messages[messages.length - 1]?.content === '' && null}
        {error && (
          <div className="rounded-xl border border-plasma/40 bg-plasma/10 px-3.5 py-2.5 text-[12px] text-plasma">
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-4">
        <Card className="p-2 flex items-end gap-2 bg-panel/95 backdrop-blur-xl">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={8000}
            rows={1}
            placeholder="質問を入力（Shift+Enterで改行）"
            className="flex-1 bg-transparent px-2.5 py-2 text-[12.5px] placeholder:text-qmute/60 focus:outline-none resize-none max-h-40"
            style={{ height: 'auto' }}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
            }}
          />
          {streaming ? (
            <button
              onClick={stop}
              className="shrink-0 w-9 h-9 rounded-xl bg-edge text-qmute flex items-center justify-center hover:text-plasma"
              aria-label="停止"
            >
              ■
            </button>
          ) : (
            <button
              onClick={() => send()}
              disabled={!input.trim()}
              className="shrink-0 w-9 h-9 rounded-xl bg-quantum text-vacuum flex items-center justify-center disabled:opacity-30 transition-opacity"
              aria-label="送信"
            >
              →
            </button>
          )}
        </Card>
      </div>
    </div>
  );
}

function ThinkingDots({ label }) {
  return (
    <span className="inline-flex items-center gap-2 text-qmute text-[12px]">
      <span className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-quantum typing-dot" />
        <span className="w-1.5 h-1.5 rounded-full bg-quantum typing-dot" />
        <span className="w-1.5 h-1.5 rounded-full bg-quantum typing-dot" />
      </span>
      {label}
    </span>
  );
}

export default function TutorPage() {
  return (
    <Suspense fallback={<div className="text-[12px] text-qmute">読み込み中…</div>}>
      <TutorInner />
    </Suspense>
  );
}
