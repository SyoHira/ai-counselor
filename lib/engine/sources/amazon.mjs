// Amazon Product Advertising API 5.0（amazon.co.jp）。
// PA-API は直近の売上実績が無いアカウントでは使えない。未設定・利用不可の場合は
// /studio/engine の「ASIN 手動登録」で商品を入れて運用する。
import crypto from 'node:crypto';

const HOST = 'webservices.amazon.co.jp';
const REGION = 'us-west-2';
const SERVICE = 'ProductAdvertisingAPI';

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data, 'utf8').digest();
const sha256 = (data) => crypto.createHash('sha256').update(data, 'utf8').digest('hex');

export function amazonConfigured() {
  return Boolean(process.env.AMAZON_ACCESS_KEY && process.env.AMAZON_SECRET_KEY && process.env.AMAZON_PARTNER_TAG);
}

// AWS Signature V4
export function signRequest({ path, target, body, accessKey, secretKey, now = new Date() }) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amzDate.slice(0, 8);
  const headers = {
    'content-encoding': 'amz-1.0',
    'content-type': 'application/json; charset=utf-8',
    host: HOST,
    'x-amz-date': amzDate,
    'x-amz-target': target,
  };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonical = [
    'POST',
    path,
    '',
    ...Object.keys(headers).sort().map((k) => `${k}:${headers[k]}`),
    '',
    signedHeaders,
    sha256(body),
  ].join('\n');
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, date), REGION), SERVICE), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(toSign, 'utf8').digest('hex');
  return {
    ...headers,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function call(operation, payload) {
  const path = `/paapi5/${operation.toLowerCase()}`;
  const body = JSON.stringify({
    PartnerTag: process.env.AMAZON_PARTNER_TAG,
    PartnerType: 'Associates',
    Marketplace: 'www.amazon.co.jp',
    ...payload,
  });
  const headers = signRequest({
    path,
    target: `com.amazon.paapi5.v1.ProductAdvertisingAPIv1.${operation}`,
    body,
    accessKey: process.env.AMAZON_ACCESS_KEY,
    secretKey: process.env.AMAZON_SECRET_KEY,
  });
  const res = await fetch(`https://${HOST}${path}`, { method: 'POST', headers, body });
  const data = await res.json();
  if (!res.ok || data.Errors) {
    throw new Error(`PA-API ${operation}: ${data.Errors?.[0]?.Message || res.status}`);
  }
  return data;
}

const RESOURCES = [
  'ItemInfo.Title',
  'ItemInfo.Classifications',
  'Offers.Listings.Price',
  'BrowseNodeInfo.WebsiteSalesRank',
];

function toItem(item, keyword) {
  return {
    asin: item.ASIN,
    name: item.ItemInfo?.Title?.DisplayValue ?? item.ASIN,
    url: item.DetailPageURL,
    // Amazon の価格は投稿文に書かない（規約上、表示するなら取得日時の併記と24時間以内の更新が必要）。選定にのみ使う
    price: Math.round(item.Offers?.Listings?.[0]?.Price?.Amount ?? 0),
    salesRank: item.BrowseNodeInfo?.WebsiteSalesRank?.SalesRank ?? null,
    category: item.ItemInfo?.Classifications?.ProductGroup?.DisplayValue ?? '',
    keyword,
  };
}

// 価格は最小通貨単位（JPY は円そのまま）
export async function searchItems(keyword, { minPrice, maxPrice } = {}) {
  const data = await call('SearchItems', {
    Keywords: keyword,
    SearchIndex: 'All',
    ItemCount: 10,
    Resources: RESOURCES,
    ...(minPrice ? { MinPrice: minPrice } : {}),
    ...(maxPrice ? { MaxPrice: maxPrice } : {}),
  });
  return (data.SearchResult?.Items ?? []).map((i) => toItem(i, keyword));
}

export async function getItems(asins) {
  const data = await call('GetItems', { ItemIds: asins.slice(0, 10), Resources: RESOURCES });
  return (data.ItemsResult?.Items ?? []).map((i) => toItem(i, ''));
}

export function amazonLink(asin, trackingId) {
  return `https://www.amazon.co.jp/dp/${asin}?tag=${encodeURIComponent(trackingId)}`;
}
