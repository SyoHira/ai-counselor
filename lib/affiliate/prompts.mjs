// Prompts and JSON schemas for the affiliate studio (楽天アフィリ × Threads 運用).
// Each task = one Claude call with structured output.

export const studioSystemPrompt = `あなたは「Andon」(AI Wellness Companion) のSNS運用担当です。
睡眠・集中力・燃え尽き・不安・自己肯定感など、心と身体のコンディションに悩む20〜40代に向けて、
Threads で楽天の商品を紹介し、楽天ROOM / 楽天アフィリエイト経由の購入につなげます。

# 守るルール（法令・規約。例外なし）
- ステマ規制（景品表示法）: 投稿本文の末尾に必ず「#PR」を入れる。
- 薬機法・健康増進法: 健康食品・サプリ・寝具・家電について「治る」「眠れるようになる」「痩せる」「不安が消える」など効能効果を断定しない。
  使ってよいのは「選び方」「仕様・成分の事実」「レビューで多い声（"〜という声が多い"）」「生活習慣の工夫」。
- 体験談の捏造禁止: 運用者が実際に使っていない商品について「使ってみたら」「私は〜で変わった」と書かない。
  experienced=true の商品だけ一人称の体験表現を許可する。
- 医療に関わる悩み（うつ症状・不眠症・パニック等）は商品で解決すると言わず、必要なら受診を促す一文を添える。
- 価格・ランキング順位など変動する数字は断定しない（"5,000円前後" のような幅で書く）。

# 文体
- Andonらしく、責めない・煽らない・寄り添うトーン。ただし冒頭1行目は具体的な悩みで手を止めさせる。
- 1投稿 500文字以内（Threadsの上限）。改行を使って読みやすく。絵文字は0〜2個。
- 商品リンクは本文に貼らない。CTAは指示された形に従う（指示が無ければ「プロフのROOMにまとめてます」系）。`;

const str = { type: 'string' };
const int = { type: 'integer' };
const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

// STEP2: ランキング → 10商品
export const selectSchema = obj({
  products: {
    type: 'array',
    items: obj({
      name: str,
      price: int,
      url: str,
      category: str,
      painOneLiner: str,
      reason: str,
    }),
  },
});

export function selectPrompt({ rankingText, priceTarget, count, avoidNames }) {
  return `以下は楽天ランキング（または候補リスト）です。
価格${priceTarget}円前後で、「その商品で解決したい悩み」が一言で言える商品を${count}個選んでください。
Andonの読者（睡眠・集中・疲労・不安・自己肯定感・リラックス・朝の不調など）に刺さるものを優先し、
薬機法上 効能訴求に頼らないと売れない商品（痩身サプリ等）は避けてください。
${avoidNames.length ? `既に扱っている/除外する商品: ${avoidNames.join(' / ')}\n` : ''}
- url: 候補に含まれるURL（affiliateUrlがあればそれ）をそのまま。無ければ空文字。
- price: 円の整数。不明なら0。
- painOneLiner: 悩みを一言で（例「夜中に何度も目が覚める」）。
- reason: 選んだ理由を1文で。

<ranking>
${rankingText}
</ranking>`;
}

// STEP3: 商品 → 悩み30個
export const painsSchema = obj({
  pains: {
    type: 'array',
    items: obj({ text: str, scene: str, intensity: int }),
  },
});

export function painsPrompt({ product, count }) {
  return `商品「${product.name}」（${product.category} / 約${product.price}円）で解決に近づける悩みを${count}個出してください。
中心の悩み: ${product.painOneLiner}

- text: 読者が心の中でつぶやく言葉そのまま（20〜40文字、口語）。
- scene: その悩みが起きる具体的な場面（時間帯・状況）。
- intensity: 悩みの切実さ 1〜5。
- 同じ悩みの言い換えを並べず、場面・原因・感情を散らす。効能を約束する表現は使わない。`;
}

// STEP4: 悩み → 投稿
export const postsSchema = obj({
  posts: {
    type: 'array',
    items: obj({ pain: str, hook: str, text: str }),
  },
});

