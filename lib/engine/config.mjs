// 自動運転の設定。すべて環境変数で上書きできる。
const list = (v, fallback) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : fallback);
const num = (v, fallback) => (v === undefined || v === '' ? fallback : Number(v));

export function config() {
  const env = process.env;
  return {
    model: env.STUDIO_MODEL || 'claude-opus-5-5',
    timezone: 'Asia/Tokyo',
    postsPerDay: num(env.POSTS_PER_DAY, 3),
    // 時間帯バンディットの候補（JST）。ここから毎日 postsPerDay 枠を選ぶ
    slotCandidates: list(env.SLOT_CANDIDATES, ['07:00', '07:45', '12:10', '12:40', '18:30', '20:00', '21:00', '22:00', '23:00']),
    activeProducts: num(env.ACTIVE_PRODUCTS, 10),
    priceTarget: num(env.PRICE_TARGET, 5000),
    rakutenGenres: list(env.RAKUTEN_GENRES, ['100938', '100804', '100939']),
    amazonKeywords: list(env.AMAZON_KEYWORDS, ['睡眠 グッズ', 'アイマスク', '枕', 'リラックス']),
    amazonTrackingIds: list(env.AMAZON_TRACKING_IDS, []),
    // 楽天APIが料率を返さない時の既定値・Amazonのカテゴリ別料率（アソシエイト規約の最新値で上書きすること）
    defaultCommission: { rakuten: num(env.RAKUTEN_DEFAULT_RATE, 0.03), amazon: num(env.AMAZON_DEFAULT_RATE, 0.03) },
    autoPublish: env.AUTO_PUBLISH === 'true',
    linkMode: env.LINK_MODE || 'reply', // reply: 投稿への返信でリンク / none: プロフィール(ROOM)誘導のみ
    publicBaseUrl: (env.PUBLIC_BASE_URL || '').replace(/\/$/, ''),
    postsQueueDays: num(env.QUEUE_DAYS, 3),
    minViewsToJudge: num(env.MIN_VIEWS_TO_JUDGE, 3000),
    retireProbBest: num(env.RETIRE_PROB_BEST, 0.02),
    // 高単価案件リサーチの対象（Andon の読者の悩みと地続きのもの）
    offerCategories: list(env.OFFER_CATEGORIES, [
      'オンラインカウンセリング',
      '転職エージェント',
      '退職代行',
      '婚活・結婚相談所',
      'コーチング・キャリア相談',
      '睡眠（マットレス・寝具）',
    ]),
    // 承認率が不明な案件に使う既定値
    defaultApprovalRate: num(env.DEFAULT_APPROVAL_RATE, 0.5),
  };
}

// 悩み別セグメント。商品・案件のカテゴリをキーワードで割り当て、LINE のステップ配信とガイドページの単位にする
export const SEGMENTS = [
  { id: 'sleep', label: '眠り', match: /睡眠|眠|枕|マットレス|寝具|アイマスク|入浴/ },
  { id: 'work', label: '仕事・燃え尽き', match: /転職|退職|キャリア|仕事|燃え尽き|コーチング/ },
  { id: 'love', label: '恋愛・婚活', match: /婚活|結婚|マッチング|恋愛/ },
  { id: 'mind', label: '不安・自己肯定感', match: /カウンセリング|メンタル|不安|自己肯定|瞑想|リラックス/ },
];

export function segmentFor(text = '') {
  return SEGMENTS.find((s) => s.match.test(text))?.id ?? '';
}

// LINE のステップ配信: 友だち追加からの日数
export const LINE_STEP_DAYS = [1, 3, 7, 14];

export const HOOK_TYPES = ['共感', 'シーン描写', '問いかけ', '数字・比較', '意外な事実', 'あるある'];
