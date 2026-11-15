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

OWN_SITE = Platform(
    key="own_site",
    name="自分のサイト",
    msg_place="メール",
    send="メールに添付して送って",
    buy="お申し込み",
    approve="",
    monitor="（モニター価格）",
    fee_rate=0.036,  # 決済サービスの手数料。決済サービスを決めたら確かめて直す（checklist）
    payout="決済サービスの入金サイクルによる（未確認）",
    external_links=True,
    contact_exchange=True,
    files="メールの添付",
    markup="markdown",
    message_rule="",
    checklist=[
        "決済サービス（Stripe Payment Links など）の手数料・入金サイクル・審査で健康関連が制限されるかを確かめ、fee_rate と payout を直す（3.6% は未確認の仮の値）",
        "特定商取引法に基づく表示を埋める（run site で【要記入】が残ると警告が出る）。住所・電話番号を「請求があれば遅滞なく開示」で省略する場合は、実際に開示できる体制にする",
        "記録の扱い（プライバシーポリシー）を公開してから受け付ける",
    ],
    sources=[
        ("特定商取引法の表示（通信販売の広告）", "https://www.no-trouble.caa.go.jp/qa/advertising.html", "2026-10-16", "要約"),
    ],
)

PLATFORMS: dict[str, Platform] = {p.key: p for p in (COCONALA, OWN_SITE)}
