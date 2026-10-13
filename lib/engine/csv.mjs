// 成果レポート CSV の取り込み。楽天・Amazon のレポート列名の揺れを吸収する
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === '\t') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  return rows;
}

const COLUMNS = {
  key: ['トラッキングid', 'tracking id', 'asin', '商品コード', 'itemcode', '商品id', '商品管理番号'],
  name: ['商品名', 'name', 'title', 'タイトル'],
  clicks: ['クリック数', 'クリック', 'clicks'],
  orders: ['注文数', '注文済み商品数', '発送済み商品数', '売上件数', '件数', '個数', 'items shipped', 'ordered items', 'items ordered'],
  revenue: ['売上金額', '売上額', '売上', '商品価格', 'revenue', 'price', 'shipped items revenue'],
  commission: ['紹介料', '成果報酬', '報酬額', '報酬', 'ad fees', 'earnings', 'bounty'],
};

const toInt = (v) => Math.round(Number(String(v ?? '').replace(/[¥￥,円\s]/g, '')) || 0);

// 見出し行を探し、key ごとに合算した行を返す
export function mapConversionRows(text) {
  const rows = parseCsv(text);
  const headerIndex = rows.findIndex((r) => r.some((h) => COLUMNS.key.includes(h.trim().toLowerCase())));
  if (headerIndex < 0) throw new Error(`キー列（${COLUMNS.key.join(' / ')}）が見つかりません`);
  const header = rows[headerIndex].map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries(
    Object.entries(COLUMNS).map(([k, names]) => [k, names.map((n) => header.indexOf(n)).find((i) => i >= 0) ?? -1])
  );

  const merged = new Map();
  for (const r of rows.slice(headerIndex + 1)) {
    const key = (r[col.key] ?? '').trim();
    if (!key) continue;
    const cur = merged.get(key) ?? { key, name: '', clicks: 0, orders: 0, revenue: 0, commission: 0 };
    if (col.name >= 0 && !cur.name) cur.name = r[col.name]?.trim() ?? '';
    for (const k of ['clicks', 'orders', 'revenue', 'commission']) if (col[k] >= 0) cur[k] += toInt(r[col[k]]);
    merged.set(key, cur);
  }
  return { rows: [...merged.values()], detected: Object.fromEntries(Object.entries(col).map(([k, i]) => [k, i >= 0 ? rows[headerIndex][i] : null])) };
}
