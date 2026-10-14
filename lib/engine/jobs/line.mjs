// LINE ステップ配信（毎日）: 本文が無ければ生成・判定し、承認済みの本文を日数が来た友だちへ一括送信
import { query } from '../db.mjs';
import { config, SEGMENTS, LINE_STEP_DAYS } from '../config.mjs';
import { lineConfigured, multicast, text } from '../channels/line.mjs';
import { generateJson, llmConfigured } from '../llm.mjs';
import { lineStepsSchema, lineStepsPrompt } from '../prompts.mjs';
import { ruleCheck } from '../compliance.mjs';

// LINE 本文は広告ではないので #PR・文字数の判定は外し、効能・最上級・URL の判定だけ使う
export function lineCheck(body) {
  return ruleCheck(`${body}\n#PR`, { network: 'line', experienced: false }).filter((i) => !i.includes('500文字'));
}

async function ensureSteps(summary) {
  const cfg = config();
  for (const segment of SEGMENTS) {
    const [{ n }] = await query('select count(*)::int as n from line_steps where segment = $1', [segment.id]);
    if (n >= LINE_STEP_DAYS.length || !llmConfigured()) continue;
    const { result } = await generateJson({ schema: lineStepsSchema, prompt: lineStepsPrompt({ segment, days: LINE_STEP_DAYS }) });
    for (const s of result.steps.slice(0, LINE_STEP_DAYS.length)) {
      const issues = lineCheck(s.text);
      await query(
        `insert into line_steps (segment, step, day_offset, text, guide_slug, status, compliance) values ($1,$2,$3,$4,$5,$6,$7)
         on conflict (segment, step) do nothing`,
        [segment.id, s.step, LINE_STEP_DAYS[s.step] ?? LINE_STEP_DAYS.at(-1), s.text, s.linkGuide ? segment.id : '',
          issues.length ? 'flagged' : cfg.autoPublish ? 'approved' : 'draft', JSON.stringify({ issues })]
      );
      summary.generated++;
    }
  }
}

export async function lineSteps() {
  const summary = { generated: 0, sent: 0, groups: 0 };
  await ensureSteps(summary);
  if (!lineConfigured()) return { ...summary, skipped: 'LINE 未設定' };

  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const steps = await query(`select * from line_steps where status = 'approved'`);
  // 悩み未選択の人は「不安・自己肯定感」の流れに乗せる
  const due = await query(
    `select user_id, coalesce(nullif(segment, ''), 'mind') as segment, step from line_users
     where not blocked and step < $1 and (last_pushed_at is null or last_pushed_at < now() - interval '20 hours')
       and followed_at <= now() - make_interval(days => ($2::int[])[step + 1])`,
    [LINE_STEP_DAYS.length, LINE_STEP_DAYS]
  );

  const groups = new Map();
  for (const u of due) {
    const key = `${u.segment}:${u.step}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(u.user_id);
  }
  for (const [key, userIds] of groups) {
    const [segment, step] = key.split(':');
    const s = steps.find((x) => x.segment === segment && x.step === Number(step));
    if (!s) continue; // 未承認の本文は送らず、承認されるまで待つ
    const link = s.guide_slug && base ? `\n\n詳しくはこちら（一部PRを含みます）\n${base}/guide/${s.guide_slug}` : '';
    await multicast(userIds, [text(s.text + link)]);
    await query('update line_users set step = step + 1, last_pushed_at = now() where user_id = any($1)', [userIds]);
    await query('update line_steps set sent_count = sent_count + $2 where id = $1', [s.id, userIds.length]);
    summary.sent += userIds.length;
    summary.groups++;
  }
  return summary;
}
