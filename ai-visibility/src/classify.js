import fs from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { readRaw } from './measure.js';

const MODEL = process.env.CLASSIFIER_MODEL || 'claude-opus-5';
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);

/**
 * 回答1件を構造化ラベルに落とす。
 *
 * strict: true でスキーマ通りの引数を保証させる。自由記述を後からパースすると
 * 表記ゆれで集計が壊れる。
 */
const LABEL_TOOL = {
  name: 'record_labels',
  description: 'AIの回答を、事実として観測できる項目だけに分解して記録する。',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      stance: {
        type: 'string',
        enum: ['positive', 'mixed', 'negative', 'neutral'],
        description:
          '話題の成分・商品に対する回答全体の論調。推奨していれば positive、否定的なら negative、両論併記は mixed、評価を避けていれば neutral。',
      },
      mentions_safety: {
        type: 'boolean',
        description: '副作用・注意点・飲み合わせ・過剰摂取のいずれかに触れているか。',
      },
      mentions_evidence_limits: {
        type: 'boolean',
        description:
          '根拠が限定的である、個人差がある、研究が不十分といった留保に触れているか。',
      },
      recommends_professional: {
        type: 'boolean',
        description: '医師・薬剤師・専門家への相談を勧めているか。',
      },
      named_brands: {
        type: 'array',
        items: { type: 'string' },
        description:
          '回答中に固有名として登場した商品名・ブランド名。原文の表記のまま。無ければ空配列。',
      },
      named_ingredients: {
        type: 'array',
        items: { type: 'string' },
        description: '回答中に登場した成分名。原文の表記のまま。',
      },
    },
    required: [
      'stance',
      'mentions_safety',
      'mentions_evidence_limits',
      'recommends_professional',
      'named_brands',
      'named_ingredients',
    ],
  },
};

const SYSTEM = `あなたは観測記録の分類器です。
渡された「AIの回答」を読み、record_labels ツールで事実として観測できる項目だけを記録してください。
自分の意見、評価、助言は一切加えないでください。回答に書かれていないことを推測してはいけません。`;

let client;
const getClient = () => (client ??= new Anthropic());

async function labelOne(record) {
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    tools: [LABEL_TOOL],
    tool_choice: { type: 'tool', name: 'record_labels' },
    messages: [
      {
        role: 'user',
        content: `質問：${record.questionText}\n\n---- AIの回答 ----\n${record.text}`,
      },
    ],
  });

  const block = res.content.find(
    (b) => b.type === 'tool_use' && b.name === 'record_labels',
  );
  if (!block) throw new Error('分類結果が返りませんでした');
  // ツール入力は必ず構造として扱う。文字列マッチはしない。
  return block.input;
}

async function pool(items, limit, worker) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) await worker(items[i++]);
    }),
  );
}

export async function classify({ outDir, onProgress }) {
  const rawPath = path.join(outDir, 'raw.jsonl');
  const labelPath = path.join(outDir, 'labels.jsonl');
  const records = readRaw(rawPath).filter((r) => r.text && !r.refused);

  const doneKeys = new Set();
  if (fs.existsSync(labelPath)) {
    for (const line of fs.readFileSync(labelPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        doneKeys.add(JSON.parse(line).key);
      } catch {
        /* 壊れた行は無視 */
      }
    }
  }

  const key = (r) => `${r.questionId}|${r.provider}|${r.model}|${r.run}`;
  const todo = records.filter((r) => !doneKeys.has(key(r)));
  const out = fs.createWriteStream(labelPath, { flags: 'a' });
  let done = 0;
  let failed = 0;

  await pool(todo, CONCURRENCY, async (record) => {
    try {
      const labels = await labelOne(record);
      out.write(JSON.stringify({ key: key(record), labels }) + '\n');
      done++;
    } catch {
      failed++;
    }
    onProgress?.({ done, failed, total: todo.length });
  });

  await new Promise((r) => out.end(r));
  return { labelPath, labeled: done, failed, skipped: records.length - todo.length };
}

export function readLabels(outDir) {
  const p = path.join(outDir, 'labels.jsonl');
  const map = new Map();
  if (!fs.existsSync(p)) return map;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const { key, labels } = JSON.parse(line);
      map.set(key, labels);
    } catch {
      /* 壊れた行は無視 */
    }
  }
  return map;
}
