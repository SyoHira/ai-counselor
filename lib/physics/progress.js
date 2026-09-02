'use client';

import { MODULE_ID_ALIASES, canonicalModuleId } from './moduleIds.js';

// 学習進捗はブラウザのlocalStorageに保存する（サーバ不要・オフラインでも動く）。
// 間隔反復（spaced repetition）は SM-2 を簡略化した固定間隔方式。

const KEY = 'physics.progress.v1';
const REVIEW_DAYS = [1, 3, 7, 16, 35, 90];

export const STATUS = {
  todo: { id: 'todo', label: '未着手', weight: 0 },
  learning: { id: 'learning', label: '学習中', weight: 0.4 },
  review: { id: 'review', label: '復習待ち', weight: 0.7 },
  mastered: { id: 'mastered', label: '習得', weight: 1 },
};

function emptyState() {
  return { modules: {}, sessions: [], updatedAt: null };
}

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const counter = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const date = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;

export function loadProgress() {
  if (typeof window === 'undefined') return emptyState();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    if (!isRecord(parsed)) return emptyState();
    const modules = Object.fromEntries(Object.entries(isRecord(parsed.modules) ? parsed.modules : {})
      .filter(([, entry]) => isRecord(entry))
      .map(([id, entry]) => [id, {
        status: Object.hasOwn(STATUS, entry.status) ? entry.status : 'todo',
        reps: counter(entry.reps), attempts: counter(entry.attempts),
        correct: Math.min(counter(entry.correct), counter(entry.attempts)),
        reviewAt: date(entry.reviewAt), updatedAt: date(entry.updatedAt),
      }]));
    // Old and new IDs can coexist after using multiple versions. They are snapshots,
    // so keep the newer record rather than double-counting attempts.
    for (const [oldId, id] of Object.entries(MODULE_ID_ALIASES)) {
      if (!Object.hasOwn(modules, oldId)) continue;
      if (!Object.hasOwn(modules, id) || (Date.parse(modules[oldId].updatedAt) || 0) > (Date.parse(modules[id].updatedAt) || 0)) {
        modules[id] = modules[oldId];
      }
      delete modules[oldId];
    }
    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions.filter(isRecord).slice(0, 50)
      .map(entry => entry.moduleId ? { ...entry, moduleId: canonicalModuleId(entry.moduleId) } : entry) : [];
    return { modules, sessions, updatedAt: date(parsed.updatedAt) };
  } catch {
    return emptyState();
  }
}

function save(state) {
  if (typeof window === 'undefined') return state;
  state.updatedAt = new Date().toISOString();
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('physics-progress-change'));
  } catch {
    /* 保存領域が使えない環境では黙って続行する */
  }
  return state;
}

export function getModuleProgress(id) {
  id = canonicalModuleId(id);
  const s = loadProgress();
  return s.modules[id] || { status: 'todo', reps: 0, correct: 0, attempts: 0, reviewAt: null, updatedAt: null };
}

export function setStatus(id, status) {
  id = canonicalModuleId(id);
  if (!Object.hasOwn(STATUS, status)) throw new TypeError('Invalid learning status');
  const s = loadProgress();
  const cur = s.modules[id] || { reps: 0, correct: 0, attempts: 0 };
  if (status === 'mastered' && cur.status === 'mastered' && cur.reviewAt && Date.parse(cur.reviewAt) > Date.now()) return s;
  const reps = status === 'mastered' ? (cur.reps || 0) + 1 : cur.reps || 0;
  s.modules[id] = {
    ...cur,
    status,
    reps,
    reviewAt: status === 'mastered' ? nextReview(reps) : null,
    updatedAt: new Date().toISOString(),
  };
  return save(s);
}

