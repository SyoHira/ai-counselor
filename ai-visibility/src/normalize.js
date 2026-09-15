/**
 * 日本語のブランド名照合のための正規化。
 *
 * AI の回答は全角/半角、カタカナ/ひらがな、表記ゆれが混ざる。
 * 素朴な部分一致だと取りこぼすので、比較前に両側を正規化する。
 */

const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const HIRAGANA_OFFSET = 0x60;

function katakanaToHiragana(s) {
  let out = '';
  for (const ch of s) {
    const code = ch.codePointAt(0);
    out +=
      code >= KATAKANA_START && code <= KATAKANA_END
        ? String.fromCodePoint(code - HIRAGANA_OFFSET)
        : ch;
  }
  return out;
}

/** 照合用のキーに落とす。記号・空白・長音を落とし、かなを揃える。 */
export function normalize(s) {
  if (!s) return '';
  return katakanaToHiragana(
    s
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s　]/g, '')
      .replace(/[・･ー－\-‐–—_'"“”‘’「」『』（）()]/g, ''),
  );
}

/**
 * 回答本文にブランドが出現するか。
 * 表記名と別名のいずれかが正規化後に含まれれば出現とみなす。
 */
export function mentions(text, brand) {
  const hay = normalize(text);
  const needles = [brand.name, ...(brand.aliases ?? [])]
    .map(normalize)
    // 2文字未満の別名は誤検出が多すぎるので落とす
    .filter((n) => n.length >= 2);
  return needles.some((n) => hay.includes(n));
}

/** 回答中に出現した全ブランドの id を返す。 */
export function mentionedBrandIds(text, brands) {
  return brands.filter((b) => mentions(text, b)).map((b) => b.id);
}
