'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, Badge, Button, SectionTitle } from '@/components/physics/ui';

const FEATURE = { tutor: 'チューター', generate: '問題生成', grade: '添削' };
const SETUP = {
  gemini: ['GEMINI_API_KEY=（AI Studio で発行したキー）'],
  openrouter: ['OPENROUTER_API_KEY=（openrouter.ai/keys で発行したキー）'],
  ollama: ['OLLAMA_BASE_URL=http://localhost:11434/v1'],
  anthropic: ['ANTHROPIC_API_KEY=（console.anthropic.com で発行したキー）'],
};

const fmtInt = n => (n || 0).toLocaleString('ja-JP');
const fmtUsd = n => `$${(n || 0).toFixed(n && n < 0.01 ? 4 : 2)}`;
const fmtTime = t => new Date(t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

function status(p) {
  if (!p.hasCredential) return ['未設定', 'default'];
  if (!p.model) return ['モデル未選択', 'amber'];
  if (!p.enabled) return ['無効', 'default'];
  if (p.blockedReason) return ['上限到達', 'plasma'];
  return ['使用可', 'quantum'];
}

function ModelChooser({ provider, value, onChange }) {
  const [models, setModels] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [freeOnly, setFreeOnly] = useState(provider.id === 'openrouter');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/physics-ai/models?provider=${provider.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `エラー (${res.status})`);
      setModels(data.models);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const shown = useMemo(() => (models || [])
    .filter(m => !freeOnly || m.free !== false)
    .filter(m => !query || m.id.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 200), [models, freeOnly, query]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={e => onChange(e.target.value.trim())}
          placeholder="モデル名（一覧から選ぶか直接入力）"
          data-role={`model-${provider.id}`}
          className="min-w-0 flex-1 rounded-lg bg-vacuum/60 border border-edge px-2.5 py-1.5 text-[12px] font-mono focus:outline-none focus:border-quantum/60"
        />
        {provider.id !== 'anthropic' && (
          <Button variant="ghost" className="!px-3 !py-1.5 !text-[11.5px]" onClick={load} disabled={loading || !provider.hasCredential}>
            {loading ? '取得中…' : models ? '再取得' : 'モデル一覧を取得'}
          </Button>
        )}
      </div>
      {error && <p className="text-[11px] text-plasma">{error}</p>}
      {models && (
        <div className="rounded-xl border border-edge/70 bg-vacuum/40 p-2 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="絞り込み（例: qwen, deepseek, flash）"
              className="min-w-0 flex-1 rounded-lg bg-panel border border-edge px-2 py-1 text-[11.5px] focus:outline-none" />
            {provider.id === 'openrouter' && (
              <label className="flex items-center gap-1.5 text-[11px] text-qmute">
                <input type="checkbox" checked={freeOnly} onChange={e => setFreeOnly(e.target.checked)} /> 無料のみ
              </label>
            )}
            <span className="text-[10.5px] text-qmute">{shown.length} / {models.length} 件</span>
          </div>
          <div className="max-h-56 overflow-y-auto space-y-0.5">
            {shown.map(m => (
              <button key={m.id} onClick={() => onChange(m.id)}
                className={`w-full text-left rounded-lg px-2 py-1 text-[11.5px] font-mono flex items-center gap-2 ${m.id === value ? 'bg-quantum/15 text-quantum' : 'hover:bg-panel'}`}>
                <span className="truncate flex-1">{m.id}</span>
                {m.free && <Badge tone="photon">無料</Badge>}
                {m.context && <span className="text-[10px] text-qmute shrink-0">{Math.round(m.context / 1000)}k</span>}
              </button>
            ))}
            {!shown.length && <p className="text-[11px] text-qmute px-2 py-1">該当なし</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function OpenRouterCredits() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch('/api/physics-ai/credits').then(async r => {
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setData(d);
    }).catch(e => setError(e.message || '取得できませんでした。'));
  }, []);
  if (error) return <p className="text-[11px] text-plasma">OpenRouter 側の利用額: {error}</p>;
  if (!data) return <p className="text-[11px] text-qmute">OpenRouter 側の利用額を取得中…</p>;
  return (
    <div className="rounded-xl border border-photon/25 bg-photon/[0.05] px-3 py-2.5 text-[11.5px] space-y-0.5" data-role="openrouter-credits">
      <p className="text-[10.5px] text-photon">OpenRouter 側の記録（実際の請求の基準）</p>
      <p>今日 {fmtUsd(data.usageDaily)} ／ 今月 {fmtUsd(data.usageMonthly)} ／ 累計 {fmtUsd(data.usage)}</p>
      <p className="text-qmute">
        キーの上限: {data.limit === null ? 'なし（openrouter.ai/keys で設定できます）' : `${fmtUsd(data.limit)}（残り ${fmtUsd(data.limitRemaining)}${data.limitReset ? `・${data.limitReset}でリセット` : ''}）`}
      </p>
    </div>
  );
}

export default function AiSettingsPage() {
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const apply = data => { setState(data); setDraft(structuredClone(data.settings)); };
  const reload = () => fetch('/api/physics-ai').then(r => r.json()).then(apply).catch(() => setError('状態を読み込めませんでした。'));
  useEffect(() => { reload(); }, []);

  if (!state || !draft) return <p className="text-[12px] text-qmute">{error || '読み込み中…'}</p>;

  const byId = Object.fromEntries(state.providers.map(p => [p.id, p]));
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.settings);
  const update = (id, patch) => setDraft(d => ({ ...d, providers: { ...d.providers, [id]: { ...d.providers[id], ...patch } } }));
  const move = (i, dir) => setDraft(d => {
    const order = [...d.order];
    [order[i], order[i + dir]] = [order[i + dir], order[i]];
    return { ...d, order };
  });
  const numberOrNull = v => v === '' ? null : Number(v);

  const save = async () => {
    setSaving(true); setMessage(''); setError('');
    try {
      const res = await fetch('/api/physics-ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || `エラー (${res.status})`);
      apply(data);
      setMessage('保存しました。');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const totals = state.providers.reduce((t, p) => ({
    today: t.today + p.usage.todayRequests, month: t.month + p.usage.monthRequests,
    cost: t.cost + p.usage.monthCostUsd, tokens: t.tokens + p.usage.monthInputTokens + p.usage.monthOutputTokens,
  }), { today: 0, month: 0, cost: 0, tokens: 0 });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">AI設定と使用量</h1>
        <p className="text-[12px] text-qmute mt-1 leading-relaxed">
          チューターと「AIで生成」が使うAIを選び、回数・トークン・費用を確認します。キーは <code className="font-mono">.env.local</code> にだけ置き、ここでは表示しません。
          「自動」では上から順に試し、失敗や上限到達のときは次へ切り替えます。
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-role="usage-totals">
        {[['今日の利用', `${fmtInt(totals.today)} 回`], ['今月の利用', `${fmtInt(totals.month)} 回`], ['今月のトークン', fmtInt(totals.tokens)], ['今月の費用（記録分）', fmtUsd(totals.cost)]].map(([k, v]) => (
          <Card key={k} className="p-3">
            <p className="text-[10.5px] text-qmute">{k}</p>
            <p className="text-[16px] font-semibold tabular-nums mt-0.5">{v}</p>
          </Card>
        ))}
      </div>

      <section className="space-y-3">
        <SectionTitle sub="上にあるものから順に使います">接続先</SectionTitle>
        {draft.order.map((id, i) => {
          const p = byId[id];
          const d = draft.providers[id];
          const [label, tone] = status({ ...p, model: d.model || p.model, enabled: d.enabled });
          const u = p.usage;
          return (
            <Card key={id} className="p-4 space-y-3" data-provider={id}>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-qmute tabular-nums w-4">{i + 1}</span>
                <h3 className="text-[14px] font-semibold">{p.label}</h3>
                <Badge tone={tone}>{label}</Badge>
                <span className="text-[10.5px] text-qmute hidden sm:inline">{p.costNote}</span>
                <span className="ml-auto flex gap-1">
                  <button disabled={i === 0} onClick={() => move(i, -1)} className="w-7 h-7 rounded-lg border border-edge text-qmute disabled:opacity-30" aria-label="上へ">↑</button>
                  <button disabled={i === draft.order.length - 1} onClick={() => move(i, 1)} className="w-7 h-7 rounded-lg border border-edge text-qmute disabled:opacity-30" aria-label="下へ">↓</button>
                </span>
              </div>

              {!p.hasCredential ? (
                <div className="rounded-xl border border-edge/70 bg-vacuum/40 px-3 py-2.5 text-[11.5px] space-y-1.5">
                  <p className="text-qmute">使うには <code className="font-mono">.env.local</code> に次を追加して、アプリを起動し直してください。</p>
                  {SETUP[id].map(line => <pre key={line} className="font-mono text-[11px] text-qink whitespace-pre-wrap">{line}</pre>)}
                  {id === 'ollama' && <p className="text-qmute">Ollama を起動し（アプリを開くか <code className="font-mono">ollama serve</code>）、<code className="font-mono">ollama pull モデル名</code> でモデルを入れておきます。</p>}
                </div>
              ) : (
                <>
                  <ModelChooser provider={p} value={d.model} onChange={model => update(id, { model })} />
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px]">
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={d.enabled} onChange={e => update(id, { enabled: e.target.checked })} /> 使う
                    </label>
                    <label className="flex items-center gap-1.5">
                      1日の上限
                      <input type="number" min="0" step="1" value={d.dailyRequests ?? ''} onChange={e => update(id, { dailyRequests: numberOrNull(e.target.value) })}
                        placeholder="なし" className="w-20 rounded-lg bg-vacuum/60 border border-edge px-2 py-1 tabular-nums" data-role={`daily-${id}`} /> 回
                    </label>
                    {id === 'openrouter' && (
                      <label className="flex items-center gap-1.5">
                        月の上限 $
                        <input type="number" min="0" step="0.5" value={d.monthlyUsd ?? ''} onChange={e => update(id, { monthlyUsd: numberOrNull(e.target.value) })}
                          placeholder="なし" className="w-20 rounded-lg bg-vacuum/60 border border-edge px-2 py-1 tabular-nums" />
                      </label>
                    )}
                    {p.dashboard && <a href={p.dashboard} target="_blank" rel="noreferrer" className="text-qmute hover:text-quantum ml-auto">公式の使用量 ↗</a>}
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div><p className="text-qmute">今日</p><p className="tabular-nums">{fmtInt(u.todayRequests)} 回{p.limits.dailyRequests !== null && ` / ${p.limits.dailyRequests}`}</p></div>
                <div><p className="text-qmute">今月</p><p className="tabular-nums">{fmtInt(u.monthRequests)} 回{u.monthErrors > 0 && `（失敗 ${u.monthErrors}）`}</p></div>
                <div><p className="text-qmute">今月のトークン</p><p className="tabular-nums">入 {fmtInt(u.monthInputTokens)} / 出 {fmtInt(u.monthOutputTokens)}</p></div>
                <div><p className="text-qmute">今月の費用</p><p className="tabular-nums">
                  {id === 'ollama' ? '$0（ローカル）' : id === 'openrouter' ? fmtUsd(u.monthCostUsd) : id === 'gemini' ? '無料枠なら $0' : '公式画面で確認'}
                </p></div>
              </div>
              {p.blockedReason && <p className="text-[11px] text-plasma">{p.blockedReason}</p>}
              {id === 'openrouter' && p.hasCredential && <OpenRouterCredits />}
            </Card>
          );
        })}
        {(dirty || message || error) && (
          <Card className="sticky bottom-4 p-2 flex items-center gap-3 bg-panel/95 backdrop-blur-xl">
            <Button variant="primary" onClick={save} disabled={!dirty || saving} data-role="save-ai-settings">{saving ? '保存中…' : '設定を保存'}</Button>
            {dirty && <Button variant="subtle" onClick={() => setDraft(structuredClone(state.settings))}>元に戻す</Button>}
            {message && !dirty && <span className="text-[11.5px] text-photon">{message}</span>}
            {error && <span className="text-[11.5px] text-plasma">{error}</span>}
          </Card>
        )}
      </section>

      <section>
        <SectionTitle sub="このPCの data/ai-usage.jsonl に記録しています" right={<Button variant="subtle" onClick={reload}>更新</Button>}>最近の利用</SectionTitle>
        {state.recent.length === 0 ? (
          <p className="text-[12px] text-qmute">まだ記録がありません。</p>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums" data-role="usage-log">
              <thead className="text-qmute text-left">
                <tr>{['日時', '機能', '接続先', 'モデル', '入力', '出力', '費用', '結果'].map(h => <th key={h} className="px-3 py-2 font-normal whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {state.recent.map((e, i) => (
                  <tr key={i} className="border-t border-edge/60">
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmtTime(e.t)}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{FEATURE[e.feature] || e.feature}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{byId[e.provider]?.label || e.provider}</td>
                    <td className="px-3 py-1.5 font-mono max-w-[14rem] truncate">{e.model}</td>
                    <td className="px-3 py-1.5">{e.inputTokens ?? '—'}</td>
                    <td className="px-3 py-1.5">{e.outputTokens ?? '—'}</td>
                    <td className="px-3 py-1.5">{typeof e.costUsd === 'number' ? fmtUsd(e.costUsd) : '—'}</td>
                    <td className={`px-3 py-1.5 whitespace-nowrap ${e.ok ? 'text-photon' : 'text-plasma'}`}>{e.ok ? '成功' : `失敗 ${e.error ?? ''}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}
