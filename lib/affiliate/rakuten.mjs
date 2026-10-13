// 楽天市場ランキングAPI（任意）。RAKUTEN_APP_ID が無ければ使わず、ランキングの貼り付けで運用する。
const ENDPOINT = 'https://app.rakuten.co.jp/services/api/IchibaItem/Ranking/20220601';

export const rankingGenres = [
  { id: '0', label: '総合' },
  { id: '100938', label: 'ダイエット・健康' },
  { id: '100939', label: '美容・コスメ' },
  { id: '100804', label: 'インテリア・寝具・収納' },
  { id: '211742', label: 'TV・オーディオ・カメラ' },
];

export async function fetchRanking({ genreId = '0', page = 1 }) {
  const appId = process.env.RAKUTEN_APP_ID;
  if (!appId) {
    const err = new Error('RAKUTEN_APP_ID が未設定です。ランキングを貼り付けて使ってください。');
    err.code = 'RAKUTEN_NOT_CONFIGURED';
    throw err;
  }

  const params = new URLSearchParams({ format: 'json', formatVersion: '2', applicationId: appId, page: String(page) });
  if (genreId && genreId !== '0') params.set('genreId', genreId);
  if (process.env.RAKUTEN_AFFILIATE_ID) params.set('affiliateId', process.env.RAKUTEN_AFFILIATE_ID);

  const res = await fetch(`${ENDPOINT}?${params}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`楽天API エラー (${res.status})`);
  const data = await res.json();

  return (data.Items || []).map((item) => ({
    rank: item.rank,
    itemCode: item.itemCode,
    name: item.itemName,
    price: item.itemPrice,
    url: item.affiliateUrl || item.itemUrl,
    shop: item.shopName,
    reviewAverage: Number(item.reviewAverage) || 0,
    reviewCount: Number(item.reviewCount) || 0,
    // API が料率を返す場合のみ（%表記）
    affiliateRate: item.affiliateRate != null ? Number(item.affiliateRate) / 100 : null,
    genreId: String(item.genreId ?? genreId),
  }));
}

// Claude に渡すテキストへ整形
export function rankingToText(items) {
  return items
    .map((i) => `${i.rank}位 ${i.name} / ${i.price}円 / レビュー${i.reviewAverage}(${i.reviewCount}件) / ${i.url}`)
    .join('\n');
}
