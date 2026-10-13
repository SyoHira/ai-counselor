import { runJob, JOBS } from '@/lib/engine/jobs/index.mjs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// GitHub Actions / Vercel Cron から Authorization: Bearer $CRON_SECRET で呼ぶ
async function handle(request, { params }) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  if (!JOBS[params.job]) return Response.json({ error: 'UNKNOWN_JOB' }, { status: 404 });
  try {
    return Response.json({ job: params.job, summary: await runJob(params.job) });
  } catch (e) {
    return Response.json({ job: params.job, error: e.message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
