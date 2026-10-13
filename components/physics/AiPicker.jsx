'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORE_KEY = 'physics.ai.provider';

/** 選んだ接続先をブラウザに覚えておく（既定は「自動」＝AI設定の優先順で試す） */
export function useAiProvider() {
  const [provider, setProviderState] = useState('auto');
  const [providers, setProviders] = useState(null);
  useEffect(() => {
    try { setProviderState(window.localStorage.getItem(STORE_KEY) || 'auto'); } catch { /* 既定のまま */ }
    fetch('/api/physics-ai').then(r => r.ok ? r.json() : null).then(d => setProviders(d?.providers || [])).catch(() => setProviders([]));
  }, []);
  const setProvider = value => {
    setProviderState(value);
    try { window.localStorage.setItem(STORE_KEY, value); } catch { /* 保存できなくても選択は効く */ }
  };
  // 未設定の接続先が保存されていたら自動に戻す
  const usable = providers?.filter(p => p.configured && p.enabled) || [];
  const effective = provider === 'auto' || !providers || usable.some(p => p.id === provider) ? provider : 'auto';
  return { provider: effective, setProvider, providers, usable };
}

export default function AiPicker({ provider, setProvider, providers, usable, disabled }) {
  return (
    <div className="flex items-center gap-2 text-[11.5px]">
      <span className="text-qmute shrink-0">AI</span>
      <select
        value={provider}
        disabled={disabled}
        onChange={e => setProvider(e.target.value)}
        data-role="ai-provider"
        className="min-w-0 flex-1 sm:flex-none rounded-lg bg-panel border border-edge px-2 py-1 text-qink focus:outline-none focus:border-quantum/60"
      >
        <option value="auto">自動（優先順に試す）</option>
        {usable.map(p => (
          <option key={p.id} value={p.id} disabled={Boolean(p.blockedReason)}>
            {p.label} · {p.model}{p.blockedReason ? '（上限）' : ''}
          </option>
        ))}
      </select>
      {providers && !usable.length && <span className="text-plasma">接続先が未設定</span>}
      <Link href="/physics/ai" className="text-qmute hover:text-quantum shrink-0">設定・使用量 →</Link>
    </div>
  );
}

/** どのモデルが答えたかの小さな表示 */
export function AnsweredBy({ by }) {
  if (!by) return null;
  return <p className="text-[10.5px] text-qmute/70 mt-2" data-role="answered-by">{by.label} · {by.model}</p>;
}
