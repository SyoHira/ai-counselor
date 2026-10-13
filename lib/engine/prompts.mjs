// 自動運転ジョブ用のプロンプト（手動 Studio のプロンプトは lib/affiliate/prompts.mjs）
const str = { type: 'string' };
const int = { type: 'integer' };
const obj = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

export const pickSchema = obj({
  picks: { type: 'array', items: obj({ id: int, painOneLiner: str, category: str, reason: str }) },
});

export function pickPrompt({ candidates, count }) {
  return `以下は統計スコア順に並べた商品候補です（上ほど期待値が高い）。
この中から、Andonの読者（睡眠・集中・疲労・不安・自己肯定感・リラックス）の悩みが一言で言える商品を${count}個選んでください。
効能を言わないと売れない商品（痩身・医薬品的なサプリ等）、悩みと結びつかない商品は避けてください。スコアが高くても合わなければ飛ばしてかまいません。

- id: 候補のID
- painOneLiner: 中心の悩み（例「夜中に何度も目が覚める」）
- category: 商品カテゴリ（短く）
- reason: 選んだ理由を1文

<candidates>
${candidates
  .map((c) => `ID:${c.id} [${c.network}] ${c.name} / ${c.price || '?'}円 / 順位${c.latestRank ?? '-'} / レビュー${c.review_avg}(${c.review_count}件) / スコア${(c.score ?? 0).toFixed(2)}`)
  .join('\n')}
</candidates>`;
}

export const reportSchema = obj({
  headline: str,
  findings: { type: 'array', items: str },
  actions: { type: 'array', items: str },
});

export function reportPrompt({ stats }) {
  return `アフィリエイト運用の週次データです。統計値は事後分布の要約（ctr は90%区間付き、probBest = 最良である確率、ev = 1000閲覧あたり期待報酬[円]）。
区間が広いものは「まだ判断できない」と扱い、断定しないでください。

- headline: 今週の結論を1文
- findings: データから言えること（3〜6個、数字を添えて）
- actions: 来週やること（3個以内、自動運転の設定や商品・投稿の型に関する具体策）

<stats>
${JSON.stringify(stats, null, 1)}
</stats>`;
}
