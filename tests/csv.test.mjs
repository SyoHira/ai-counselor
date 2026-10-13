import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, mapConversionRows } from '../lib/engine/csv.mjs';

test('parseCsv: 引用符・改行・カンマ入りフィールド', () => {
  const rows = parseCsv('a,b\r\n"x, y","say ""hi"""\n\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"']]);
});

test('mapConversionRows: Amazon 風のレポートをトラッキングID単位で合算', () => {
  const csv = `Fee-Earnings Report
Tracking ID,Clicks,Items Shipped,Revenue,Ad Fees
andon-a-22,120,3,"14,940",448
andon-b-22,80,0,0,0
andon-a-22,10,1,"4,980",149`;
  const { rows, detected } = mapConversionRows(csv);
  assert.equal(detected.key, 'Tracking ID');
  assert.deepEqual(rows.find((r) => r.key === 'andon-a-22'), { key: 'andon-a-22', name: '', clicks: 130, orders: 4, revenue: 19920, commission: 597 });
});

test('mapConversionRows: 楽天風（日本語見出し）', () => {
  const csv = '商品名,商品コード,クリック数,売上件数,売上金額,成果報酬\nまくら,shop:123,50,2,"￥9,960",298\n';
  const { rows } = mapConversionRows(csv);
  assert.deepEqual(rows[0], { key: 'shop:123', name: 'まくら', clicks: 50, orders: 2, revenue: 9960, commission: 298 });
});

test('mapConversionRows: キー列が無いとエラー', () => {
  assert.throws(() => mapConversionRows('a,b\n1,2'), /キー列/);
});
