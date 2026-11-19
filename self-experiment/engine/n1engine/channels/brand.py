"""アカウント設計とプロフィール文（販売先・SNSごと）。1つの元から作り、字数と決まりを確かめる。

アカウントの役割（設計）
  ココナラ   売る場所。購入前相談を入口にする。外部URL・メールアドレス・QRは書かない（禁止の要約）
  note       見せる・読ませる場所。自分の実験の記録と方法の長い解説。メンバーシップ（月額）の受け皿
  X          見つけてもらう場所。短い記録と図。プロフィールのリンクで note へ
  Instagram  後回し。字数・比率の公式値を確認できておらず、まず X と note で測る
  自分のサイト  実績と表示の準備がそろってから（run site）

名前はすべて同じ（呼び名・アイコン・色）にして、どこから来ても同じ人と分かるようにする。
資格・経歴は、事実のままを config に書く。書かなければ【要記入】が残り、公開前に警告する。
実績の数字（件数・評価・お客様の声）は、実際に得てから書く。今は「実績はまだありません」と書く。
"""

from __future__ import annotations

from dataclasses import dataclass

from .render import BANNED, EMAIL, URL

BRAND = "1人実験ノート"
TAGLINE = "サプリに払い続ける根拠を、あなたの記録で確かめる"
ICON_TEXT = "n=1"  # N-of-1（1人を対象にした実験）の記号。アイコンとヘッダーに使う


@dataclass(frozen=True)
class Limit:
    value: int
    how: str  # 公式（要約）／ブログ（公式未確認）／確認できなかった
    source: str


# 字数の上限。確認の程度を残す（2026-11-17、検索結果の要約。原文は未読）
LIMITS = {
    "x_name": Limit(50, "公式（要約）", "https://help.x.com/en/managing-your-account/how-to-customize-your-profile"),
    "x_bio": Limit(160, "公式（要約）", "https://help.x.com/en/managing-your-account/how-to-customize-your-profile"),
    "x_post_weighted": Limit(280, "公式（要約）：全角は2として数える", "https://docs.x.com/fundamentals/counting-characters"),
    "ig_bio": Limit(150, "公式（要約）", "https://help.instagram.com/728994388226960/"),
    "note_bio": Limit(140, "ブログ（公式未確認）", "公式の記載は確認できなかった"),
    "coconala_profile": Limit(1000, "仮（ブログは約1300字。公式未確認のため少なめに）", "公式の記載は確認できなかった"),
}

# 画像の寸法（幅, 高さ）。確認の程度を残す
SIZES = {
    "x_header": ((1500, 500), "公式（要約）"),
    "x_icon": ((400, 400), "公式（要約）"),
    "note_header": ((1280, 670), "公式（要約）"),
    "note_article": ((1280, 670), "公式（要約）"),
    "note_icon": ((330, 330), "公式（要約）"),
    "coconala_thumb": ((1220, 1240), "ブログ（公式未確認。出品画面で実測する）"),
    "post_image": ((1200, 675), "仮（16:9。公式の推奨比率は確認できなかった）"),
}


def x_weight(text: str) -> int:
    """X のポストの字数（全角・かなは2、半角は1。URL は使わない前提）。"""
    w = 0
    for ch in text:
        o = ord(ch)
        wide = (0x1100 <= o <= 0x11FF or 0x2E80 <= o <= 0xA4CF or 0xAC00 <= o <= 0xD7AF or 0xF900 <= o <= 0xFAFF
                or 0xFE30 <= o <= 0xFE6F or 0xFF00 <= o <= 0xFF60 or 0xFFE0 <= o <= 0xFFE6 or 0x3000 <= o <= 0x303F)
        w += 2 if wide else 1
    return w


EXAMPLE_CONFIG = {
    "call_name": "【要記入：運営者の呼び名】",
    "credentials": "【要記入：資格・経歴を事実のとおりに。無ければ「医療の資格はありません。診断や指導はしません」】",
    "background": "【要記入：このサービスを始めた理由を1〜2文、事実のとおりに】",
    "coconala_name": "【要記入：ココナラの表示名（できれば「" + BRAND + "」）】",
}


def _cfg(cfg: dict | None) -> dict:
    out = dict(EXAMPLE_CONFIG)
    out.update(cfg or {})
    return out