const HOOK_GUIDE = {
  共感: '「わかる」と思わせる心の声から入る',
  シーン描写: '時間・場所が浮かぶ具体的な場面から入る',
  問いかけ: '読者が自分ごとで答えたくなる質問から入る',
  '数字・比較': '時間・回数などの具体的な数字や比較から入る（商品性能の誇張はしない）',
  意外な事実: '多くの人が見落としている原因や選び方の視点から入る',
  あるある: '同じ悩みの人が笑ってうなずく小さな失敗談から入る（体験談ルールは守る）',
};

export function postsPrompt({ product, pains, hookType }) {
  const priceLine = product.network === 'amazon'
    ? '価格には一切触れない（Amazonの価格は投稿に書かない）'
    : `価格は「${product.price ? `${Math.round(product.price / 1000)}千円台` : '手に取りやすい価格'}」程度の幅で書いてよい`;
  return `商品「${product.name}」（${product.category} / experienced=${product.experienced ? 'true' : 'false'}）について、
以下の悩み1つにつき1本、Threads投稿を作ってください（計${pains.length}本）。
${hookType ? `冒頭の型: 「${hookType}」= ${HOOK_GUIDE[hookType] ?? hookType}\n` : ''}- ${priceLine}

構成:
1行目 = 悩みの一言（hook と同じ文）
2〜5行目 = 共感 → 原因や選び方の視点 → この商品のどこが合うか（事実ベース）
最後 = ${product.ctaLine ?? '「プロフのROOMにまとめてます」系のCTA'} と #PR

- pain: 元の悩み文をそのまま。
- hook: 1行目の文。
- text: 投稿本文全体（hook を含む、500文字以内、末尾に #PR）。

<pains>
${pains.map((p, i) => `${i + 1}. ${p.text}（場面: ${p.scene}）`).join('\n')}
</pains>`;
}

// 自動承認前のチェック（ルール判定の後に実行）
export const judgeSchema = obj({
  results: {
    type: 'array',
    items: obj({ index: int, ok: { type: 'boolean' }, issues: { type: 'array', items: str } }),
  },
});

export function judgePrompt({ product, posts }) {
  return `あなたは景品表示法・薬機法・アフィリエイト規約のチェック担当です。
以下の投稿それぞれについて、公開してよいか判定してください。

商品: ${product.name}（${product.network} / experienced=${product.experienced ? 'true' : 'false'}）

NGの基準:
- 効能効果の断定・暗示（治る、眠れるようになる、不安が消える、痩せる、医師推奨 等）
- 根拠の無い最上級・比較（最安、No.1、一番効く 等）
- experienced=false なのに一人称の使用体験を書いている
- 不安を過度に煽る、医療行為の代替であるかのような表現
- Amazon商品で価格に触れている
- #PR が無い

ok=false の場合は issues に理由を短く書く。問題が無ければ issues は空配列。

<posts>
${posts.map((p, i) => `[${i}]\n${p.text}`).join('\n\n')}
</posts>`;
}

// STEP5: 週次レビュー → 入れ替え
export const reviewSchema = obj({
  winners: { type: 'array', items: str },
  commonTraits: { type: 'array', items: str },
  drop: { type: 'array', items: str },
  replacements: selectSchema.properties.products,
  nextWeekNotes: str,
});

export function reviewPrompt({ report, products, rankingText, priceTarget }) {
  return `先週の成果データと今週の候補から、来週の10商品を決めてください。

<current_products>
${products.map((p) => `- ${p.name}（${p.price}円 / 悩み: ${p.painOneLiner} / 投稿数: ${p.postCount ?? 0}）`).join('\n')}
</current_products>

<report>
${report}
</report>

<candidates>
${rankingText || '（候補なし: current_products の改善提案のみ）'}
</candidates>

- winners: 売れた/クリックされた商品名。
- commonTraits: 売れた商品の共通点（価格帯・悩みの種類・投稿の切り口など）を3〜5個。データが無い所は推測と明記。
- drop: 外す商品名。
- replacements: drop した数だけ candidates から、commonTraits に沿って ${priceTarget}円前後で選ぶ（形式はSTEP2と同じ）。
- nextWeekNotes: 来週の投稿で変えること（2〜3文）。`;
}
