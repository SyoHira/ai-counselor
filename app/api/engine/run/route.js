import { runJob, JOBS } from '@/lib/engine/jobs/index.mjs';
import { studioHandler, badRequest } from '@/lib/engine/http.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const POST = studioHandler(async (request) => {
  const { job } = await request.json();
  if (!JOBS[job]) throw badRequest('unknown job');
  return { job, summary: await runJob(job) };
});
