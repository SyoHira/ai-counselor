'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'andon_studio';
const DEFAULT_TIMES = ['07:30', '12:15', '21:00'];
const GENRES = [
  { id: '0', label: '総合' },
  { id: '100938', label: 'ダイエット・健康' },
  { id: '100939', label: '美容・コスメ' },
  { id: '100804', label: 'インテリア・寝具・収納' },
  { id: '211742', label: 'TV・オーディオ・カメラ' },
];
const TABS = [
  { id: 'products', label: '① 商品' },
  { id: 'pains', label: '② 悩み' },
  { id: 'posts', label: '③ 投稿' },
  { id: 'schedule', label: '④ 予約' },
  { id: 'review', label: '⑤ 週次' },
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ローカル日付（toISOString は UTC なので JST だと日付がずれる）
function formatDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatDate(d);
}

const initialState = {
  password: '',
  priceTarget: 5000,
  genreId: '100938',
  rankingText: '',
  products: [],
  startDate: tomorrow(),
  times: DEFAULT_TIMES,
  report: '',
  review: null,
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return saved ? { ...initialState, ...saved } : initialState;
  } catch {
    return initialState;
  }
}

function toProduct(p) {
  return { ...p, id: generateId(), experienced: false, inRoom: false, pains: [], posts: [] };
}

// 承認済み投稿を商品ごとに交互に並べ、1日 times.length 本ずつ枠に入れる
function buildSchedule(products, startDate, times) {
  const queues = products.map((p) =>
    p.posts.filter((post) => post.status === 'approved').map((post) => ({ ...post, product: p.name }))
  );
  const ordered = [];
  for (let i = 0; queues.some((q) => q.length > i); i++) {
    queues.forEach((q) => q[i] && ordered.push(q[i]));
  }
  const start = new Date(`${startDate}T00:00:00`);
  return ordered.map((post, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + Math.floor(i / times.length));
    return { ...post, date: formatDate(d), time: times[i % times.length] };
  });
}

function toCsv(rows) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  return ['date,time,product,text', ...rows.map((r) => [r.date, r.time, r.product, r.text].map(esc).join(','))].join('\n');
}

