#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { measure, buildCallMatrix } from './measure.js';
import { classify } from './classify.js';
import { analyze } from './analyze.js';
import { buildReport } from './report.js';
import { describeProviders } from './providers/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// .env を読む（依存を増やさないための最小実装）
const envPath = path.join(root, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]] && m[2]) process.env[m[1]] = m[2];
  }
}

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1]?.startsWith('--') ? true : args[i + 1]) : fallback;
};
const has = (name) => args.includes(`--${name}`);

const targetsPath = path.resolve(
  root,
  flag('targets', 'config/targets.json'),
);
const week = flag('week', new Date().toISOString().slice(0, 10));
const outDir = path.resolve(root, flag('out', path.join('data', String(week))));

function loadTargets() {
  if (!fs.existsSync(targetsPath)) {
    console.error(`計測対象のファイルがありません: ${targetsPath}`);
    console.error('config/targets.example.json をコピーして作成してください。');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(targetsPath, 'utf8'));
}

function loadSummary() {
  const p = path.join(outDir, 'summary.json');
  if (!fs.existsSync(p)) {
    console.error(`集計結果がありません: ${p}`);
    console.error('先に analyze を実行してください。');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function printProviders() {
  console.log('プロバイダ:');
  for (const p of describeProviders()) {
    console.log(
      `  ${p.enabled ? '有効' : '無効'}  ${p.id.padEnd(10)} ${p.model ?? '(モデル未設定)'}`,
    );
  }
}

async function cmdMeasure() {
  const targets = loadTargets();

  if (has('dry-run')) {
    const { calls, questions, providers } = buildCallMatrix(targets);
    printProviders();
    console.log('');
    console.log(`質問数     : ${questions.length}`);
    console.log(`プロバイダ : ${providers.length}`);
    console.log(`試行/問    : ${process.env.RUNS_PER_QUESTION || 3}`);
    console.log(`合計呼出   : ${calls.length}`);
    console.log('');
    console.log('質問一覧:');
    for (const q of questions) console.log(`  [${q.label}] ${q.text}`);
    console.log('');
    console.log(
      '費用は各社の課金レートと実際の出力長で決まる。実行後に raw.jsonl の usage を集計して実測すること。',
    );
    return;
  }

  printProviders();
  console.log(`\n出力先: ${outDir}\n`);
  let last = 0;
  const res = await measure({
    targets,
    outDir,
    onProgress: ({ completed, failed, total }) => {
      const n = completed + failed;
      if (n - last >= 10 || n === total) {
        last = n;
        process.stdout.write(`\r  ${n} / ${total}（失敗 ${failed}）`);
      }
    },
  });
  console.log('');
  console.log(
    `\n完了 ${res.completed} ／ 失敗 ${res.failed} ／ 既存分をスキップ ${res.skipped}`,
  );
  if (res.failed) console.log('失敗ぶんは再実行すると続きから拾い直します。');
}

async function cmdClassify() {
  console.log(`分類中: ${outDir}`);
  const res = await classify({
    outDir,
    onProgress: ({ done, failed, total }) => {
      process.stdout.write(`\r  ${done + failed} / ${total}（失敗 ${failed}）`);
    },
  });
  console.log(`\n完了 ${res.labeled} ／ 失敗 ${res.failed} ／ スキップ ${res.skipped}`);
}

function cmdAnalyze() {
  const summary = analyze({ targets: loadTargets(), outDir });
  console.log(`集計しました: ${path.join(outDir, 'summary.json')}`);
  console.log('');
  console.log('順位  ブランド             出現率   安定  たまに  全質問');
  for (const b of summary.brandSummary) {
    console.log(
      `  ${String(b.rank).padStart(2)}  ${b.name.padEnd(18)} ${String(Math.round(b.visibility * 100)).padStart(4)}%   ${String(b.stableQuestions).padStart(3)}   ${String(b.occasionalQuestions).padStart(4)}   ${String(b.totalQuestions).padStart(4)}`,
    );
  }
}

function cmdReport() {
  const targets = loadTargets();
  const summary = loadSummary();
  const only = flag('brand', null);
  const ids = only
    ? [only]
    : targets.brands.filter((b) => b.client).map((b) => b.id);
  if (!ids.length) {
    console.error('client: true のブランドがありません。--brand で指定してください。');
    process.exit(1);
  }
  for (const id of ids) {
    const { file } = buildReport({ summary, targets, outDir, brandId: id });
    console.log(`生成: ${file}`);
  }
}

const HELP = `
AI検索での見え方を測る計測パイプライン

  node src/cli.js measure  [--dry-run] [--targets <path>] [--week <YYYY-MM-DD>]
  node src/cli.js classify [--week <YYYY-MM-DD>]
  node src/cli.js analyze  [--week <YYYY-MM-DD>]
  node src/cli.js report   [--brand <id>] [--week <YYYY-MM-DD>]
  node src/cli.js all

  --dry-run   呼び出さずに、質問一覧と呼び出し回数だけ表示する
  --week      出力先を週で分ける（既定は今日の日付）
  --targets   計測対象の JSON（既定 config/targets.json）
`;

try {
  switch (cmd) {
    case 'measure':
      await cmdMeasure();
      break;
    case 'classify':
      await cmdClassify();
      break;
    case 'analyze':
      cmdAnalyze();
      break;
    case 'report':
      cmdReport();
      break;
    case 'all':
      await cmdMeasure();
      await cmdClassify();
      cmdAnalyze();
      cmdReport();
      break;
    default:
      console.log(HELP);
  }
} catch (err) {
  console.error(`\nエラー: ${err.message}`);
  process.exit(1);
}
