// 設定と使用履歴をローカルの data/ に保存する（個人用・ローカル実行が前提）。
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PROVIDER_IDS } from './providers.js';
import { PhysicsApiError } from '../apiValidation.js';

const dir = () => process.env.AI_DATA_DIR || join(process.cwd(), 'data');
const settingsPath = () => join(dir(), 'ai-settings.json');
const usagePath = () => join(dir(), 'ai-usage.jsonl');

export const DEFAULT_SETTINGS = Object.freeze({
  order: ['gemini', 'openrouter', 'ollama', 'anthropic'],
  providers: Object.fromEntries(PROVIDER_IDS.map(id => [id, { enabled: true, model: '', dailyRequests: null, monthlyUsd: null }])),
});

const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const cap = v => v === null || v === undefined || v === '' ? null : Number(v);
const validCap = v => v === null || (Number.isFinite(v) && v >= 0 && v <= 1e6);
const MODEL_RE = /^[\w.\-:/@+]{1,200}$/;

/** 不正な値は既定値に戻して読み込む（手で編集されても壊れない） */
export function normalizeSettings(raw) {
  const base = structuredClone(DEFAULT_SETTINGS);
  if (!object(raw)) return base;
  if (Array.isArray(raw.order)) {
    const order = raw.order.filter(id => PROVIDER_IDS.includes(id));
    base.order = [...new Set([...order, ...base.order])];
  }
  for (const id of PROVIDER_IDS) {
    const p = raw.providers?.[id];
    if (!object(p)) continue;
    if (typeof p.enabled === 'boolean') base.providers[id].enabled = p.enabled;
    if (typeof p.model === 'string' && (p.model === '' || MODEL_RE.test(p.model))) base.providers[id].model = p.model;
    for (const k of ['dailyRequests', 'monthlyUsd']) {
      const v = cap(p[k]);
      if (validCap(v)) base.providers[id][k] = v;
    }
  }
  return base;
}

/** 設定画面からの更新は、黙って直さずに不正なら拒否する */
export function validateSettingsUpdate(raw) {
  const bad = () => { throw new PhysicsApiError('設定値を確認してください。'); };
  if (!object(raw) || !Array.isArray(raw.order) || !object(raw.providers)) bad();
  if (raw.order.length !== PROVIDER_IDS.length || new Set(raw.order).size !== PROVIDER_IDS.length || !raw.order.every(id => PROVIDER_IDS.includes(id))) bad();
  for (const id of PROVIDER_IDS) {
    const p = raw.providers[id];
    if (!object(p) || typeof p.enabled !== 'boolean' || typeof p.model !== 'string' || (p.model && !MODEL_RE.test(p.model))) bad();
    if (!validCap(cap(p.dailyRequests)) || !validCap(cap(p.monthlyUsd))) bad();
    if (cap(p.dailyRequests) !== null && !Number.isInteger(cap(p.dailyRequests))) bad();
  }
  return normalizeSettings(raw);
}

export function loadSettings() {
  try {
    return normalizeSettings(JSON.parse(readFileSync(settingsPath(), 'utf8')));
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings) {
  mkdirSync(dir(), { recursive: true });
  writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

export function recordUsage(entry) {
  try {
    mkdirSync(dir(), { recursive: true });
    appendFileSync(usagePath(), JSON.stringify({ t: new Date().toISOString(), ...entry }) + '\n');
  } catch (error) {
    // 記録できなくても学習は止めない
    console.error('ai usage log failed:', error?.message);
  }
}

export function readUsage() {
  if (!existsSync(usagePath())) return [];
  return readFileSync(usagePath(), 'utf8').split('\n').filter(Boolean).flatMap(line => {
    try { const e = JSON.parse(line); return object(e) && typeof e.t === 'string' ? [e] : []; } catch { return []; }
  });
}

// 日・月の区切りはこのPCのローカル時刻で数える
const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const monthKey = d => `${d.getFullYear()}-${d.getMonth() + 1}`;

export function summarize(entries, now = new Date()) {
  const today = dayKey(now), month = monthKey(now);
  const blank = () => ({ todayRequests: 0, monthRequests: 0, monthErrors: 0, monthInputTokens: 0, monthOutputTokens: 0, monthCostUsd: 0, costKnown: true });
  const byProvider = Object.fromEntries(PROVIDER_IDS.map(id => [id, blank()]));
  for (const e of entries) {
    const s = byProvider[e.provider];
    if (!s) continue;
    const d = new Date(e.t);
    if (dayKey(d) === today) s.todayRequests++;
    if (monthKey(d) !== month) continue;
    s.monthRequests++;
    if (!e.ok) s.monthErrors++;
    s.monthInputTokens += e.inputTokens || 0;
    s.monthOutputTokens += e.outputTokens || 0;
    if (typeof e.costUsd === 'number') s.monthCostUsd += e.costUsd;
    else if (e.ok && e.provider !== 'ollama') s.costKnown = false;
  }
  return byProvider;
}

/** 上限に達していれば理由を返す */
export function limitReason(provider, usage) {
  const { dailyRequests, monthlyUsd } = provider.limits;
  if (dailyRequests !== null && usage.todayRequests >= dailyRequests) return `今日の上限 ${dailyRequests} 回に達しました`;
  if (monthlyUsd !== null && usage.monthCostUsd >= monthlyUsd) return `今月の上限 $${monthlyUsd} に達しました`;
  return null;
}
