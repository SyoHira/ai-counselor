import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { buildQuestions } from '../config/questions.js';
import { activeProviders } from './providers/index.js';

const RUNS = Number(process.env.RUNS_PER_QUESTION || 3);
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);

/** 1回の呼び出しを一意に決めるキー。再開時の重複実行を防ぐ。 */
const callKey = (c) => `${c.questionId}|${c.provider}|${c.model}|${c.run}`;

export function buildCallMatrix(targets) {
  const questions = buildQuestions(targets);
  const providers = activeProviders();
  const calls = [];
  for (const q of questions) {
    for (const p of providers) {
      for (let run = 1; run <= RUNS; run++) {
        calls.push({
          questionId: q.id,
          questionText: q.text,
          typeId: q.typeId,
          kind: q.kind,
          weight: q.weight,
          meta: q.meta,
          provider: p.id,
          model: p.model,
          run,
        });
      }
    }
  }
  return { calls, questions, providers };
}

/** 既に記録済みの呼び出しキーを読み出す。途中で落ちても続きから走らせるため。 */
async function loadDone(rawPath) {
  const done = new Set();
  if (!fs.existsSync(rawPath)) return done;
  const rl = readline.createInterface({
    input: fs.createReadStream(rawPath),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if (!rec.error) done.add(callKey(rec));
    } catch {
      // 壊れた行は無視して続行する。生ログは捨てない。
    }
  }
  return done;
}

async function pool(items, limit, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

export async function measure({ targets, outDir, dryRun = false, onProgress }) {
  const { calls, questions, providers } = buildCallMatrix(targets);

  if (providers.length === 0) {
    throw new Error(
      ' 有効なプロバイダがありません。.env に ANTHROPIC_API_KEY を設定してください。',
    );
  }

  if (dryRun) return { planned: calls.length, questions, providers, calls };

  fs.mkdirSync(outDir, { recursive: true });
  const rawPath = path.join(outDir, 'raw.jsonl');

  const done = await loadDone(rawPath);
  const todo = calls.filter((c) => !done.has(callKey(c)));

  const out = fs.createWriteStream(rawPath, { flags: 'a' });
  const byId = new Map(providers.map((p) => [p.id, p]));
  let completed = 0;
  let failed = 0;

  await pool(todo, CONCURRENCY, async (call) => {
    const provider = byId.get(call.provider);
    const startedAt = new Date().toISOString();
    let result;
    try {
      result = await provider.ask(call.questionText);
    } catch (err) {
      failed++;
      // 失敗も記録に残す。ただし done には数えないので、再実行で拾い直せる。
      out.write(
        JSON.stringify({ ...call, startedAt, error: String(err?.message ?? err) }) + '\n',
      );
      onProgress?.({ completed, failed, total: todo.length, call, error: true });
      return;
    }

    completed++;
    // 回答は全文そのまま残す。捨てた情報は後から取り戻せない。
    out.write(
      JSON.stringify({
        ...call,
        startedAt,
        finishedAt: new Date().toISOString(),
        text: result.text,
        refused: result.refused,
        refusalCategory: result.refusalCategory ?? null,
        raw: result.raw,
      }) + '\n',
    );
    onProgress?.({ completed, failed, total: todo.length, call });
  });

  await new Promise((r) => out.end(r));

  return {
    rawPath,
    planned: calls.length,
    skipped: calls.length - todo.length,
    completed,
    failed,
  };
}

export function readRaw(rawPath) {
  return fs
    .readFileSync(rawPath, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((r) => r && !r.error);
}
