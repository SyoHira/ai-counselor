import test from 'node:test';
import assert from 'node:assert/strict';
import { searchItems, toItem, amazonLink, resetAmazonTokenCache } from '../lib/engine/sources/amazon.mjs';

test('Creators API: トークン取得（キャッシュ）→ searchItems', async () => {
  Object.assign(process.env, { AMAZON_CREDENTIAL_ID: 'cid', AMAZON_CREDENTIAL_SECRET: 'sec', AMAZON_PARTNER_TAG: 'andon-22' });
  resetAmazonTokenCache();
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/auth/o2/token')) return Response.json({ access_token: 'tok', expires_in: 3600 });
    return Response.json({
      searchResult: { items: [{ asin: 'B000000001', detailPageURL: 'https://www.amazon.co.jp/dp/B000000001?tag=andon-22', itemInfo: { title: { displayValue: '枕' } }, browseNodeInfo: { websiteSalesRank: { salesRank: 12 } } }] },
    });
  };
  try {
    const first = await searchItems('枕');
    await searchItems('アイマスク');
    assert.equal(first[0].name, '枕');
    assert.equal(first[0].salesRank, 12);
    assert.equal(calls.filter((c) => c.url.includes('token')).length, 1, 'トークンは1時間キャッシュ');
    const token = calls[0];
    assert.equal(token.url, 'https://api.amazon.co.jp/auth/o2/token');
    assert.equal(new URLSearchParams(token.init.body).get('grant_type'), 'client_credentials');
    const api = calls[1];
    assert.equal(api.url, 'https://creatorsapi.amazon/catalog/v1/searchItems');
    assert.equal(api.init.headers.Authorization, 'Bearer tok');
    assert.equal(api.init.headers['x-marketplace'], 'www.amazon.co.jp');
    assert.equal(JSON.parse(api.init.body).partnerTag, 'andon-22');
  } finally {
    globalThis.fetch = original;
  }
});

test('toItem は PascalCase の応答も読める', () => {
  const item = toItem({ ASIN: 'B0X', DetailPageURL: 'u', ItemInfo: { Title: { DisplayValue: 't' } } });
  assert.equal(item.asin, 'B0X');
  assert.equal(item.name, 't');
  assert.equal(item.url, 'u');
});

test('amazonLink はトラッキングIDを付ける', () => {
  assert.equal(amazonLink('B000000001', 'andon-22'), 'https://www.amazon.co.jp/dp/B000000001?tag=andon-22');
});
