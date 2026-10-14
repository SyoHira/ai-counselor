// Amazon Creators API（PA-API 5.0 の後継。2026年に PA-API は廃止）。
// 利用条件: アソシエイト登録済みで、直近30日に10件以上の適格売上（Amazon の案内による）。
// 使えない間は /studio/engine の「ASIN 手動登録」で運用する。
// 認証は OAuth 2.0 client_credentials。日本（Far East）の認証情報バージョン 3.3 は Login with Amazon の api.amazon.co.jp を使う。
// 注意: 実API には未接続で、エンドポイントと項目名は公開SDKの資料を基にしている。最初の接続時に応答を確認すること。

const API_BASE = 'https://creatorsapi.amazon/catalog/v1';
const MARKETPLACE = 'www.amazon.co.jp';
const TOKEN_ENDPOINTS = {
  '3.3': 'https://api.amazon.co.jp/auth/o2/token',
  '2.3': 'https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token',
};

export function amazonConfigured() {
  return Boolean(process.env.AMAZON_CREDENTIAL_ID && process.env.AMAZON_CREDENTIAL_SECRET && process.env.AMAZON_PARTNER_TAG);
}

let cached = null; // { token, expiresAt }

async function accessToken() {
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const version = process.env.AMAZON_CREDENTIAL_VERSION || '3.3';
  const endpoint = process.env.AMAZON_TOKEN_ENDPOINT || TOKEN_ENDPOINTS[version];
  if (!endpoint) throw new Error(`未対応の認証情報バージョンです: ${version}（AMAZON_TOKEN_ENDPOINT で指定）`);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.AMAZON_CREDENTIAL_ID,
      client_secret: process.env.AMAZON_CREDENTIAL_SECRET,
      scope: 'creatorsapi::default',
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Creators API token: ${data.error_description || data.error || res.status}`);
  // 期限の30秒前に更新する
  cached = { token: data.access_token, expiresAt: Date.now() + ((data.expires_in ?? 3600) - 30) * 1000, version };
  return cached.token;
}

async function call(operation, payload) {
  const token = await accessToken();
  const version = process.env.AMAZON_CREDENTIAL_VERSION || '3.3';
  const res = await fetch(`${API_BASE}/${operation}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: version.startsWith('2.') ? `Bearer ${token}, Version ${version}` : `Bearer ${token}`,
      'x-marketplace': MARKETPLACE,
    },
    body: JSON.stringify({ partnerTag: process.env.AMAZON_PARTNER_TAG, ...payload }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors?.length) {
    throw new Error(`Creators API ${operation}: ${data.errors?.[0]?.message || data.message || res.status}`);
  }
  return data;
}

const RESOURCES = ['itemInfo.title', 'itemInfo.classifications', 'browseNodeInfo.websiteSalesRank'];

// 応答は lowerCamelCase。念のため PA-API 由来の PascalCase も読む
const pick = (o, ...keys) => keys.reduce((v, k) => v?.[k] ?? v?.[k[0].toUpperCase() + k.slice(1)], o);

export function toItem(item, keyword = '') {
  const asin = pick(item, 'asin') ?? item.ASIN;
  return {
    asin,
    name: pick(item, 'itemInfo', 'title', 'displayValue') ?? asin,
    url: pick(item, 'detailPageURL') ?? item.detailPageUrl ?? `https://www.amazon.co.jp/dp/${asin}`,
    // Creators API は価格（offers）を返さない。期待値計算では目安価格を使う
    price: 0,
    salesRank: pick(item, 'browseNodeInfo', 'websiteSalesRank', 'salesRank') ?? null,
    category: pick(item, 'itemInfo', 'classifications', 'productGroup', 'displayValue') ?? '',
    keyword,
  };
}

function items(data, resultKey) {
  return pick(data, resultKey, 'items') ?? [];
}

export async function searchItems(keyword) {
  const data = await call('searchItems', { keywords: keyword, searchIndex: 'All', itemCount: 10, resources: RESOURCES });
  return items(data, 'searchResult').map((i) => toItem(i, keyword));
}

export async function getItems(asins) {
  const data = await call('getItems', { itemIds: asins.slice(0, 10), resources: RESOURCES });
  return items(data, 'itemsResult').map((i) => toItem(i));
}

export function amazonLink(asin, trackingId) {
  return `https://www.amazon.co.jp/dp/${asin}?tag=${encodeURIComponent(trackingId)}`;
}

export function resetAmazonTokenCache() {
  cached = null;
}
