'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const TABS = [
  { id: 'products', label: '商品' },
  { id: 'queue', label: 'キュー' },
  { id: 'recent', label: '実績' },
  { id: 'analysis', label: '分析' },
  { id: 'import', label: '取込・登録' },
];

const STATUS_LABEL = {
  draft: '要確認',
  flagged: '要修正',
  approved: '承認済み',
  scheduled: '予約済み',
  failed: '失敗',
  active: '配信中',
  candidate: '候補',
  retired: '停止',
};

const inputClass =
  'w-full bg-white rounded-xl px-3 py-2 text-sm border border-stone/60 focus:outline-none focus:border-charcoal/30 placeholder:text-charcoal/30';

const pct = (v, digits = 2) => `${(v * 100).toFixed(digits)}%`;
const yen = (v) => `¥${Math.round(v).toLocaleString()}`;
const dt = (v) =>
  v ? new Date(v).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

function Card({ children, className = '' }) {
  return <div className={`bg-white rounded-2xl border border-stone/60 p-4 ${className}`}>{children}</div>;
}

function Button({ children, onClick, disabled, variant = 'primary', className = '' }) {
  const styles = variant === 'primary' ? 'bg-charcoal text-cream' : 'bg-warm text-charcoal border border-stone/60';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-opacity disabled:opacity-30 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

// 90%信用区間を細い線、平均を点で描く。max は列内で共通のスケール
function IntervalBar({ lo, mean, hi, max }) {
  const x = (v) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div
      className="relative h-3 w-28"
      title={`平均 ${pct(mean, 3)}（90%区間 ${pct(lo, 3)} 〜 ${pct(hi, 3)}）`}
    >
      <div className="absolute top-1/2 h-px w-full bg-stone" />
      <div className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-charcoal/40 rounded" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
      <div className="absolute top-1/2 h-2 w-2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-charcoal" style={{ left: x(mean) }} />
    </div>
  );
}

function BarRow({ label, value, max, text, sub }) {
  return (
    <div className="flex items-center gap-2 text-xs" title={sub}>
      <span className="w-20 shrink-0 text-charcoal/70">{label}</span>
      <div className="flex-1 h-2.5 bg-warm rounded">
        <div className="h-full bg-charcoal/70 rounded" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right tabular-nums">{text}</span>
    </div>
  );
}

