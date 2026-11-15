"""販売先ごとの決まり。値には出典と確認日を付ける。確認できていない値は None にして、出品前の確認項目（checklist）に回す。

確かめ方の区別（how）
  原文    公式ページの本文を読んで確かめた
  要約    検索エンジンが公式ページから抜き出した要約で確かめた（原文は未読。出品前に原文を読む）
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Platform:
    key: str
    name: str
    msg_place: str  # メッセージをやり取りする場所
    send: str  # ファイルを送る言い方（「〜ください」の前）
    buy: str  # 「ご購入」「お申し込み」
    approve: str  # 最終の納品のときに添える一文
    monitor: str  # モニター価格の書き方
    fee_rate: float  # 販売・決済の手数料（売上に対する割合）
    fee_fixed: float = 0.0  # 1件あたりの固定の手数料（円）
    buyer_fee_rate: float = 0.0  # 買い手が価格に上乗せして払う手数料の割合
    payout: str = ""  # 売上が入る時期
    external_links: bool = False  # 出品文・メッセージに外部URLを書いてよいか
    contact_exchange: bool = False  # メールアドレスなど外部の連絡先を交換してよいか
    files: str = ""  # ファイルの受け渡しの手段
    markup: str = "plain"  # 出品文の書式（plain / markdown）
    title_max: int | None = None
    body_max: int | None = None
    listing_footer: str = ""
    message_rule: str = ""
    checklist: list[str] = field(default_factory=list)  # 出品前に確かめること
    sources: list[tuple[str, str, str, str]] = field(default_factory=list)  # （何を, URL, 確認日, how）


COCONALA = Platform(
    key="coconala",
    name="ココナラ",
    msg_place="トークルーム",
    send="トークルームに添付して送って",
    buy="ご購入",
    approve="内容をご確認のうえ、承諾をお願いいたします。",
    monitor="（販売実績10件までのモニター価格。その後 15,000円に変更します）",
    fee_rate=0.22,
    payout="正式な納品の後、承諾または72時間後の自動承諾で確定",
    external_links=False,
    contact_exchange=False,
    files="トークルームのファイル添付（1ファイル100MB・1回5個。Excel・PDF は可、CSV・HTML は一覧にない）",
    markup="plain",
    message_rule="外部の連絡先・URL・フォームは書かない（ココナラの禁止行為）。ファイルはトークルームに添付する。",
    checklist=[
        "出品前：ヘルプの原文で、AIで作った文章を納品できるか・売上の確定時点を確かめる（docs/04-compliance.md の 3・4）",
        "出品前：運営に、健康関連の禁止出品に当たらないか・Excel の受け渡しが外部誘導に当たらないかを問い合わせる（同 7・8）",
        "出品画面で、カテゴリの最低価格・タイトルの文字数の上限を確かめる（未確認）",
        "同じ内容を複数の価格で出せないため、入口と本番は別の出品にする",
    ],
    sources=[
        ("販売手数料22%（ビデオチャット27.5%）", "https://help.coconala.com/hc/ja/articles/230180287", "2026-11-13", "要約"),
        ("外部の連絡先の交換・外部フォームへの誘導の禁止", "https://help.coconala.com/hc/ja/articles/10003485737881", "2026-11-13", "要約"),
        ("添付ファイルの形式と容量", "https://help.coconala.com/hc/ja/articles/218721057", "2026-11-13", "要約"),
        ("正式な納品・承諾・自動承諾（72時間）", "https://help.coconala.com/hc/ja/articles/218723567", "2026-11-13", "要約"),
        ("AI技術を使用した出品のスタンス", "https://help.coconala.com/hc/ja/articles/48479864968729", "2026-11-13", "要約"),
        ("医療行為・効能をうたう食品の紹介の禁止", "https://help.coconala.com/hc/ja/articles/9517249749017", "2026-11-13", "要約"),
    ],
)

NOTE = Platform(
    key="note",
    name="note",
    msg_place="メール",
    send="メールに添付して送って",
    buy="ご購入",
    approve="",
    monitor="（モニター価格）",
    fee_rate=0.15,  # カード決済の事務手数料5%＋プラットフォーム利用料10%（要約）。計算の順で14.5%になる可能性もあり、多めに15%で見る
    payout="毎月2日に前月分が確定し、2〜20日に申請すると当月末に入金（振込手数料270円）",
    external_links=True,  # 外部誘導の規定は見つからなかった（要約）。checklist で確かめる
    contact_exchange=True,  # 同上
    files="有料部分へのファイル添付（アプリ版は50MBまで。形式の制限は不明）。お客さんからの受け取りはメール",
    markup="markdown",
    title_max=None,
    message_rule="note には個別のメッセージ機能がないため、購入後の連絡はメールで行う（購入者への案内は有料部分に書く）。",
    listing_footer="ご購入後の始め方は、この記事の有料部分に書いてあります。",
    checklist=[
        "note の規約・ヘルプの原文で、有料記事の購入者とメールで個別にやり取りすることが認められているかを確かめる（外部誘導の規定は見つからなかったが未確認）",
        "売る形を決める：入口は有料記事（有料部分にメールアドレスと始め方を書く）、本番はメンバーシップの1対1プラン（公開できるプランは5つまで、月100〜50,000円）",
        "特定商取引法上の販売業者に当たる場合は表示が必要（「請求があれば開示」で省略可、開示請求は note 運営経由）",
        "手数料の計算の順（5%と10%）を料金ページの原文で確かめる",
    ],
    sources=[
        ("手数料・売上の確定と入金", "https://www.help-note.com/hc/ja/articles/360011358873", "2026-11-15", "要約"),
        ("メンバーシップの1対1プラン", "https://www.help-note.com/hc/ja/articles/900000164086", "2026-11-15", "要約"),
        ("規約（景表法・薬機法・医療法に反する投稿の禁止）", "https://www.help-note.com/hc/ja/articles/360008947533", "2026-11-15", "要約"),
        ("特定商取引法の表示", "https://www.help-note.com/hc/ja/articles/19598976562457", "2026-11-15", "要約"),
    ],
)

MENTA = Platform(
    key="menta",
    name="MENTA",
    msg_place="MENTA のメッセージ",
    send="MENTA のメッセージで送って",
    buy="ご契約",
    approve="",
    monitor="（モニター価格）",
    fee_rate=0.20,  # メンター側：利用料15%＋決済5%（要約）
    buyer_fee_rate=0.10,  # メンティー側の手数料（要約）
    payout="支払いから30日たち、1,000円以上で出金できる（出金手数料300円）",
    external_links=False,  # MENTA を通さない直接取引・勧誘は禁止（要約）
    contact_exchange=False,
    files="メッセージの添付は jpg・png・gif・pdf で8MBまで（古い記事。Excel は一覧にない）",
    markup="plain",
    message_rule="MENTA を通さない直接取引・勧誘は禁止。外部の連絡先を書かない。",
    listing_footer="本番の1人実験は、提供期間の上限（1か月）があるため、月額プランで2か月のご契約になります。",
    checklist=[
        "メッセージに Excel（.xlsx）を添付できるかを確かめる（古い記事では jpg・png・gif・pdf だけ）。できなければ、MENTA の外の道具を使ってよいか（メンターが提案すれば可とある）を確かめ、使う場合は購入者の同意を取る",
        "提供期間の上限が1か月（単発は30日）なので、本番（35日以上）は月額プランで2か月の契約にする",
        "メンティー側にも手数料10%がかかるため、買い手の支払いは価格の1.1倍になる",
        "ガイドラインの「医師法・薬事法に抵触するサービス」に当たらない書き方になっているかを確かめる",
    ],
    sources=[
        ("手数料・出金", "https://intercom.help/mentajp/ja/articles/3025582", "2026-11-15", "要約"),
        ("禁止事項（直接取引・医師法・薬事法）", "https://intercom.help/mentajp/ja/articles/4447150", "2026-11-15", "要約"),
        ("添付ファイルの形式", "https://intercom.help/mentajp/ja/articles/3771287", "2026-11-15", "要約"),
    ],
)

TIMETICKET = Platform(
    key="timeticket",
    name="タイムチケット",
    msg_place="タイムチケットのメッセージ",
    send="タイムチケットのメッセージに添付して送って",
    buy="ご購入",
    approve="",
    monitor="（モニター価格）",
    fee_rate=0.25,  # 2025-08-01からの段階制で、5万円以下は25%（税別）（要約）。一律10%と書いたページも残る
    payout="購入時の希望日時の24時間後に売上計上（振込手数料はホスト負担）",
    external_links=False,  # 外部リンク（LINE・ブログなど）の掲載は禁止（要約）
    contact_exchange=False,  # 申込承認後に必要な連絡先の交換は可（要約）。出品文には書かない
    files="メッセージの添付（1回5ファイル、pdf・xls・xlsx は20MBまで）",
    markup="plain",
    message_rule="出品文に外部リンクを書かない（禁止）。サービス外の取引には違約金がある。",
    checklist=[
        "手数料を確かめる（5万円以下25%と、一律10%の両方の記載がある）",
        "数週間にわたる伴走を1つのチケットで売れるか（希望日時の24時間後に売上計上の仕組みとの合い方）を確かめる",
        "出金時に本人確認書類が必要",
    ],
    sources=[
        ("手数料（段階制）", "https://blog.timeticket.jp/post/729784907433492480/", "2026-11-15", "要約"),
        ("外部リンクの禁止・連絡先の交換", "https://help.timeticket.jp/articles/19386", "2026-11-15", "要約"),
        ("添付ファイル", "https://help.timeticket.jp/articles/121411", "2026-11-15", "要約"),
    ],
)

OWN_SITE = Platform(
    key="own_site",
    name="自分のサイト（Stripe）",
    msg_place="メール",
    send="メールに添付して送って",
    buy="お申し込み",
    approve="",
    monitor="（モニター価格）",
    fee_rate=0.036,  # Stripe の国内カード 3.6%（要約）
    payout="Stripe の入金（初回は7日後、その後は手動・週次・月次から選ぶ）",
    external_links=True,
    contact_exchange=True,
    files="メールの添付",
    markup="markdown",
    message_rule="",
    checklist=[
        "Stripe の禁止・制限業種（栄養補助食品は高リスク扱い）にこのサービスが当たらないかを確かめる。サプリを売るのではなく、記録の分析を売ることを説明できるようにする",
        "特定商取引法に基づく表示を埋める（run site で【要記入】が残ると警告が出る）。住所・電話番号を「請求があれば遅滞なく開示」で省略する場合は、実際に開示できる体制にする",
        "最終確認画面（支払いの直前）に、価格・支払いの時期・提供の時期・撤回の条件が出るようにする（特定商取引法12条の6）。Stripe の支払いページに出ない項目は、申し込みボタンの直前に書く（run site はボタンの上に出す）",
        "記録の扱い（利用目的など）を公開してから受け付ける",
    ],
    sources=[
        ("通信販売の広告の表示事項・省略できる条件", "https://www.no-trouble.caa.go.jp/qa/advertising.html", "2026-11-15", "原文"),
        ("通信販売の規制", "https://www.no-trouble.caa.go.jp/what/mailorder/", "2026-11-15", "原文"),
        ("Stripe の手数料", "https://stripe.com/en-jp/pricing", "2026-11-15", "要約"),
        ("Stripe の制限業種", "https://stripe.com/legal/restricted-businesses", "2026-11-15", "要約"),
        ("Stripe の入金", "https://docs.stripe.com/payouts", "2026-11-15", "要約"),
    ],
)

# 調べたうえで、今の形のサービスには使わない販売先（理由つき）
NOT_SUITABLE = {
    "BASE": "無形の商品でも、追跡できる方法で有形のものを送ることが必須（メールでの送付は不可）（要約、https://help.thebase.in/hc/ja/articles/115000041462）",
    "STORES": "商品の種類が物販・デジタル・定期便・電子チケットで、伴走の役務の種類がない。デジタル商品の形式に Excel の記載がない（要約、https://faq.stores.jp/hc/ja/articles/28161370516377）",
    "ストアカ": "リアルタイムの講座が必須で、カウンセリング・診断・コンサルが主の講座は不可（要約、https://support.street-academy.com/hc/ja/articles/200700659）",
    "Peatix": "イベントのチケット販売の仕組み（要約）",
}

PLATFORMS: dict[str, Platform] = {p.key: p for p in (COCONALA, NOTE, MENTA, TIMETICKET, OWN_SITE)}
