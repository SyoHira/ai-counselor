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

// --- 高単価案件リサーチ ---
export function offerResearchPrompt({ category, known }) {
  return `日本のアフィリエイトASP（A8.net、もしもアフィリエイト、バリューコマース、afb、アクセストレード、TCSアフィリエイト、JANet など）で
現在募集されている「${category}」カテゴリの成果報酬型案件を、Web検索で調べてください。

読者像: 睡眠・燃え尽き・不安・恋愛・自己肯定感に悩む20〜40代（AIカウンセリングアプリ「Andon」の読者）。

案件ごとに分かる範囲で:
- サービス名・広告主、掲載ASP
- 成果報酬額（円）と成果条件（無料登録・面談実施・初回購入など）
- 承認率の目安
- SNS（X・Threads・Instagram・TikTok）での掲載可否、リスティング可否、その他の禁止事項
- 出典URL

報酬額は時期で変わるので、いつの情報かも書いてください。確認できない値は「不明」とし、推測で埋めないでください。
${known.length ? `既に把握している案件（重複して詳しく調べなくてよい）: ${known.join(' / ')}` : ''}`;
}

export const offersSchema = obj({
  offers: {
    type: 'array',
    items: obj({
      asp: str,
      program: str,
      advertiser: str,
      rewardYen: int,
      rewardNote: str,
      condition: str,
      approvalRate: { anyOf: [{ type: 'number' }, { type: 'null' }] },
      snsAllowed: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
      restrictions: str,
      fit: int,
      pain: str,
      riskNotes: str,
      sourceUrls: { type: 'array', items: str },
    }),
  },
});

export function offerExtractPrompt({ category, notes, sources }) {
  return `以下は「${category}」カテゴリのアフィリエイト案件の調査メモです。案件ごとに構造化してください。

- rewardYen: 1件あたりの成果報酬（円）。幅がある場合は下限。定率（%）や不明なら 0。
- rewardNote: 報酬の補足（定率、段階報酬、調査時点など）
- approvalRate: 承認率（0〜1）。不明なら null
- snsAllowed: SNS掲載が明示的に可なら true、不可なら false、不明なら null
- restrictions: 禁止事項・注意（リスティング不可、指名KW不可、SNS不可 等）
- fit: Andon の読者（睡眠・燃え尽き・不安・恋愛・自己肯定感に悩む20〜40代）との相性 1〜5
- pain: この案件につながる読者の悩みを一言で（例「上司の顔を見るだけで動悸がする」）
- riskNotes: 法令・規約上の注意。退職代行は運営主体（民間・労働組合・弁護士）を必ず書く（民間は交渉不可、弁護士への成果報酬型の紹介は弁護士職務基本規程上の問題がある）。転職の誇大表現、マッチングアプリの18歳未満表示、医療行為と誤認される表現など
- sourceUrls: 根拠のURL（メモ中のものだけ。作らない）

メモに無い情報を補完しないこと。案件名が特定できないものは含めない。

<notes>
${notes}
</notes>

<sources>
${sources.map((s) => `${s.title} ${s.url}`).join('\n')}
</sources>`;
}

// --- LINE ステップ配信 ---
export const lineStepsSchema = obj({
  steps: { type: 'array', items: obj({ step: int, text: str, linkGuide: { type: 'boolean' } }) },
});

export function lineStepsPrompt({ segment, days }) {
  return `LINE公式アカウントで「${segment.label}」に悩む友だちへ送るステップ配信を${days.length}通作ってください。
送る日: 友だち追加から ${days.join('日後, ')}日後。

方針:
- 1通 250字以内。押しつけず、読んで少し楽になる内容（今日できる小さな工夫、考え方の整理、セルフチェック）
- 商品名・サービス名・URL・価格は書かない
- 効能の断定・医療的な判断はしない
- 2通目以降のうち1〜2通だけ linkGuide=true にして「詳しくはガイドにまとめました」と添える（URLはシステムが付ける）
- 最後の通では「話したくなったらいつでもここに書いてね」と AI 相談に誘う

step は 0 から始まる連番。`;
}

// --- 自社ガイドページ ---
export const guideSchema = obj({
  title: str,
  description: str,
  intro: str,
  selfCheck: { type: 'array', items: str },
  causes: { type: 'array', items: obj({ heading: str, body: str }) },
  tips: { type: 'array', items: obj({ heading: str, body: str }) },
  picks: { type: 'array', items: obj({ productId: int, heading: str, reason: str, fitFor: str }) },
  faq: { type: 'array', items: obj({ q: str, a: str }) },
});

export function guidePrompt({ segment, products }) {
  return `「${segment.label}」に悩む20〜40代向けのガイドページを作ってください（Andon のサイトに掲載。LINE と Threads からのリンク先、検索・AI検索からも読まれる）。

構成:
- title: 検索されやすい自然な題（32字以内）
- description: 120字以内の要約
- intro: 共感から入る導入（200字）
- selfCheck: 当てはまるか確かめる項目を6〜8個（医学的な診断ではないと分かる言い回し）
- causes: よくある背景を3〜4個（heading + body 150字）
- tips: 今日からできる工夫を4〜6個（heading + body 150字）
- picks: 下の候補から読者に合うものを最大5つ。productId は候補のID。reason は事実ベースの選ぶ理由（120字）、fitFor は「こんな人に」（40字）。合うものが無ければ空配列
- faq: 検索されやすい質問と答えを4〜6個（答えは150字以内、断定的な効能は書かない）

守ること: 効能の断定・最上級表現・成果の保証をしない。医療の代わりにならないことを前提に書く。価格・報酬・キャンペーンには触れない。

<candidates>
${products.length ? products.map((p) => `ID:${p.id} [${p.network}] ${p.name} / カテゴリ: ${p.category} / 悩み: ${p.pain}`).join('\n') : '（なし）'}
</candidates>`;
}