export default function EnginePage() {
  const [password, setPassword] = useState('');
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('products');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState({});
  const [manual, setManual] = useState({ network: 'amazon', externalId: '', name: '', url: '', price: '', pain: '', experienced: false, activate: true });
  const [conv, setConv] = useState({ network: 'amazon', periodStart: '', periodEnd: '', csv: '' });

  useEffect(() => {
    try {
      setPassword(localStorage.getItem('andon_studio_pw') || '');
    } catch {}
  }, []);

  const api = useCallback(
    async (path, { method = 'GET', body } = {}) => {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-studio-password': password },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || json.error || 'エラー');
      return json;
    },
    [password]
  );

  const load = useCallback(async () => {
    try {
      setData(await api('/api/engine/overview'));
      setMessage('');
    } catch (e) {
      setMessage(e.message);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (label, fn) => {
    setBusy(label);
    setMessage('');
    try {
      const r = await fn();
      if (r?.summary) setMessage(`${label}: ${JSON.stringify(r.summary)}`);
      await load();
    } catch (e) {
      setMessage(`${label}: ${e.message}`);
    } finally {
      setBusy('');
    }
  };

  const runJob = (job) => act(job, () => api('/api/engine/run', { method: 'POST', body: { job } }));
  const postAction = (id, action, text) => act(action, () => api('/api/engine/posts', { method: 'PATCH', body: { id, action, text } }));
  const productAction = (id, body) => act('商品更新', () => api('/api/engine/products', { method: 'PATCH', body: { id, ...body } }));

  const savePassword = (v) => {
    setPassword(v);
    try {
      localStorage.setItem('andon_studio_pw', v);
    } catch {}
  };

  const t = data?.totals;
  const ctr7 = t && t.views7 ? t.clicks7 / t.views7 : 0;
  const scored = data?.products.filter((p) => p.stats) ?? [];
  const ctrMax = Math.max(0.0001, ...scored.map((p) => p.stats.ctr.hi));

  return (
    <div className="max-w-5xl mx-auto px-4 pb-16">
      <header className="pt-10 pb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Link href="/studio" className="w-9 h-9 rounded-lg bg-charcoal flex items-center justify-center">
            <span className="text-cream text-sm font-serif font-semibold">A</span>
          </Link>
          <div>
            <h1 className="text-base font-semibold text-charcoal tracking-tight">Andon Engine</h1>
            <p className="text-[11px] text-charcoal/40">楽天 / Amazon アフィリエイト 自動運転</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <input
            type="password"
            value={password}
            onChange={(e) => savePassword(e.target.value)}
            placeholder="Studioパスワード"
            className={`${inputClass} max-w-[150px]`}
          />
          <Button variant="secondary" onClick={load}>再読込</Button>
        </div>
      </header>

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
            {[
              ['閲覧（7日）', t.views7.toLocaleString()],
              ['クリック（7日）', t.clicks7.toLocaleString()],
              ['CTR（7日）', t.views7 ? pct(ctr7) : '-'],
              ['注文（30日）', t.orders30.toLocaleString()],
              ['報酬（30日）', yen(t.commission30)],
            ].map(([label, v]) => (
              <Card key={label} className="!p-3">
                <div className="text-lg font-semibold tabular-nums">{v}</div>
                <div className="text-[11px] text-charcoal/50">{label}</div>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4 text-[11px] text-charcoal/60">
            <span className={`px-2 py-0.5 rounded-full ${data.config.autoPublish ? 'bg-charcoal text-cream' : 'bg-warm'}`}>
              自動公開 {data.config.autoPublish ? 'ON' : 'OFF（承認制）'}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-warm">リンク: {data.config.linkMode === 'reply' ? '返信に付ける' : 'プロフィールのみ'}</span>
            <span className="px-2 py-0.5 rounded-full bg-warm">1日 {data.config.postsPerDay} 本 / 配信 {data.config.activeProducts} 商品</span>
            <span className="ml-auto flex gap-1.5">
              {['daily', 'publish', 'metrics', 'report'].map((job) => (
                <Button key={job} variant="secondary" disabled={!!busy} onClick={() => runJob(job)}>
                  {job} を実行
                </Button>
              ))}
            </span>
          </div>
        </>
      )}

      {busy && <p className="text-xs text-charcoal/60 mb-3 animate-pulse">⏳ {busy}…</p>}
      {message && <p className="text-xs bg-warm rounded-xl px-3 py-2 mb-3 break-all">{message}</p>}

      <nav className="flex gap-1.5 mb-4 overflow-x-auto no-scrollbar">
        {TABS.map((x) => (
          <button
            key={x.id}
            onClick={() => setTab(x.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${tab === x.id ? 'bg-charcoal text-cream' : 'bg-warm text-charcoal/60'}`}
          >
            {x.label}
            {x.id === 'queue' && data ? ` (${data.queue.filter((q) => ['draft', 'flagged', 'failed'].includes(q.status)).length})` : ''}
          </button>
        ))}
      </nav>

      {!data && !message && <p className="text-sm text-charcoal/50">読み込み中…</p>}

      {data && tab === 'products' && (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full text-xs">
            <thead className="text-charcoal/50 text-left whitespace-nowrap">
              <tr className="border-b border-stone/60">
                <th className="p-3">商品</th>
                <th className="p-3">状態</th>
                <th className="p-3 text-right">閲覧</th>
                <th className="p-3 text-right">クリック</th>
                <th className="p-3">CTR（90%区間）</th>
                <th className="p-3 text-right">注文</th>
                <th className="p-3 text-right" title="1000閲覧あたり期待報酬（事後中央値）">期待報酬/千閲覧</th>
                <th className="p-3 text-right" title="今の配信商品の中で最も稼ぐ確率">最良確率</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {data.products.map((p) => (
                <tr key={p.id} className="border-b border-stone/40 align-middle">
                  <td className="p-3 max-w-[260px]">
                    <div className="truncate font-medium" title={p.name}>{p.name}</div>
                    <div className="text-charcoal/50 truncate">
                      {p.network === 'amazon' ? 'Amazon' : '楽天'} ・ {p.price ? yen(p.price) : '価格不明'}
                      {p.latestRank ? ` ・ ${p.latestRank}位` : ''}
                      {p.rankPoints > 1 ? ` (${p.rankVelocity < 0 ? '↑' : '↓'}${Math.abs(p.rankVelocity * 100).toFixed(0)}%/日)` : ''}
                    </div>
                    {p.pain && <div className="text-charcoal/70 truncate">「{p.pain}」</div>}
                  </td>
                  <td className="p-3 whitespace-nowrap">{STATUS_LABEL[p.status]}</td>
                  <td className="p-3 text-right tabular-nums">{p.views.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums">{p.clicks.toLocaleString()}</td>
                  <td className="p-3">
                    {p.stats ? <IntervalBar lo={p.stats.ctr.lo} mean={p.stats.ctr.mean} hi={p.stats.ctr.hi} max={ctrMax} /> : <span className="text-charcoal/30">-</span>}
                  </td>
                  <td className="p-3 text-right tabular-nums">{p.orders}</td>
                  <td className="p-3 text-right tabular-nums" title={p.stats ? `90%区間 ${yen(p.stats.ev.lo)} 〜 ${yen(p.stats.ev.hi)}` : ''}>
                    {p.stats ? yen(p.stats.ev.mid) : <span className="text-charcoal/40">事前 {p.prior_score?.toFixed(2)}</span>}
                  </td>
                  <td className="p-3 text-right tabular-nums">{p.stats ? pct(p.stats.probBest, 0) : '-'}</td>
                  <td className="p-3 whitespace-nowrap">
                    <label className="mr-2 text-charcoal/60" title="自分で使った商品だけ体験談を許可">
                      <input type="checkbox" checked={p.experienced} onChange={(e) => productAction(p.id, { experienced: e.target.checked })} /> 使用済
                    </label>
                    {p.status !== 'active' ? (
                      <Button variant="secondary" onClick={() => productAction(p.id, { status: 'active' })}>配信</Button>
                    ) : (
                      <Button variant="secondary" onClick={() => productAction(p.id, { status: 'retired' })}>停止</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.products.length && <p className="p-4 text-sm text-charcoal/50">商品がありません。daily を実行するか「取込・登録」から追加してください。</p>}
        </Card>
      )}

      {data && tab === 'queue' && (
        <div className="space-y-3">
          {data.queue.map((q) => {
            const issues = q.compliance?.issues ?? [];
            const draft = editing[q.id];
            return (
              <Card key={q.id} className={q.status === 'flagged' || q.status === 'failed' ? '!border-red-300' : ''}>
                <div className="flex flex-wrap gap-2 text-[11px] text-charcoal/50 mb-2">
                  <span className="px-2 py-0.5 rounded-full bg-warm text-charcoal">{STATUS_LABEL[q.status]}</span>
                  <span>{q.network === 'amazon' ? 'Amazon' : '楽天'} ・ {q.product}</span>
                  {q.hook_type && <span>型: {q.hook_type}</span>}
                  {q.slot_at && <span>予定: {dt(q.slot_at)}</span>}
                </div>
                {draft !== undefined ? (
                  <textarea rows={8} value={draft} onChange={(e) => setEditing({ ...editing, [q.id]: e.target.value })} className={inputClass} />
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{q.text}</p>
                )}
                {q.link && <p className="text-[11px] text-charcoal/40 mt-1 break-all">リンク: {q.link}</p>}
                {issues.length > 0 && (
                  <ul className="text-[11px] text-red-700 mt-2 list-disc pl-4">
                    {issues.map((i) => <li key={i}>{i}</li>)}
                  </ul>
                )}
                {q.error && <p className="text-[11px] text-red-700 mt-2">{q.error}</p>}
                <div className="flex gap-2 mt-3">
                  {draft !== undefined ? (
                    <>
                      <Button onClick={() => postAction(q.id, 'edit', draft).then(() => setEditing(({ [q.id]: _, ...rest }) => rest))}>保存して再判定</Button>
                      <Button variant="secondary" onClick={() => setEditing(({ [q.id]: _, ...rest }) => rest)}>やめる</Button>
                    </>
                  ) : (
                    <>
                      {['draft', 'failed'].includes(q.status) && <Button onClick={() => postAction(q.id, 'approve')}>承認</Button>}
                      <Button variant="secondary" onClick={() => setEditing({ ...editing, [q.id]: q.text })}>編集</Button>
                      <Button variant="secondary" onClick={() => postAction(q.id, 'reject')}>却下</Button>
                    </>
                  )}
                </div>
              </Card>
            );
          })}
          {!data.queue.length && <p className="text-sm text-charcoal/50">キューは空です。</p>}
        </div>
      )}

      {data && tab === 'recent' && (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full text-xs">
            <thead className="text-charcoal/50 text-left whitespace-nowrap">
              <tr className="border-b border-stone/60">
                <th className="p-3">公開</th>
                <th className="p-3">投稿</th>
                <th className="p-3">型</th>
                <th className="p-3 text-right">閲覧</th>
                <th className="p-3 text-right">反応率</th>
                <th className="p-3 text-right">クリック</th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((r) => (
                <tr key={r.id} className="border-b border-stone/40">
                  <td className="p-3 whitespace-nowrap">{dt(r.published_at)}</td>
                  <td className="p-3 max-w-[360px]">
                    <div className="truncate" title={r.text}>{r.text.split('\n')[0]}</div>
                    <div className="text-charcoal/40 truncate">{r.product}</div>
                  </td>
                  <td className="p-3 whitespace-nowrap">{r.hook_type}</td>
                  <td className="p-3 text-right tabular-nums">{r.views.toLocaleString()}</td>
                  <td className="p-3 text-right tabular-nums">{r.views ? pct(r.engaged / r.views, 1) : '-'}</td>
                  <td className="p-3 text-right tabular-nums">{r.clicks}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.recent.length && <p className="p-4 text-sm text-charcoal/50">まだ公開済みの投稿がありません。</p>}
        </Card>
      )}

      {data && tab === 'analysis' && (
        <div className="grid md:grid-cols-2 gap-3">
          <Card>
            <h2 className="text-sm font-semibold">冒頭の型 × 反応率</h2>
            <p className="text-[11px] text-charcoal/40 mb-3">事後平均。生成ジョブはこの分布から型をサンプリングして選ぶ（Thompson sampling）</p>
            <div className="space-y-1.5">
              {data.hooks.map((h) => (
                <BarRow
                  key={h.id}
                  label={h.id}
                  value={h.rate}
                  max={Math.max(...data.hooks.map((x) => x.rate))}
                  text={`${pct(h.rate, 1)} ・ ${h.posts}本`}
                  sub={`閲覧 ${h.views} / 反応 ${h.engaged}`}
                />
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="text-sm font-semibold">投稿時刻 × 平均閲覧</h2>
            <p className="text-[11px] text-charcoal/40 mb-3">ガンマ・ポアソンの事後平均。予約ジョブは毎日ここから枠を選ぶ</p>
            <div className="space-y-1.5">
              {data.slots.map((s) => (
                <BarRow
                  key={s.id}
                  label={s.id}
                  value={s.meanViews}
                  max={Math.max(...data.slots.map((x) => x.meanViews))}
                  text={`${Math.round(s.meanViews).toLocaleString()} ・ ${s.posts}本`}
                />
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="text-sm font-semibold">商品特徴 → CTR（ロジスティック回帰）</h2>
            {data.featureWeights ? (
              <>
                <p className="text-[11px] text-charcoal/40 mb-3">標準化済み係数。正 = CTR を押し上げる。新商品の事前予測に使用</p>
                <div className="space-y-1">
                  {data.featureWeights.map((f) => (
                    <div key={f.name} className="flex justify-between text-xs">
                      <span>{f.name}</span>
                      <span className="tabular-nums">{f.weight >= 0 ? '+' : ''}{f.weight.toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-charcoal/40 mt-1">閲覧500以上の商品が8件たまると学習を始めます。それまではランキング・レビュー由来のヒューリスティックで候補を並べます。</p>
            )}
          </Card>
          <Card>
            <h2 className="text-sm font-semibold">週次レポート</h2>
            {data.report?.narrative ? (
              <div className="text-xs mt-2 space-y-2">
                <p className="font-medium">{data.report.narrative.headline}</p>
                <ul className="list-disc pl-4 space-y-0.5">{data.report.narrative.findings.map((f) => <li key={f}>{f}</li>)}</ul>
                <p className="font-medium">次にやること</p>
                <ul className="list-disc pl-4 space-y-0.5">{data.report.narrative.actions.map((f) => <li key={f}>{f}</li>)}</ul>
                <p className="text-charcoal/40">{dt(data.report.createdAt)}</p>
              </div>
            ) : (
              <p className="text-[11px] text-charcoal/40 mt-1">report ジョブを実行すると、統計の要約と次の打ち手がここに出ます。</p>
            )}
          </Card>
          <Card className="md:col-span-2">
            <h2 className="text-sm font-semibold mb-2">ジョブ履歴</h2>
            <div className="space-y-1 text-[11px] font-mono">
              {data.runs.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-charcoal/40 shrink-0">{dt(r.started_at)}</span>
                  <span className={r.status === 'error' ? 'text-red-700' : ''}>{r.job} {r.status}</span>
                  <span className="text-charcoal/50 truncate" title={JSON.stringify(r.summary)}>{JSON.stringify(r.summary)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {data && tab === 'import' && (
        <div className="grid md:grid-cols-2 gap-3">
          <Card>
            <h2 className="text-sm font-semibold mb-1">成果レポートの取り込み</h2>
            <p className="text-[11px] text-charcoal/40 mb-2">
              楽天アフィリエイト / Amazon アソシエイトのレポートCSVをそのまま貼り付け。商品コード・ASIN・トラッキングIDで商品と紐づけます。
            </p>
            <div className="flex gap-2 mb-2">
              <select value={conv.network} onChange={(e) => setConv({ ...conv, network: e.target.value })} className={inputClass}>
                <option value="amazon">Amazon</option>
                <option value="rakuten">楽天</option>
              </select>
              <input type="date" value={conv.periodStart} onChange={(e) => setConv({ ...conv, periodStart: e.target.value })} className={inputClass} />
              <input type="date" value={conv.periodEnd} onChange={(e) => setConv({ ...conv, periodEnd: e.target.value })} className={inputClass} />
            </div>
            <textarea rows={8} value={conv.csv} onChange={(e) => setConv({ ...conv, csv: e.target.value })} className={inputClass} placeholder="CSVを貼り付け" />
            <Button
              className="mt-2"
              disabled={!!busy || !conv.csv.trim() || !conv.periodStart || !conv.periodEnd}
              onClick={() =>
                act('取り込み', async () => {
                  const r = await api('/api/engine/conversions', { method: 'POST', body: conv });
                  setMessage(`取り込み: ${r.rows}行（商品と一致 ${r.matched}行） 検出した列: ${JSON.stringify(r.detected)}`);
                })
              }
            >
              取り込む
            </Button>
          </Card>
          <Card>
            <h2 className="text-sm font-semibold mb-1">商品の手動登録</h2>
            <p className="text-[11px] text-charcoal/40 mb-2">PA-API が使えない間の Amazon 商品や、自分で使っている商品を入れる。</p>
            <div className="space-y-2">
              <select value={manual.network} onChange={(e) => setManual({ ...manual, network: e.target.value })} className={inputClass}>
                <option value="amazon">Amazon（ASIN）</option>
                <option value="rakuten">楽天（商品コード + アフィリURL）</option>
              </select>
              <input value={manual.externalId} onChange={(e) => setManual({ ...manual, externalId: e.target.value })} placeholder={manual.network === 'amazon' ? 'ASIN（例 B0XXXXXXXX）' : '商品コード（shop:12345）'} className={inputClass} />
              <input value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="商品名" className={inputClass} />
              {manual.network === 'rakuten' && (
                <input value={manual.url} onChange={(e) => setManual({ ...manual, url: e.target.value })} placeholder="アフィリエイトURL" className={inputClass} />
              )}
              <input value={manual.price} onChange={(e) => setManual({ ...manual, price: e.target.value })} placeholder="価格（選定・期待値計算用、投稿には出さない）" className={inputClass} />
              <input value={manual.pain} onChange={(e) => setManual({ ...manual, pain: e.target.value })} placeholder="中心の悩み（例: 夜中に何度も目が覚める）" className={inputClass} />
              <div className="flex gap-3 text-xs text-charcoal/70">
                <label><input type="checkbox" checked={manual.experienced} onChange={(e) => setManual({ ...manual, experienced: e.target.checked })} /> 自分で使った</label>
                <label><input type="checkbox" checked={manual.activate} onChange={(e) => setManual({ ...manual, activate: e.target.checked })} /> すぐ配信</label>
              </div>
              <Button
                disabled={!!busy || !manual.externalId || !manual.name}
                onClick={() =>
                  act('登録', async () => {
                    await api('/api/engine/products', { method: 'POST', body: manual });
                    setManual({ ...manual, externalId: '', name: '', url: '', price: '', pain: '' });
                  })
                }
              >
                登録
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
