'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function UnlockForm() {
  const next = useSearchParams().get('next') || '/physics';
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/unlock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passcode, next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'ロックを解除できませんでした。');
      window.location.replace(data.next || '/physics');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-sm">
      <h1 className="text-lg font-semibold text-slate-800">物理学習</h1>
      <p className="text-sm text-slate-500">パスコードを入力してください。</p>
      <input
        type="password" autoComplete="current-password" autoFocus value={passcode}
        onChange={e => setPasscode(e.target.value)} data-role="passcode"
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
      />
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <button type="submit" disabled={busy || !passcode}
        className="w-full rounded-lg bg-slate-800 py-2 text-white disabled:opacity-50">
        {busy ? '確認中…' : '開く'}
      </button>
    </form>
  );
}

export default function UnlockPage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-4">
      <Suspense><UnlockForm /></Suspense>
    </main>
  );
}
