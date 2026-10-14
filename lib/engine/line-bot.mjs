// LINE の受信イベント処理: 友だち追加 → 悩みを選んでもらう → 悩み別ステップ配信 / 自由文には AI が返答
// 危機的なメッセージは AI より先に相談窓口を返す。LINE 上では広告リンクを出さない（ASP の規約でクローズドな場の掲載が禁止の案件があるため）
import { query, one } from './db.mjs';
import { SEGMENTS } from './config.mjs';
import { detectCrisis, CRISIS_MESSAGE } from './crisis.mjs';
import { reply, text, quickReplies } from './channels/line.mjs';
import { generateText, llmConfigured } from './llm.mjs';
import { jstDate } from './time.mjs';

const LINE_STYLE = `

## LINE での返答ルール（上のルールより優先）
- 200字以内。2〜3文の短い段落
- 商品名・サプリの具体的な量・リンクは出さない
- 医療的な判断はしない。つらさが続く場合は医療機関や相談窓口を勧める`;

const segmentChoices = () => quickReplies(SEGMENTS.map((s) => ({ label: s.label, data: `segment=${s.id}` })));

function guideUrl(segment) {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  return base ? `${base}/guide/${segment}` : '';
}

async function setSegment(userId, segmentId) {
  await query('update line_users set segment = $2 where user_id = $1', [userId, segmentId]);
  const seg = SEGMENTS.find((s) => s.id === segmentId);
  const url = guideUrl(segmentId);
  return text(
    `「${seg.label}」ですね。これから数日おきに、${seg.label}について少しずつ役立つことを届けます。\n話したくなったら、ここにそのまま書いてください。AIのAndonが返事をします。` +
      (url ? `\n\nまずはここから読めます（一部PRを含みます）\n${url}` : '')
  );
}

export async function handleLineEvent(event, { systemPrompt, aiDailyLimit = Number(process.env.LINE_AI_DAILY_LIMIT ?? 5) }) {
  const userId = event.source?.userId;
  if (!userId) return;

  if (event.type === 'follow') {
    await query(
      `insert into line_users (user_id) values ($1)
       on conflict (user_id) do update set blocked = false, step = 0, followed_at = now()`,
      [userId]
    );
    await reply(event.replyToken, [
      text('友だち追加ありがとうございます。Andon です。\nいちばん近い悩みをひとつ選んでください。', segmentChoices()),
    ]);
    return;
  }

  if (event.type === 'unfollow') {
    await query('update line_users set blocked = true where user_id = $1', [userId]);
    return;
  }

  // 友だち登録前のユーザーからのメッセージでも行を作る
  await query('insert into line_users (user_id) values ($1) on conflict (user_id) do nothing', [userId]);

  if (event.type === 'postback') {
    const segmentId = new URLSearchParams(event.postback?.data ?? '').get('segment');
    if (SEGMENTS.some((s) => s.id === segmentId)) await reply(event.replyToken, [await setSegment(userId, segmentId)]);
    return;
  }

  if (event.type !== 'message' || event.message?.type !== 'text') return;
  const body = event.message.text.trim();

  if (detectCrisis(body)) {
    await reply(event.replyToken, [text(CRISIS_MESSAGE)]);
    return;
  }

  const chosen = SEGMENTS.find((s) => s.label === body);
  if (chosen) {
    await reply(event.replyToken, [await setSegment(userId, chosen.id)]);
    return;
  }

  // AI 相談は1日あたりの回数を制限（費用と依存の両面）
  const today = jstDate();
  const user = await one('select ai_count, ai_count_date from line_users where user_id = $1', [userId]);
  const used = user?.ai_count_date && jstDate(new Date(user.ai_count_date)) === today ? user.ai_count : 0;
  if (!llmConfigured() || used >= aiDailyLimit) {
    await reply(event.replyToken, [text('今日の AI 相談はここまでです。また明日、続きを聞かせてください。\n急ぎでつらいときは、よりそいホットライン（24時間・無料）0120-279-338 へ。')]);
    return;
  }
  await query('update line_users set ai_count = $2, ai_count_date = $3 where user_id = $1', [userId, used + 1, today]);

  let answer;
  try {
    answer = await generateText({ system: systemPrompt + LINE_STYLE, messages: [{ role: 'user', content: body.slice(0, 2000) }] });
  } catch {
    answer = 'ごめんなさい、いまうまく返事ができませんでした。少し時間をおいてもう一度送ってください。';
  }
  await reply(event.replyToken, [text(answer || '…')]);
}