function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-2xl border border-stone/60 p-4 ${className}`}>{children}</div>;
}

function Button({ children, onClick, disabled, variant = 'primary', className = '' }) {
  const styles =
    variant === 'primary'
      ? 'bg-charcoal text-cream'
      : 'bg-warm text-charcoal border border-stone/60';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-xl text-sm font-medium transition-opacity disabled:opacity-30 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

const inputClass =
  'w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone/60 focus:outline-none focus:border-charcoal/30 placeholder:text-charcoal/30';

export default function StudioPage() {
  const [state, setState] = useState(initialState);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('products');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState(null);

  useEffect(() => {
    setState(loadState());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }, [state, loaded]);

  const update = (patch) => setState((s) => ({ ...s, ...patch }));
  const updateProduct = (id, fn) =>
    setState((s) => ({ ...s, products: s.products.map((p) => (p.id === id ? fn(p) : p)) }));

  const active = state.products.find((p) => p.id === activeId) || state.products[0];

  const callStudio = useCallback(
    async (task, input, label) => {
      setBusy(label);
      setError('');
      try {
        const res = await fetch('/api/studio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-studio-password': state.password },
          body: JSON.stringify({ task, input: { ...input, priceTarget: state.priceTarget } }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'エラーが発生しました');
        return data.result;
      } catch (e) {
        setError(e.message);
        return null;
      } finally {
        setBusy('');
      }
    },
    [state.password, state.priceTarget]
  );

  const fetchRanking = async () => {
    setBusy('ランキング取得中');
    setError('');
    try {
      const res = await fetch(`/api/studio/ranking?genreId=${state.genreId}`, {
        headers: { 'x-studio-password': state.password },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      update({ rankingText: data.text });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  // STEP2
  const selectProducts = async () => {
    const result = await callStudio('select', { rankingText: state.rankingText, count: 10 }, '10商品を選定中');
    if (result) {
      update({ products: result.products.map(toProduct) });
      setActiveId(null);
    }
  };

  // STEP3
  const generatePains = async (product) => {
    const result = await callStudio('pains', { product, count: 30 }, `「${product.name.slice(0, 16)}」の悩みを30個生成中`);
    if (result) {
      updateProduct(product.id, (p) => ({
        ...p,
        pains: result.pains.map((pain) => ({ ...pain, id: generateId(), selected: true })),
      }));
    }
  };

  // STEP4
  const generatePosts = async (product) => {
    const pains = product.pains.filter((p) => p.selected);
    const result = await callStudio('posts', { product, pains }, `「${product.name.slice(0, 16)}」の投稿を${pains.length}本生成中`);
    if (result) {
      updateProduct(product.id, (p) => ({
        ...p,
        posts: result.posts.map((post) => ({ ...post, id: generateId(), status: 'draft' })),
      }));
    }
  };

  // STEP5
  const runReview = async () => {
    const products = state.products.map((p) => ({ ...p, postCount: p.posts.length }));
    const result = await callStudio(
      'review',
      { report: state.report, products, rankingText: state.rankingText },
      '週次レビュー中'
    );
    if (result) update({ review: result });
  };

  const applyReview = () => {
    const { drop, replacements } = state.review;
    setState((s) => ({
      ...s,
      products: [...s.products.filter((p) => !drop.includes(p.name)), ...replacements.map(toProduct)],
      review: null,
    }));
    setTab('pains');
  };

  const schedule = useMemo(
    () => buildSchedule(state.products, state.startDate, state.times),
    [state.products, state.startDate, state.times]
  );

  const downloadCsv = () => {
    const blob = new Blob(['﻿' + toCsv(schedule)], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `threads_schedule_${state.startDate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copy = (text) => navigator.clipboard?.writeText(text);

  const totals = {
    products: state.products.length,
    pains: state.products.reduce((n, p) => n + p.pains.length, 0),
    approved: state.products.reduce((n, p) => n + p.posts.filter((x) => x.status === 'approved').length, 0),
  };

  if (!loaded) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 pb-16">
      <header className="pt-10 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Link href="/" className="w-9 h-9 rounded-lg bg-charcoal flex items-center justify-center">
            <span className="text-cream text-sm font-serif font-semibold">A</span>
          </Link>
          <div>
            <h1 className="text-base font-semibold text-charcoal tracking-tight">Andon Studio</h1>
            <p className="text-[11px] text-charcoal/40">楽天アフィリ × Threads 運用</p>
          </div>
        </div>
        <input
          type="password"
          value={state.password}
          onChange={(e) => update({ password: e.target.value })}
          placeholder="Studioパスワード"
          className={`${inputClass} max-w-[150px]`}
        />
      </header>

      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        {[
          ['商品', totals.products],
          ['悩み', totals.pains],
          ['承認済み投稿', totals.approved],
        ].map(([label, n]) => (
          <Card key={label} className="!p-3">
            <div className="text-lg font-semibold">{n}</div>
            <div className="text-[11px] text-charcoal/40">{label}</div>
          </Card>
        ))}
      </div>

      <nav className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
              tab === t.id ? 'bg-charcoal text-cream' : 'bg-warm text-charcoal/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {busy && <p className="text-xs text-charcoal/60 mb-3 animate-pulse">⏳ {busy}…</p>}
      {error && <p className="text-xs text-red-700 bg-red-50 rounded-xl px-3 py-2 mb-3">{error}</p>}

      {tab === 'products' && (
        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-semibold mb-2">楽天ランキング</h2>
            <div className="flex gap-2 mb-2">
              <select
                value={state.genreId}
                onChange={(e) => update({ genreId: e.target.value })}
                className={inputClass}
              >
                {GENRES.map((g) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </select>
              <Button variant="secondary" onClick={fetchRanking} disabled={!!busy} className="whitespace-nowrap">
                APIで取得
              </Button>
            </div>
            <textarea
              rows={8}
              value={state.rankingText}
              onChange={(e) => update({ rankingText: e.target.value })}
              placeholder="楽天ランキングのページをコピーして貼り付け（API未設定でもOK）"
              className={inputClass}
            />
            <div className="flex items-center gap-2 mt-2">
              <label className="text-xs text-charcoal/60">目安価格</label>
              <input
                type="number"
                value={state.priceTarget}
                onChange={(e) => update({ priceTarget: Number(e.target.value) })}
                className={`${inputClass} max-w-[110px]`}
              />
              <span className="text-xs text-charcoal/60">円</span>
              <Button onClick={selectProducts} disabled={!!busy || !state.rankingText.trim()} className="ml-auto">
                10商品を選ぶ
              </Button>
            </div>
          </Card>

          {state.products.map((p) => (
            <Card key={p.id}>
              <div className="flex justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-charcoal/50">
                    {p.category} / {p.price ? `${p.price.toLocaleString()}円` : '価格不明'}
                  </p>
                  <p className="text-sm mt-1">「{p.painOneLiner}」</p>
                  <p className="text-xs text-charcoal/40 mt-1">{p.reason}</p>
                </div>
                <button
                  onClick={() => update({ products: state.products.filter((x) => x.id !== p.id) })}
                  className="text-charcoal/30 text-sm self-start"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap gap-3 mt-3 text-xs text-charcoal/70">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={p.inRoom}
                    onChange={(e) => updateProduct(p.id, (x) => ({ ...x, inRoom: e.target.checked }))}
                  />
                  楽天ROOMに追加済み
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={p.experienced}
                    onChange={(e) => updateProduct(p.id, (x) => ({ ...x, experienced: e.target.checked }))}
                  />
                  自分で使ったことがある（体験談を許可）
                </label>
                {p.url && (
                  <a href={p.url} target="_blank" rel="noreferrer" className="underline">
                    商品ページ
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {(tab === 'pains' || tab === 'posts') && state.products.length > 0 && (
        <select
          value={active?.id}
          onChange={(e) => setActiveId(e.target.value)}
          className={`${inputClass} mb-3`}
        >
          {state.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name.slice(0, 40)}（悩み{p.pains.length} / 投稿{p.posts.length}）
            </option>
          ))}
        </select>
      )}

      {(tab === 'pains' || tab === 'posts') && state.products.length === 0 && (
        <p className="text-sm text-charcoal/50">先に①で商品を選んでください。</p>
      )}

      {tab === 'pains' && active && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button onClick={() => generatePains(active)} disabled={!!busy}>
              悩みを30個出す
            </Button>
            <Button
              variant="secondary"
              disabled={!!busy}
              onClick={async () => {
                for (const p of state.products.filter((x) => x.pains.length === 0)) {
                  await generatePains(p);
                }
              }}
            >
              未生成の商品をまとめて
            </Button>
          </div>
          {active.pains.map((pain) => (
            <label key={pain.id} className="flex gap-2 items-start bg-white rounded-xl border border-stone/60 px-3 py-2">
              <input
                type="checkbox"
                checked={pain.selected}
                className="mt-1"
                onChange={(e) =>
                  updateProduct(active.id, (p) => ({
                    ...p,
                    pains: p.pains.map((x) => (x.id === pain.id ? { ...x, selected: e.target.checked } : x)),
                  }))
                }
              />
              <span className="text-sm">
                {pain.text}
                <span className="block text-[11px] text-charcoal/40">
                  {pain.scene} ・ 切実さ {'●'.repeat(pain.intensity)}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}

      {tab === 'posts' && active && (
        <div className="space-y-3">
          <div className="flex gap-2 items-center">
            <Button
              onClick={() => generatePosts(active)}
              disabled={!!busy || !active.pains.some((p) => p.selected)}
            >
              選んだ悩みで投稿を作る
            </Button>
            <Button
              variant="secondary"
              disabled={!active.posts.length}
              onClick={() =>
                updateProduct(active.id, (p) => ({
                  ...p,
                  posts: p.posts.map((x) => ({ ...x, status: 'approved' })),
                }))
              }
            >
              全部承認
            </Button>
          </div>
          <p className="text-[11px] text-charcoal/40">
            読んで直してから承認。承認した投稿だけが④の予約表に入ります。
          </p>
          {active.posts.map((post) => (
            <Card key={post.id} className={post.status === 'approved' ? '!border-charcoal/40' : ''}>
              <textarea
                rows={7}
                value={post.text}
                onChange={(e) =>
                  updateProduct(active.id, (p) => ({
                    ...p,
                    posts: p.posts.map((x) => (x.id === post.id ? { ...x, text: e.target.value } : x)),
                  }))
                }
                className={`${inputClass} !border-0 !px-0`}
              />
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-[11px] ${post.text.length > 500 ? 'text-red-700' : 'text-charcoal/40'}`}>
                  {post.text.length}/500
                </span>
                {!post.text.includes('#PR') && <span className="text-[11px] text-red-700">#PR がありません</span>}
                <Button variant="secondary" className="ml-auto !py-1" onClick={() => copy(post.text)}>
                  コピー
                </Button>
                <Button
                  className="!py-1"
                  disabled={post.text.length > 500 || !post.text.includes('#PR')}
                  onClick={() =>
                    updateProduct(active.id, (p) => ({
                      ...p,
                      posts: p.posts.map((x) =>
                        x.id === post.id ? { ...x, status: x.status === 'approved' ? 'draft' : 'approved' } : x
                      ),
                    }))
                  }
                >
                  {post.status === 'approved' ? '承認済み ✓' : '承認'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === 'schedule' && (
        <div className="space-y-3">
          <Card>
            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-xs text-charcoal/60">開始日</label>
              <input
                type="date"
                value={state.startDate}
                onChange={(e) => update({ startDate: e.target.value })}
                className={`${inputClass} max-w-[160px]`}
              />
              <label className="text-xs text-charcoal/60 ml-2">投稿時刻</label>
              <input
                value={state.times.join(',')}
                onChange={(e) => update({ times: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
                className={`${inputClass} max-w-[170px]`}
              />
            </div>
            <p className="text-[11px] text-charcoal/40 mt-2">
              承認済み {schedule.length} 本 → 1日{state.times.length}本で
              {schedule.length ? ` ${schedule[schedule.length - 1].date} まで` : ''}。同じ商品が続かないよう交互に並べています。
            </p>
            <div className="flex gap-2 mt-3">
              <Button onClick={downloadCsv} disabled={!schedule.length}>CSVをダウンロード</Button>
            </div>
          </Card>
          {state.products.some((p) => !p.inRoom) && (
            <p className="text-xs text-red-700">
              楽天ROOM未追加の商品があります: {state.products.filter((p) => !p.inRoom).map((p) => p.name.slice(0, 20)).join(' / ')}
            </p>
          )}
          {schedule.map((row) => (
            <Card key={row.id} className="!p-3">
              <div className="flex justify-between text-[11px] text-charcoal/50 mb-1">
                <span>{row.date} {row.time}</span>
                <span className="truncate ml-3">{row.product}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{row.text}</p>
              <Button variant="secondary" className="!py-1 mt-2" onClick={() => copy(row.text)}>コピー</Button>
            </Card>
          ))}
        </div>
      )}

      {tab === 'review' && (
        <div className="space-y-3">
          <Card>
            <h2 className="text-sm font-semibold mb-1">先週の数字</h2>
            <p className="text-[11px] text-charcoal/40 mb-2">
              楽天アフィリエイトの成果レポート（クリック数・売上件数）や ROOM の数字をそのまま貼り付け。
              入れ替え候補は①のランキング欄を最新にしてから実行。
            </p>
            <textarea
              rows={8}
              value={state.report}
              onChange={(e) => update({ report: e.target.value })}
              className={inputClass}
            />
            <Button className="mt-2" onClick={runReview} disabled={!!busy || !state.report.trim()}>
              売れた商品の共通点を出して入れ替える
            </Button>
          </Card>

          {state.review && (
            <Card>
              <h3 className="text-sm font-semibold">売れた商品</h3>
              <p className="text-sm mb-2">{state.review.winners.join(' / ') || 'なし'}</p>
              <h3 className="text-sm font-semibold">共通点</h3>
              <ul className="text-sm list-disc pl-5 mb-2">
                {state.review.commonTraits.map((t) => <li key={t}>{t}</li>)}
              </ul>
              <h3 className="text-sm font-semibold">外す</h3>
              <p className="text-sm mb-2">{state.review.drop.join(' / ') || 'なし'}</p>
              <h3 className="text-sm font-semibold">追加</h3>
              <ul className="text-sm list-disc pl-5 mb-2">
                {state.review.replacements.map((p) => (
                  <li key={p.name}>{p.name}（「{p.painOneLiner}」）</li>
                ))}
              </ul>
              <p className="text-xs text-charcoal/60 mb-3">{state.review.nextWeekNotes}</p>
              <Button onClick={applyReview}>この入れ替えを反映</Button>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
