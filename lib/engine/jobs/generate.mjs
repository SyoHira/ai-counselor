// 投稿の在庫補充: 悩み生成 → 冒頭の型を Thompson sampling で選んで投稿生成 → ルール判定 → LLM 判定（毎日）
import { query } from '../db.mjs';
import { config } from '../config.mjs';
import { thompsonAllocate } from '../stats.mjs';
import { loadHookArms } from '../analytics.mjs';
import { ruleCheck } from '../compliance.mjs';
import { generateJson, llmConfigured } from '../llm.mjs';
import { painsSchema, painsPrompt, postsSchema, postsPrompt, judgeSchema, judgePrompt } from '../../affiliate/prompts.mjs';

const BATCH = 5;

export async function generate() {
  if (!llmConfigured()) return { skipped: 'ANTHROPIC_API_KEY 未設定' };
  const cfg = config();
  const products = await query(`select * from products where status = 'active' and channels like '%threads%' order by id`);
  if (!products.length) return { skipped: '配信中の商品がありません' };

  // 1商品あたり確保する在庫 = 期間中の枠 ÷ 商品数（最低3本）
  const target = Math.max(3, Math.ceil((cfg.postsPerDay * cfg.postsQueueDays * 2) / products.length));
  const hookArms = await loadHookArms();
  const summary = { pains: 0, posts: 0, approved: 0, flagged: 0, draft: 0 };

  for (const product of products) {
    let pains = await query('select * from pains where product_id = $1 order by used_count, id', [product.id]);
    if (!pains.length) {
      const { result } = await generateJson({
        schema: painsSchema,
        prompt: painsPrompt({ product: { ...product, painOneLiner: product.pain }, count: 30 }),
      });
      for (const p of result.pains) {
        await query('insert into pains (product_id, text, scene, intensity) values ($1,$2,$3,$4)', [product.id, p.text, p.scene, p.intensity]);
      }
      summary.pains += result.pains.length;
      pains = await query('select * from pains where product_id = $1 order by used_count, id', [product.id]);
    }

    const [{ n }] = await query(
      `select count(*)::int as n from posts where product_id = $1 and status in ('draft','approved','scheduled')`,
      [product.id]
    );
    if (n >= target) continue;

    const [hookType] = thompsonAllocate(hookArms, 1);
    const batch = pains.slice(0, BATCH);
    const ctaLine = cfg.linkMode === 'reply' ? '「リンクはリプ欄に置いてます」系のCTA' : '「プロフのROOMにまとめてます」系のCTA';
    const { result } = await generateJson({
      schema: postsSchema,
      prompt: postsPrompt({ product: { ...product, ctaLine }, pains: batch, hookType }),
    });

    // ルールで落ちなかったものだけ LLM 判定へ
    const checked = result.posts.map((post) => ({ ...post, issues: ruleCheck(post.text, product) }));
    const toJudge = checked.filter((p) => !p.issues.length);
    if (toJudge.length) {
      const { result: judged } = await generateJson({ schema: judgeSchema, prompt: judgePrompt({ product, posts: toJudge }), effort: 'low' });
      for (const r of judged.results) if (toJudge[r.index] && !r.ok) toJudge[r.index].issues.push(...r.issues.map((i) => `AI判定: ${i}`));
    }

    for (const post of checked) {
      const pain = batch.find((p) => p.text === post.pain) ?? batch[0];
      const status = post.issues.length ? 'flagged' : cfg.autoPublish ? 'approved' : 'draft';
      await query(
        `insert into posts (product_id, pain_id, hook_type, text, status, compliance) values ($1,$2,$3,$4,$5,$6)`,
        [product.id, pain?.id ?? null, hookType, post.text, status, JSON.stringify({ issues: post.issues, checkedAt: new Date().toISOString() })]
      );
      summary.posts++;
      summary[status]++;
    }
    await query('update pains set used_count = used_count + 1 where id = any($1)', [batch.map((p) => p.id)]);
  }
  return summary;
}
