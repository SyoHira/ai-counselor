"""販売先ごとに、出品文・定型文・料金の表を組み立て、決まりに合うかを確かめる。

  python -m n1engine.run sales --out ../sales          全販売先の文面を書き出す（sales/<販売先>/）
  python -m n1engine.run sales --platform note         1つだけ表示
  python -m n1engine.run pricing --target 50000        販売先ごとの手取りと、目標に必要な件数
"""

from __future__ import annotations

import math
import pathlib
import re

from .content import EXCLUSIONS, MESSAGES, PRODUCTS, Product
from .profiles import PLATFORMS, Platform

# お客さんの目に触れる文章で使わない言葉（薬機法・景表法・各販売先の禁止表現を避ける）
BANNED = ("効果", "効く", "効き", "効能", "効力", "改善", "治る", "治す", "治療", "必ず", "絶対", "確実", "予防", "痩せ")
URL = re.compile(r"https?://|www\.", re.I)
EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")


def fill(text: str, p: Platform) -> str:
    return (text.replace("{msg}", p.msg_place).replace("{send}", p.send).replace("{buy}", p.buy)
            .replace("{approve}", p.approve))


def _price(prod: Product, p: Platform) -> str:
    note = fill(prod.price_note, p)
    return f"{prod.price:,}円{note}"


def title_for(prod: Product, p: Platform) -> str:
    t = prod.title
    if p.title_max and len(t) > p.title_max:
        t = prod.short
    return t


def listing(p: Platform, prod: Product) -> str:
    md = p.markup == "markdown"
    h = (lambda s: f"### {s}") if md else (lambda s: f"【{s}】")
    L = []
    if md:
        L += [f"# {title_for(prod, p)}", ""]
    else:
        L += [f"タイトル：{title_for(prod, p)}", ""]
    L += [f"価格：{_price(prod, p)}　／　お届け：{prod.delivery}", "", fill(prod.lead, p), ""]
    for s in prod.sections:
        L.append(h(s.head))
        L.append("")
        for para in s.paras:
            L += [fill(para, p), ""]
        for i, it in enumerate(s.items, 1):
            L.append(f"{i}. {fill(it, p)}" if s.numbered else (f"- {fill(it, p)}" if md else f"・{fill(it, p)}"))
        if s.items:
            L.append("")
        for para in s.after:
            L += [fill(para, p), ""]
    L += [h(f"{p.buy}前にご確認ください（当てはまる場合は{p.buy}いただけません）"), "",
          "次のどれかに当てはまる方は、この実験を行わないでください。どれに当てはまるかを教えていただく必要はありません。", ""]
    L += [(f"- {x}" if md else f"・{x}") for x in EXCLUSIONS] + [""]
    L += [h("よくある質問"), ""]
    for q, a in prod.faq:
        L += [f"Q. {fill(q, p)}", f"A. {fill(a, p)}", ""]
    if p.listing_footer:
        L += [fill(p.listing_footer, p), ""]
    return "\n".join(L).rstrip() + "\n"


def messages(p: Platform) -> str:
    L = [f"# {p.name}の定型文（{p.msg_place}）", "", "〇〇は書き換える。" + p.message_rule, ""]
    for head, body in MESSAGES:
        L += [f"## {fill(head, p)}", "", fill(body, p), ""]
    return "\n".join(L).rstrip() + "\n"


def validate(p: Platform, text: str, title: str | None = None) -> list[str]:
    """出品文・定型文が、言葉の決まりと販売先の決まりに合うか。"""
    bad = []
    for n, line in enumerate(text.splitlines(), 1):
        for w in BANNED:
            if w in line:
                bad.append(f"{n}行目：「{w}」")
        if not p.external_links and URL.search(line):
            bad.append(f"{n}行目：外部のURL（{p.name}では外部への誘導が禁止）")
        if not p.contact_exchange and EMAIL.search(line):
            bad.append(f"{n}行目：メールアドレス（{p.name}では外部の連絡先の交換が禁止）")
    if title is not None and p.title_max and len(title) > p.title_max:
        bad.append(f"タイトルが{len(title)}文字（上限{p.title_max}文字）")
    if p.body_max and len(text) > p.body_max:
        bad.append(f"本文が{len(text)}文字（上限{p.body_max}文字）")
    return bad


LABEL = {"entry": "入口", "standard": "標準", "premium": "上級", "partner": "伴走者向け（1件）"}


def take_home(p: Platform, price: int) -> int:
    return int(round(price * (1 - p.fee_rate) - p.fee_fixed))


