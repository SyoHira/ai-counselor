// 候補商品の取得とランキングのスナップショット保存（毎日）
import { query } from '../db.mjs';
import { config } from '../config.mjs';
import { fetchRanking } from '../../affiliate/rakuten.mjs';
import { amazonConfigured, searchItems, amazonLink } from '../sources/amazon.mjs';

async function upsertProduct(p) {
  const [row] = await query(
    `insert into products (network, external_id, name, price, url, category, genre_id, commission_rate, review_count, review_avg, tracking_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     on conflict (network, external_id) do update set
       name = excluded.name, price = excluded.price, url = excluded.url,
       review_count = excluded.review_count, review_avg = excluded.review_avg,
       commission_rate = case when excluded.commission_rate > 0 then excluded.commission_rate else products.commission_rate end
     returning id`,
    [p.network, p.externalId, p.name, p.price, p.url, p.category ?? '', p.genreId ?? '', p.commissionRate ?? 0,
      p.reviewCount ?? 0, p.reviewAvg ?? 0, p.trackingId ?? '']
  );
  return row.id;
}

async function snapshot(p, rank) {
  await query(
    'insert into rank_snapshots (network, external_id, genre_id, rank, price, review_count) values ($1,$2,$3,$4,$5,$6)',
    [p.network, p.externalId, p.genreId ?? '', rank, p.price, p.reviewCount ?? 0]
  );
}

export async function ingest() {
  const cfg = config();
  const summary = { rakuten: 0, amazon: 0, errors: [] };

  if (process.env.RAKUTEN_APP_ID) {
    for (const genreId of cfg.rakutenGenres) {
      try {
        const items = await fetchRanking({ genreId });
        for (const i of items) {
          const p = {
            network: 'rakuten', externalId: i.itemCode, name: i.name, price: i.price, url: i.url, genreId,
            commissionRate: i.affiliateRate ?? 0, reviewCount: i.reviewCount, reviewAvg: i.reviewAverage,
          };
          await upsertProduct(p);
          await snapshot(p, i.rank);
          summary.rakuten++;
        }
      } catch (e) {
        summary.errors.push(`rakuten ${genreId}: ${e.message}`);
      }
    }
  }

  if (amazonConfigured()) {
    const trackingIds = cfg.amazonTrackingIds.length ? cfg.amazonTrackingIds : [process.env.AMAZON_PARTNER_TAG];
    for (const keyword of cfg.amazonKeywords) {
      try {
        const items = await searchItems(keyword, {
          minPrice: Math.round(cfg.priceTarget * 0.4),
          maxPrice: Math.round(cfg.priceTarget * 2.5),
        });
        for (const [idx, i] of items.entries()) {
          // トラッキングIDは ASIN ごとに固定で割り当て → アソシエイトのレポートで商品別の成果が取れる
          const trackingId = trackingIds[hash(i.asin) % trackingIds.length];
          const p = {
            network: 'amazon', externalId: i.asin, name: i.name, price: i.price, url: amazonLink(i.asin, trackingId),
            category: i.category, genreId: keyword, trackingId,
          };
          await upsertProduct(p);
          await snapshot(p, i.salesRank ?? idx + 1);
          summary.amazon++;
        }
      } catch (e) {
        summary.errors.push(`amazon ${keyword}: ${e.message}`);
      }
    }
  }

  if (!process.env.RAKUTEN_APP_ID && !amazonConfigured()) summary.skipped = '楽天 / Amazon のAPIキーが未設定';
  return summary;
}

function hash(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
