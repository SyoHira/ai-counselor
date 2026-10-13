// ローカルでジョブを直接実行する: npm run engine -- daily
// .env.local の値は Next と違い自動で読まれないので、node --env-file=.env.local で渡す
import { runJob, JOBS } from '../lib/engine/jobs/index.mjs';

const job = process.argv[2];
if (!JOBS[job]) {
  console.error(`usage: npm run engine -- <${Object.keys(JOBS).join('|')}>`);
  process.exit(1);
}
console.log(JSON.stringify(await runJob(job), null, 2));
process.exit(0);