def pricing(target: int = 50000) -> str:
    L = [f"# 販売先ごとの手取りと、月{target:,}円に必要な件数", "",
         "手数料は profiles.py の値（出典と確認日はそこに書いてある）。振込手数料・消費税の扱いは含めていない。", "",
         "| 販売先 | 手数料 | " + " | ".join(f"{LABEL.get(pr.key, pr.key)} {pr.price:,}円の手取り" for pr in PRODUCTS.values()) + " | 標準だけで月の目標に必要な件数 | 買い手の支払い（標準） | 売上が入る時期 |",
         "|---|---|" + "---|" * len(PRODUCTS) + "---|---|---|"]
    main = PRODUCTS["standard"]
    for p in PLATFORMS.values():
        fee = f"{p.fee_rate * 100:g}%" + (f"＋{p.fee_fixed:g}円" if p.fee_fixed else "")
        th = [f"{take_home(p, pr.price):,}円" for pr in PRODUCTS.values()]
        need = math.ceil(target / max(take_home(p, main.price), 1))
        buyer = f"{int(round(main.price * (1 + p.buyer_fee_rate))):,}円"
        L.append(f"| {p.name} | {fee} | " + " | ".join(th) + f" | {need}件 | {buyer} | {p.payout} |")
    from .profiles import NOT_SUITABLE

    L += ["", "## 調べたうえで使わない販売先", ""] + [f"- {k}：{v}" for k, v in NOT_SUITABLE.items()]
    return "\n".join(L) + "\n"


def platform_guide() -> str:
    """販売先ごとの、出品前に確かめること・ファイルの受け渡し・出典（sales/README.md）。"""
    L = ["# 販売先ごとの準備", "",
         "`python -m n1engine.run sales --out ../sales` で作った一覧。直すときは engine/n1engine/channels/profiles.py を直して作り直す。",
         "「要約」は検索エンジンが公式ページから抜き出した要約で確かめた値（原文は未読）。出品前に原文を読む。", "",
         "販売先ごとの文面は `<販売先>/listing-entry.md`（入口）・`listing-main.md`（本番）・`messages.md`（定型文）。手取りの比較は [pricing.md](pricing.md)。", ""]
    for p in PLATFORMS.values():
        L += [f"## {p.name}", "",
              f"- やり取りの場所：{p.msg_place}",
              f"- ファイルの受け渡し：{p.files}",
              f"- 出品文・メッセージの外部URL：{'書ける' if p.external_links else '書かない（禁止）'}／外部の連絡先：{'交換できる' if p.contact_exchange else '書かない（禁止）'}",
              f"- 売上が入る時期：{p.payout}", "", "出品前に確かめること", ""]
        L += [f"- [ ] {x}" for x in p.checklist] + ["", "出典", ""]
        L += [f"- {what}（{when}、{how}）：{url}" for what, url, when, how in p.sources] + [""]
    return "\n".join(L).rstrip() + "\n"


def export_all(out: str) -> list[str]:
    """全販売先の文面を out/<販売先>/ に書き出す。決まりに合わないものがあれば例外にする。"""
    root = pathlib.Path(out)
    written, problems = [], []
    for p in PLATFORMS.values():
        d = root / p.key
        d.mkdir(parents=True, exist_ok=True)
        for prod in PRODUCTS.values():
            text = listing(p, prod)
            problems += [f"{p.key}/{prod.key}: {x}" for x in validate(p, text, title_for(prod, p))]
            f = d / f"listing-{prod.key}.md"
            f.write_text(_header(p) + text, encoding="utf-8")
            written.append(str(f))
        m = messages(p)
        problems += [f"{p.key}/messages: {x}" for x in validate(p, m)]
        f = d / "messages.md"
        f.write_text(m, encoding="utf-8")
        written.append(str(f))
    for name, text in (("pricing.md", pricing()), ("README.md", platform_guide())):
        f = root / name
        f.write_text(text, encoding="utf-8")
        written.append(str(f))
    if problems:
        raise ValueError("決まりに合わない文面があります：\n" + "\n".join(problems))
    return written


def _header(p: Platform) -> str:
    """生成した文面の先頭に付ける、担当者向けの注意（> で始まる行。お客さんには出さない）。"""
    lines = [f"> {p.name}向けに `python -m n1engine.run sales` で作った文面。直すときは engine/n1engine/channels/content.py か profiles.py を直して作り直す（ここを直接直さない）。"]
    lines += [f"> {x}" for x in p.checklist]
    return "\n".join(lines) + "\n\n"
