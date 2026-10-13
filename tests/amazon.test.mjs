import test from 'node:test';
import assert from 'node:assert/strict';
import { signRequest, amazonLink } from '../lib/engine/sources/amazon.mjs';

// 期待値は aws4@1.13.2 で同じ入力を署名した結果と一致を確認済み
test('PA-API の SigV4 署名', () => {
  const headers = signRequest({
    path: '/paapi5/searchitems',
    target: 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems',
    body: JSON.stringify({ Keywords: '枕', PartnerTag: 'x-22' }),
    accessKey: 'AKIDEXAMPLE',
    secretKey: 'secret',
    now: new Date('2026-10-13T12:34:56Z'),
  });
  assert.equal(headers['x-amz-date'], '20261013T123456Z');
  assert.match(headers.Authorization, /Signature=6037e17a002028288adfc08a4ed86932f6ffc8fe7a5865bb1484c384d1c1cae4$/);
});

test('amazonLink はトラッキングIDを付ける', () => {
  assert.equal(amazonLink('B000000001', 'andon-22'), 'https://www.amazon.co.jp/dp/B000000001?tag=andon-22');
});
