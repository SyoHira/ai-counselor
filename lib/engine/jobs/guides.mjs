// 自社ガイドページの生成・更新（週1）: 悩み別に、配信中の商品・案件から合うものを選んで記事にする
import { query } from '../db.mjs';
import { config, SEGMENTS } from '../config.mjs';
import { generateJson, llmConfigured } from '../llm.mjs';
import { guideSchema, guidePrompt } from '../prompts.mjs';
import { ruleCheck } from '../compliance.mjs';

export function guideIssues(body, products) {
  const issues = [];
  const texts = [body.title, body.description, body.intro, ...body.selfCheck, ...body.causes.flatMap((c) => [c.heading, c.body]),
    ...body.tips.flatMap((t) => [t.heading, t.body]), ...body.faq.flatMap((f) => [f.q, f.a])];
  for (const t of texts) {
    for (const i of ruleCheck(`${t}\n#PR`, { network: 'guide', experienced: false })) issues.push(i);
  }
  for (const pick of body.picks) {
    const product = products.find((p) => p.id === pick.productId);
    if (!product) {
      issues.push(`候補に無い商品ID: ${pick.productId}`);
      continue;
    }
    for (const i of ruleCheck(`${pick.reason} ${pick.fitFor}\n#PR`, product)) issues.push(`${product.name}: ${i}`);
  }
  return [...new Set(issues.filter((i) => !i.includes('500文字')))];
}

export async function guides() {
  if (!llmConfigured()) return { skipped: 'ANTHROPIC_API_KEY 未設定' };
  const cfg = config();
  const summary = { updated: [], flagged: [] };
  const published = new Set((await query(`select slug from guides where status = 'published'`)).map((g) => g.slug));
  for (const segment of SEGMENTS) {
    // 公開中のページは、自動公開モードでなければ人の確認なしに書き換えない（ダッシュボードの「作り直す」で下書きに戻す）
    if (published.has(segment.id) && !cfg.autoPublish) continue;
    const products = await query(
      `select id, network, name, category, pain, experienced from products
       where status = 'active' and channels like '%guide%' and segment = $1 order by id`,
      [segment.id]
    );
    const { result } = await generateJson({ schema: guideSchema, prompt: guidePrompt({ segment, products }) });
    const issues = guideIssues(result, products);
    const status = issues.length ? 'flagged' : cfg.autoPublish ? 'published' : 'draft';
    await query(
      `insert into guides (slug, segment, title, description, body, status, compliance, updated_at) values ($1,$1,$2,$3,$4,$5,$6, now())
       on conflict (slug) do update set title = excluded.title, description = excluded.description, body = excluded.body,
         status = excluded.status,
         compliance = excluded.compliance, updated_at = now()`,
      [segment.id, result.title, result.description, JSON.stringify(result), status, JSON.stringify({ issues })]
    );
    (issues.length ? summary.flagged : summary.updated).push(segment.id);
  }
  return summary;
}