def texts(cfg: dict | None = None) -> dict[str, str]:
    c = _cfg(cfg)
    cred = c["credentials"]
    x_bio = (f"サプリに払い続ける根拠を、あなたの記録で確かめる1人実験。成分は勧めず、成分の働きも語りません。"
             f"自分の実験の記録と、方法の解説を投稿します。依頼はプロフィールのリンクから。{cred}")
    ig_bio = f"サプリに払い続ける根拠を、あなたの記録で確かめる1人実験。成分は勧めず、成分の働きも語りません。{cred}"
    note_bio = (f"{c['call_name']}。サプリを続けるか決める材料を、1人実験で作っています。"
                f"自分の実験の記録と方法を書きます。{cred}")
    coconala = f"""{c['call_name']}です。{BRAND}という名前で、サプリを飲んでいる方の記録を分析しています。

【やっていること】
毎月お金を払って飲み続けているサプリが、あなたの記録の上で差を出しているか。飲む期間と飲まない期間を入れ替えて記録していただき、統計で確かめて、続けるか・やめるかを決める材料をお出しします。

【やらないこと】
成分や商品はおすすめしません。成分の働きについては語りません。病気の診断はしません。差が見つからなかったときは、見つからなかったことをそのままお伝えします（差が無いとは言い切りません）。

【自分について】
{c['credentials']}
{c['background']}

【進め方】
1. 購入前に、トークルームの購入前相談で、試したいものを教えてください
2. 記録用のExcelをお送りします。日付と「今日すること」が入っています
3. 毎週日曜の夜に、ファイルをトークルームに添付してください
4. 終わったら5日以内にレポート（PDF）をお送りします

【対象外の方】
薬を飲んでいる・通院中・妊娠中・授乳中・18歳未満の方、医薬品の成分や指定成分（コレウス・フォルスコリー、ドオウレン、プエラリア・ミリフィカ、ブラックコホシュ）を含むものを試したい方。どれに当てはまるかを教えていただく必要はありません。

【大切にしていること】
・「あなたの記録で出た差」だけをお伝えします
・分析はAIの補助と統計のプログラムで行い、担当者が確認します
・お預かりした記録は、レポートのためだけに使い、納品の90日後に削除します

【実績】
まだありません。最初の10件はモニター価格でお受けします。"""
    pinned = (f"はじめまして。{BRAND}です。\n"
              "サプリを飲み続けているけれど、本当に違いがあるのか分からない。そんな方の記録を、統計で確かめています。\n"
              "・成分は勧めません\n・成分の働きは語りません\n・差が見つからなかったことも、そのままお伝えします")
    return {"x_name": f"{BRAND}｜サプリの記録を統計で確かめる", "x_bio": x_bio, "ig_bio": ig_bio, "note_bio": note_bio,
            "coconala_profile": coconala, "x_pinned": pinned}


def validate(t: dict[str, str]) -> list[str]:
    bad = []
    for k, text in t.items():
        for w in BANNED:
            if w in text:
                bad.append(f"{k}：「{w}」")
        if URL.search(text) or EMAIL.search(text):
            bad.append(f"{k}：URL またはメールアドレス（ココナラでは禁止、SNS のプロフィールにも書かない方針）")
    for key, lim in LIMITS.items():
        if key == "x_post_weighted" or key not in t:
            continue
        if len(t[key]) > lim.value:
            bad.append(f"{key}：{len(t[key])}字（上限 {lim.value}字）")
    if x_weight(t["x_pinned"]) > LIMITS["x_post_weighted"].value:
        bad.append(f"x_pinned：{x_weight(t['x_pinned'])}（上限 {LIMITS['x_post_weighted'].value}）")
    return bad


def unfilled(t: dict[str, str]) -> list[str]:
    return [k for k, v in t.items() if "【要記入" in v]


def render_md(cfg: dict | None = None) -> str:
    t = texts(cfg)
    L = [f"# プロフィール文（{BRAND}）", "",
         "> `python -m n1engine.run brand --config brand.json --out ../sales/brand` で作った文面。直すときは engine/n1engine/channels/brand.py か config を直して作り直す。",
         "> 【要記入】が残っている間は公開しない。資格・経歴・実績は、事実のとおりに書く（書いていない資格を匂わせない、実績の数字は得てから書く）。", "",
         f"名前：**{BRAND}**　／　一言：{TAGLINE}　／　アイコン：「{ICON_TEXT}」（`brand/icon.png`）", ""]
    spec = [("X の表示名", "x_name"), ("X の自己紹介", "x_bio"), ("X の固定ポスト", "x_pinned"), ("Instagram の自己紹介（後回し）", "ig_bio"),
            ("note の自己紹介", "note_bio"), ("ココナラのプロフィール", "coconala_profile")]
    for head, k in spec:
        lim = LIMITS.get(k)
        n = x_weight(t[k]) if k == "x_pinned" else len(t[k])
        cap = LIMITS["x_post_weighted"] if k == "x_pinned" else lim
        meta = f"（{n} / {cap.value}字・{cap.how}）" if cap else f"（{n}字）"
        L += [f"## {head} {meta}", "", "```", t[k], "```", ""]
    L += ["## 画像の寸法", "", "| 画像 | 寸法 | 確認 |", "|---|---|---|"]
    L += [f"| {k} | {w}×{h} | {how} |" for k, ((w, h), how) in SIZES.items()]
    L += ["", "## 字数の上限の出典", ""] + [f"- {k}：{lim.value}（{lim.how}）{lim.source}" for k, lim in LIMITS.items()]
    return "\n".join(L).rstrip() + "\n"