function nextReview(reps) {
  const days = REVIEW_DAYS[Math.min(Math.max(reps - 1, 0), REVIEW_DAYS.length - 1)];
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/** 演習の結果を記録する。正答率が高ければ自動的に習得へ進める。 */
export function recordAttempt(id, correct) {
  id = canonicalModuleId(id);
  const s = loadProgress();
  const cur = s.modules[id] || { status: 'learning', reps: 0, correct: 0, attempts: 0 };
  const attempts = (cur.attempts || 0) + 1;
  const ok = (cur.correct || 0) + (correct ? 1 : 0);
  let status = cur.status === 'todo' ? 'learning' : cur.status;
  if (correct && attempts >= 3 && ok / attempts >= 0.8) status = 'mastered';
  if (!correct && ['mastered', 'review'].includes(cur.status)) status = 'review';
  const passedReview = correct && cur.reviewAt && Date.parse(cur.reviewAt) <= Date.now();
  const advance = status === 'mastered' && (cur.status !== 'mastered' || passedReview);
  const reps = advance ? (cur.reps || 0) + 1 : cur.reps || 0;
  s.modules[id] = {
    ...cur, status, attempts, correct: ok, reps,
    reviewAt: advance ? nextReview(reps) : status === 'review' ? new Date().toISOString() : cur.reviewAt || null,
    updatedAt: new Date().toISOString(),
  };
  return save(s);
}

export function logSession(entry) {
  const s = loadProgress();
  s.sessions = [{ ...entry, ...(entry.moduleId ? { moduleId: canonicalModuleId(entry.moduleId) } : {}), at: new Date().toISOString() }, ...(s.sessions || [])].slice(0, 50);
  return save(s);
}

export function resetProgress() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(KEY);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('physics-progress-change'));
}

/** 期限が来た復習項目 */
export function dueForReview(state = loadProgress()) {
  const now = Date.now();
  return Object.entries(state.modules)
    .filter(([, v]) => v.reviewAt && new Date(v.reviewAt).getTime() <= now)
    .map(([id]) => id);
}

/** レベル別・領域別の到達度（0〜1） */
export function computeStats(modules, state = loadProgress()) {
  const score = (id) => {
    const st = state.modules[id]?.status || 'todo';
    return STATUS[st]?.weight ?? 0;
  };
  const agg = (list) => {
    if (!list.length) return { ratio: 0, mastered: 0, total: 0 };
    const mastered = list.filter((m) => state.modules[m.id]?.status === 'mastered').length;
    const ratio = list.reduce((a, m) => a + score(m.id), 0) / list.length;
    return { ratio, mastered, total: list.length };
  };
  const byLevel = {};
  const byTrack = {};
  for (const m of modules) {
    (byLevel[m.level] ||= []).push(m);
    (byTrack[m.track] ||= []).push(m);
  }
  return {
    overall: agg(modules),
    byLevel: Object.fromEntries(Object.entries(byLevel).map(([k, v]) => [k, agg(v)])),
    byTrack: Object.fromEntries(Object.entries(byTrack).map(([k, v]) => [k, agg(v)])),
  };
}

/**
 * 次に取り組むべきモジュールを推薦する。
 * 1) 復習期限が来たもの 2) 前提を満たした未着手・学習中のもの（量子系を優先）
 */
export function recommend(modules, state = loadProgress(), limit = 5) {
  const status = (id) => state.modules[id]?.status || 'todo';
  const byId = new Map(modules.map((m) => [m.id, m]));
  const unmet = (m) =>
    (m.prereqs || []).filter((p) => byId.has(p) && status(p) !== 'mastered');

  const out = [];
  const push = (module, reason) => {
    if (out.length >= limit) return;
    if (out.some((o) => o.module.id === module.id)) return;
    out.push({ module, reason });
  };

  for (const id of dueForReview(state)) {
    const m = byId.get(id);
    if (m) push(m, '復習の時期です');
  }

  // 量子系を優先しつつ、未達の前提が少ない順に並べる
  const priority = { qm: 0, qinfo: 0, math: 1, mech: 2, em: 2 };
  const candidates = modules
    .filter((m) => status(m.id) !== 'mastered')
    .map((m) => ({ m, gap: unmet(m).length }))
    .sort((a, b) => {
      const learning = (status(b.m.id) === 'learning' ? 1 : 0) - (status(a.m.id) === 'learning' ? 1 : 0);
      if (learning !== 0) return learning;
      if (a.gap !== b.gap) return a.gap - b.gap;
      const p = (priority[a.m.track] ?? 3) - (priority[b.m.track] ?? 3);
      if (p !== 0) return p;
      return LEVEL_ORDER.indexOf(a.m.level) - LEVEL_ORDER.indexOf(b.m.level);
    });

  for (const { m, gap } of candidates) {
    if (out.length >= limit) break;
    if (status(m.id) === 'learning') push(m, '学習中の続き');
    else if (gap === 0) push(m, '前提を満たしています');
    else {
      const first = byId.get(unmet(m)[0]);
      push(m, `先に「${first ? first.title : unmet(m)[0]}」を`);
    }
  }
  return out.slice(0, limit);
}

const LEVEL_ORDER = ['hs', 'ug', 'grad', 'phd'];
