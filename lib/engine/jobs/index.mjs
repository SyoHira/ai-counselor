import { query } from '../db.mjs';
import { refreshToken } from '../channels/threads.mjs';
import { ingest } from './ingest.mjs';
import { portfolio } from './portfolio.mjs';
import { generate } from './generate.mjs';
import { schedule } from './schedule.mjs';
import { publish } from './publish.mjs';
import { metrics } from './metrics.mjs';
import { report } from './report.mjs';
import { researchOffers } from './offers.mjs';
import { lineSteps } from './line.mjs';
import { guides } from './guides.mjs';

// daily: 取得 → 入れ替え → 在庫補充 → 枠割り当て の順に1日1回
export const JOBS = {
  ingest,
  portfolio,
  generate,
  schedule,
  publish,
  metrics,
  report,
  'research-offers': () => researchOffers(),
  'line-steps': lineSteps,
  guides,
  'refresh-token': refreshToken,
  daily: async () => ({
    ingest: await safe(ingest),
    portfolio: await safe(portfolio),
    generate: await safe(generate),
    schedule: await safe(schedule),
    lineSteps: await safe(lineSteps),
  }),
};

async function safe(fn) {
  try {
    return await fn();
  } catch (e) {
    return { error: e.message };
  }
}

export async function runJob(name) {
  const fn = JOBS[name];
  if (!fn) throw new Error(`unknown job: ${name}`);
  const [run] = await query(`insert into job_runs (job, status) values ($1, 'running') returning id`, [name]);
  try {
    const summary = await fn();
    await query(`update job_runs set status = 'ok', summary = $2, finished_at = now() where id = $1`, [run.id, JSON.stringify(summary ?? {})]);
    return summary;
  } catch (e) {
    await query(`update job_runs set status = 'error', summary = $2, finished_at = now() where id = $1`, [run.id, JSON.stringify({ error: e.message })]);
    throw e;
  }
}
