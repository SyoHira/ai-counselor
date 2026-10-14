# Andon アフィリエイト戦略（2026-10 調査）

結論: **Threads（集客）× LINE公式アカウント（自社リスト）** の2チャネルで、物販（楽天・Amazon）と高単価CPA案件を回す。自社ガイドページ（`/guide/<悩み>`）を広告リンクの置き場にし、LINE からは直接広告リンクを出さない。

調査は Web 検索ベースで、多くの一次資料は本文まで読めていない（各URLで再確認すること）。「〇週間で月〇万円」系の自己申告・情報商材の数字は判断材料にしていない。

---

## 1. 市場の現状

| 項目 | 内容 | 出典 |
|---|---|---|
| 市場規模 | 2025年度 4,598億円（見込み、前年比+5.0%）。2029年度 5,883億円予測。「高成長期から成熟・再編局面へ」 | [矢野経済研究所 2026/3](https://www.yano.co.jp/press-release/show/press_id/4056) |
| 成長率の推移 | 2023年度 +7.3% → 2024年度 +6.5% → 2025年度 +5.0% と鈍化 | [ECのミカタ](https://ecnomikata.com/ecnews/42847/) |
| 伸びている分野 | オンラインクリニック、モール型（楽天・Amazon）、SNS・動画起点（TikTok Shop は2025年6月に日本開始） | [矢野経済研究所 2025/3](https://www.yano.co.jp/press-release/show/press_id/3746)、[TikTok](https://newsroom.tiktok.com/tiktok-shop-launch-japan?lang=ja-JP) |
| SEOブログへの打撃 | A8.net の2026年12月期中間決算で CPA 事業 −17.0%。理由は「生成AIの普及による SEO 依存型メディアのトラフィック減少」 | [JPX 開示](https://www2.jpx.co.jp/disc/24610/081220260807515255_tse-scedjpsy-24610-20260810324610-ixbrl.htm) |
| AI Overviews | 日本で検索1位の CTR が −62.7%（2026年6月、情報収集型KW） | [Ahrefs](https://prtimes.jp/main/html/rd/p/000000061.000157671.html) |
| 収益分布 | 月3万円以上 12.4%、月1,000円未満 52.5%（JAO 2025） | [JAO](https://www.japan-affiliate.org/news/survey2025/) |
| ステマ規制 | 2023年10月施行、2024年6月から措置命令が続く（RIZAP、大正製薬、ロート製薬 等）。対象は原則広告主だが、優良誤認を伴うと課徴金の対象になり得る | [消費者庁 FAQ](https://www.caa.go.jp/policies/policy/representation/fair_labeling/faq/stealth_marketing/) |
| Amazon | PA-API 5.0 は廃止され Creators API（OAuth 2.0）へ移行。利用には直近30日で10件以上の適格売上 | [Amazon 移行ガイド](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/migrating-to-creatorsapi-from-paapi) |
| ASP の API | アフィリエイター向けの公開APIが確認できたのはバリューコマース（商品検索・注文レポート）と afb（成果データ連携）。A8.net は管理画面の CSV。案件検索APIはどこにも無い | [バリューコマース](https://pub-docs.valuecommerce.ne.jp/docs/as-78-order-report-api/)、[afb](https://www.afi-b.com/guide/api-linkage/) |

## 2. 展開方式の比較

| 方式 | 事例（信頼度） | 自動化 | Andon との相性 | 判断 |
|---|---|---|---|---|
| SEOブログ | 企業メディアは伸長（People Inc. Q3 +56%）、個人サイトは Google 変動で流入90%減の例（HouseFresh） | 中 | メンタルは YMYL。新ドメインは不利 | **単独では不採用**。ガイドページは受け皿として最小限 |
| X | 自己申告の月数万円程度 | 高（有料API） | Threads と重複、リンク投稿は伸びにくい | 不採用 |
| **Threads** | 公式APIあり、立ち上がりが早いという報告が多い（自己申告） | **高（既存の仕組みあり）** | 短文の共感投稿が文化に合う | **採用（集客）** |
| Instagram / 楽天ROOM | ROOM 収益化層の最多は月5千円未満 | 中 | 画像・リール制作が重い | 後回し |
| TikTok / Shop | 日本開始1年で GMV 約500億円。上位に集中 | 低〜中 | 動画・ライブが重く、物販中心 | 不採用 |
| YouTube | 2026年2月にショッピング・アフィリエイトが日本開始（楽天連携） | 中 | 工数最大 | 後回し |
| **LINE公式** | アフィリ単体の事例は乏しいが、自社リストとして SNS 変動・凍結に強い | **高（ステップ・セグメント配信）** | 悩み別の継続接点、AI相談との相性 | **採用（自社リスト）** |
| インフルエンサー型 | 精神科医Tomy（X の共感短文 → 50万人超・書籍36万部） | 低（属人的） | Threads 運用の延長として型だけ取り入れる | 型を参考 |
| AI検索（LLMO） | AI経由の流入は全体の約1%。CVR は研究により評価が割れる | 中 | FAQ 構造化したガイドページで最低限対応 | ガイドページで兼ねる |

出典: [方式別の事例と出典一覧](#出典)

## 3. 採用する2チャネルと役割

```
Threads（毎日3本・自動）──┬─ 返信の計測リンク → 楽天 / Amazon / ASP案件（SNS可のみ）
                         └─ プロフィール → LINE 友だち追加
LINE公式（自動）─────────── 悩み別ステップ配信（1・3・7・14日後）＋ AI 相談（1日5回まで）
                         └─ ガイドページ /guide/<悩み> へ案内（広告リンクは LINE に出さない）
ガイドページ ─────────── 選び方・セルフチェック・FAQ ＋ 商品/案件（PR表記、SNS不可のASP案件もここだけに掲載）
```

**LINE に広告リンクを直接出さない理由**: ASP には「LINE・DM などクローズドな場での掲載禁止」の案件がある。Amazon もメール等への埋め込みを認めていない。LINE → 自社ページ → 広告主 の経路にすると、全案件を規約内で扱える。

## 4. 高単価案件（調査時点の参考値。提携前に ASP 管理画面で確認）

| カテゴリ | 例 | 報酬の目安 | 成果条件 | 注意 |
|---|---|---|---|---|
| 退職代行 | 労組運営・弁護士運営の各社 | 1.1万〜1.7万円 | 申込・入金 | 民間は交渉不可。弁護士への成果報酬型紹介は規程上の問題（2025〜26年に退職代行会社の非弁提携事件）。**労組運営を優先、表現は「意思を伝える」まで** |
| 転職（20代） | 20代向けエージェント | 面談で約1.5万円 | 面談完了 | 年収アップ等の保証表現は不可 |
| 結婚相談所 | 相談所の来店予約 | 2万〜3万円 | 来店・面談 | 成果保証不可 |
| マッチングアプリ | 各社 | 2千〜5千円 | 無料登録 | 「18歳未満利用禁止」の表示が必要（出会い系サイト規制法） |
| スクール・自己投資 | プログラミング等 | 1万〜3万円 | 無料カウンセリング | 読者との相性は中 |
| マットレス | 各社 | 購入額の3〜11% | 購入 | 睡眠改善の効能表現は不可 |
| オンラインカウンセリング | — | ASP 案件を確認できず | — | 各社へ直接問い合わせ |

これらは `research-offers` ジョブが毎週 Web 検索で更新し、期待値（報酬 × 承認率 × 読者との相性）で並べる。提携申請は人が行い、発行された URL を入れると配信に乗る。

## 5. 90日の進め方と指標

| 期間 | やること | 見る指標 |
|---|---|---|
| 0〜2週 | ASP（A8.net・もしも・バリューコマース・afb・アクセストレード）と LINE公式・Threads API の登録。高単価案件の提携申請。`AUTO_PUBLISH=false` で投稿・LINE本文・ガイドを確認しながら承認 | 判定で止まった割合、承認までの修正量 |
| 3〜6週 | Threads 毎日3本、LINE ステップ配信開始、ガイド4ページ公開 | Threads 閲覧→クリック率、LINE 友だち増加数、ブロック率 |
| 7〜12週 | バンディットの配分と週次レポートで商品・案件を入れ替え。判定精度に納得できたら `AUTO_PUBLISH=true` | 1000閲覧あたり期待報酬、ガイド経由のクリック、成果件数（CSV取り込み） |

撤退・見直しの目安: 6週時点で LINE ブロック率が30%を超える → ステップ本文を見直す。12週時点でガイド経由のクリックがほぼ無い → ガイドを Threads の固定投稿・プロフィールにも出す。

## 6. リスクと対策

- **景表法・薬機法**: ルール判定と AI 判定の二段で止める（`lib/engine/compliance.mjs`）。カテゴリ別に退職代行・転職・婚活・マッチング・カウンセリングの禁止表現を持つ。
- **メンタル領域の安全**: LINE で希死念慮のサインを検知したら、AI より先に相談窓口（よりそいホットライン 0120-279-338 等）を返す。ガイドの「不安・自己肯定感」ページにも常に掲載。番号は年1回、厚生労働省「まもろうよ こころ」で確認する。
- **アカウント**: Threads は公式APIのみで投稿、上限（24時間250投稿）の十分内側（1日3本＋返信）。
- **データ**: クリックは IP を保存せずハッシュのみ。

## 出典

- 方式別: [People Inc.（IAC 決算）](https://www.sec.gov/Archives/edgar/data/1800227/000162828025048237/ex_991q32025iac-pressrelea.htm)、[HouseFresh](https://searchengineland.com/review-site-google-traffic-affiliate-seo-content-440143)、[Buffer: X のリンク投稿](https://buffer.com/resources/links-on-x/)、[Threads API](https://developers.facebook.com/blog/post/2024/04/08/the-threads-api-is-coming-soon)、[楽天ROOM 利用者調査](https://prtimes.jp/main/html/rd/p/000000204.000030657.html)、[TikTok Shop 日本1年](https://eu.36kr.com/en/p/3961291466440070)、[YouTube ショッピング日本](https://news.mynavi.jp/article/20260219-4144709/)、[精神科医Tomy](https://diamond.jp/articles/-/287871)、[ChatGPT 経由の CVR](https://searchengineland.com/chatgpt-vs-non-branded-organic-search-conversions-470321)
- 高単価案件: [退職代行の報酬比較](https://itan-marke.com/media/career/12868/)、[ビズリーチ](https://enma-blog.com/bizreachpartnershipasp/)、[婚活案件の相場](https://afifree.net/affiliate-konkatsu/)、[テックキャンプ](https://wagtechblog.com/programing/tech-camp-affiliate)、[A8.net PR表記](https://support.a8.net/ec/policy/pr-notation/)、[A8.net 薬機法](https://www.a8.net/compliance/pmd.php)、[退職代行の非弁提携事件](https://roudou-pro.com/columns/944/)
- 相談窓口: [厚生労働省 電話相談](https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/hukushi_kaigo/seikatsuhogo/jisatsu/soudan_tel.html)
