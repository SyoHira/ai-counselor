/**
 * 質問テンプレート。
 *
 * 設計上の要点：
 * 指名質問（branded）は「既に自社を知っている人」の質問なので事業インパクトが小さい。
 * 名前を知らない人が AI に聞いたときに出てくるかどうか（unbranded）が売上に効く。
 * だから unbranded を主軸に置き、branded は補助として測る。
 */

export const QUESTION_TYPES = [
  {
    id: 'category-rec',
    kind: 'unbranded',
    weight: 3,
    label: 'カテゴリ推薦',
    // concern ごとに1問
    build: ({ concerns }) =>
      concerns.map((c) => ({
        key: `category-rec:${c}`,
        text: `${c}のですが、おすすめのサプリメントを教えてください。`,
        meta: { concern: c },
      })),
  },
  {
    id: 'ingredient-eval',
    kind: 'unbranded',
    weight: 3,
    label: '成分の評価',
    build: ({ ingredients }) =>
      ingredients.map((i) => ({
        key: `ingredient-eval:${i}`,
        text: `${i}のサプリメントは効果があるのでしょうか。`,
        meta: { ingredient: i },
      })),
  },
  {
    id: 'safety',
    kind: 'unbranded',
    weight: 2,
    label: '安全性',
    build: ({ ingredients }) =>
      ingredients.map((i) => ({
        key: `safety:${i}`,
        text: `${i}のサプリを飲むときに気をつけることや、飲み合わせはありますか。`,
        meta: { ingredient: i },
      })),
  },
  {
    id: 'comparison',
    kind: 'unbranded',
    weight: 3,
    label: '比較・選び方',
    build: ({ ingredients }) =>
      ingredients.map((i) => ({
        key: `comparison:${i}`,
        text: `${i}のサプリはどれを選べばいいですか。選び方と具体的な商品を教えてください。`,
        meta: { ingredient: i },
      })),
  },
  {
    id: 'branded',
    kind: 'branded',
    weight: 1,
    label: '指名',
    build: ({ brands }) =>
      brands
        .filter((b) => b.client)
        .flatMap((b) =>
          (b.products.length ? b.products : [null]).map((p) => ({
            key: `branded:${b.id}${p ? `:${p}` : ''}`,
            text: p
              ? `${b.name}の「${p}」という商品はどうですか。`
              : `${b.name}というブランドのサプリはどうですか。`,
            meta: { brandId: b.id, product: p },
          })),
        ),
  },
];

export function buildQuestions(targets) {
  const out = [];
  for (const type of QUESTION_TYPES) {
    for (const q of type.build(targets)) {
      out.push({
        id: q.key,
        typeId: type.id,
        kind: type.kind,
        weight: type.weight,
        label: type.label,
        text: q.text,
        meta: q.meta ?? {},
      });
    }
  }
  return out;
}
