// 高単価案件の自動リサーチ（週1）: カテゴリごとに Web 検索 → 構造化 → 期待値でスコアリング
// 提携申請とアフィリエイトURLの取得は ASP の規約上 人が行う。URL を入れて有効化すると配信対象（products）になる
import { query, one } from '../db.mjs';
import { config, segmentFor } from '../config.mjs';
import { researchWeb, generateJson, llmConfigured } from '../llm.mjs';
import { offerResearchPrompt, offersSchema, offerExtractPrompt } from '../prompts.mjs';

// 1件の期待値 = 報酬 × 承認率 × 相性。SNS 不可の案件はガイドページだけで使うので半分に割り引く
export function offerExpectedValue(o, cfg = config()) {
  const channelFactor = o.sns_allowed === false ? 0.5 : 1;
  const approval = o.approval_rate ?? cfg.defaultApprovalRate;
  return o.reward_yen * approval * (o.fit / 5) * channelFactor;
}

export async function researchOffers({ categories } = {}) {
  if (!llmConfigured()) return { skipped: 'ANTHROPIC_API_KEY 未設定' };
  const cfg = config();
  const summary = { categories: [], found: 0, new: 0, errors: [] };

  for (const category of categories ?? cfg.offerCategories) {
    try {
      const known = (await query('select program from offers where category = $1', [category])).map((r) => r.program);
      const { text, sources } = await researchWeb({ prompt: offerResearchPrompt({ category, known }) });
      const { result } = await generateJson({ schema: offersSchema, prompt: offerExtractPrompt({ category, notes: text, sources }), effort: 'low' });

      const allowedUrls = new Set(sources.map((s) => s.url));
      for (const o of result.offers) {
        const row = {
          asp: o.asp || '不明',
          program: o.program,
          advertiser: o.advertiser,
          category,
          reward_yen: Math.max(0, o.rewardYen),
          approval_rate: o.approvalRate,
          sns_allowed: o.snsAllowed,
          fit: Math.min(5, Math.max(1, o.fit)),
        };
        // 検索結果に実在したURLだけを根拠として残す
        const urls = o.sourceUrls.filter((u) => allowedUrls.has(u));
        const existing = await one('select id, status from offers where asp = $1 and program = $2', [row.asp, row.program]);
        await query(
          `insert into offers (asp, program, advertiser, category, reward_yen, reward_note, condition, approval_rate, sns_allowed,
             restrictions, fit, pain, risk_notes, sources, expected_value, segment, researched_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
           on conflict (asp, program) do update set advertiser = excluded.advertiser, reward_yen = excluded.reward_yen,
             reward_note = excluded.reward_note, condition = excluded.condition, approval_rate = excluded.approval_rate,
             sns_allowed = excluded.sns_allowed, restrictions = excluded.restrictions, fit = excluded.fit, pain = excluded.pain,
             risk_notes = excluded.risk_notes, sources = excluded.sources, expected_value = excluded.expected_value,
             segment = excluded.segment, researched_at = now()`,
          [row.asp, row.program, row.advertiser, category, row.reward_yen, o.rewardNote, o.condition, row.approval_rate, row.sns_allowed,
            o.restrictions, row.fit, o.pain, o.riskNotes, JSON.stringify(urls), offerExpectedValue(row, cfg),
            segmentFor(`${category} ${o.program} ${o.pain}`)]
        );
        summary.found++;
        if (!existing) summary.new++;
      }
      summary.categories.push(category);
    } catch (e) {
      summary.errors.push(`${category}: ${e.message}`);
    }
  }
  return summary;
}

// アフィリエイトURLを受け取り、配信対象の商品として登録する
export async function activateOffer(id, affiliateUrl) {
  const offer = await one('select * from offers where id = $1', [id]);
  if (!offer) throw Object.assign(new Error('offer not found'), { status: 400 });
  if (!/^https:\/\//.test(affiliateUrl)) throw Object.assign(new Error('アフィリエイトURL（https://）を入れてください'), { status: 400 });
  // SNS掲載不可の案件は自社ガイドページだけに載せる（Threads・LINE には出さない）
  const channels = offer.sns_allowed === false ? 'guide' : 'threads,guide';
  const segment = segmentFor(`${offer.category} ${offer.program} ${offer.pain}`);

  const cfg = config();
  // CPA 案件は「単価 = 報酬」「料率 = 承認率」として期待報酬モデルに載せる
  const product = await one(
    `insert into products (network, external_id, name, price, url, category, pain, commission_rate, status, activated_at, channels, segment)
     values ('asp', $1, $2, $3, $4, $5, $6, $7, 'active', now(), $8, $9)
     on conflict (network, external_id) do update set url = excluded.url, price = excluded.price,
       commission_rate = excluded.commission_rate, status = 'active', activated_at = now(), channels = excluded.channels, segment = excluded.segment
     returning id`,
    [`offer:${offer.id}`, offer.program, offer.reward_yen, affiliateUrl, offer.category, offer.pain,
      offer.approval_rate ?? cfg.defaultApprovalRate, channels, segment]
  );
  await query(`update offers set status = 'active', affiliate_url = $2, product_id = $3 where id = $1`, [id, affiliateUrl, product.id]);
  return { productId: product.id, channels };
}
