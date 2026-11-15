"""自分のサイト用の静的なページ（サーバー不要。GitHub Pages・Netlify などにそのまま置ける）。

  python -m n1engine.run site --config site.json --out 公開用フォルダ

作るもの
  index.html     サービスの紹介（入口・本番）、流れ、対象外の条件、よくある質問、申し込みボタン
  law.html       特定商取引法に基づく表示（書いていない項目は「【要記入】」のまま残り、作成時に警告する）
  privacy.html   記録の扱い（プライバシーポリシー）
文章は content.py と同じ元から作る（販売先ごとに食い違わない）。申し込みは決済サービスの支払いリンク
（Stripe Payment Links など）を config に書く。記録の受け渡しはメールの添付（Excel）。
"""

from __future__ import annotations

import html
import json
import pathlib

from .content import EXCLUSIONS, PRODUCTS
from .profiles import PLATFORMS
from .render import BANNED, fill

REQUIRED = {  # 特定商取引法の表示（通信販売）で書くもの。消費者庁の通信販売の広告の表示事項に沿う
    "seller": "販売事業者の名前",
    "representative": "運営責任者",
    "address": "住所（請求があれば遅滞なく開示すると書いて省略する場合は、その旨）",
    "phone": "電話番号（同上）",
    "email": "メールアドレス",
    "price_note": "販売価格（各サービスのページに表示）と、価格以外に必要な費用",
    "payment": "支払い方法・支払いの時期",
    "delivery": "役務の提供時期",
    "cancel": "申し込みの撤回・解約の条件（役務の性質上の扱いを含む）",
}

EXAMPLE_CONFIG = {
    "site_name": "1人実験の伴走",
    "seller": "【要記入】",
    "representative": "【要記入】",
    "address": "請求があれば遅滞なく開示します",
    "phone": "請求があれば遅滞なく開示します",
    "email": "【要記入】",
    "price_note": "各サービスに表示した価格（税込）。インターネット接続の通信料はお客さまのご負担です",
    "payment": "クレジットカード（決済サービスの支払いページ）。お申し込みの時点でお支払いが確定します",
    "delivery": "お支払いの確認後、2営業日以内にメールでご連絡し、記録用ファイルをお送りします。レポートは各サービスに記載の日数でお送りします",
    "cancel": "記録用ファイルをお送りする前は全額返金します。お送りした後は、役務の性質上、返金いたしません。成分が7日ずつの入れ替えに向かないと分かった場合は全額返金します",
    "pay_links": {"entry": "【要記入：支払いリンク】", "main": "【要記入：支払いリンク】"},
}

CSS = """
:root{color-scheme:light;--bg:#f6f7f5;--surface:#fff;--ink:#141a17;--ink2:#4f5a55;--muted:#7d8984;--rule:#dfe5e2;--accent:#1d6b57;--accent-ink:#fff;--soft:#e2efe9}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])){color-scheme:dark;--bg:#0f1412;--surface:#171f1c;--ink:#e8efec;--ink2:#a9b8b1;--muted:#7b8a84;--rule:#2a3531;--accent:#4fb393;--accent-ink:#0b1411;--soft:#1b3129}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#0f1412;--surface:#171f1c;--ink:#e8efec;--ink2:#a9b8b1;--muted:#7b8a84;--rule:#2a3531;--accent:#4fb393;--accent-ink:#0b1411;--soft:#1b3129}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif;font-size:16px;line-height:1.8}
.wrap{max-width:760px;margin:0 auto;padding:0 16px}
header{background:var(--surface);border-bottom:1px solid var(--rule)}
header .wrap{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-block:14px;flex-wrap:wrap}
header a{color:var(--ink);text-decoration:none;font-weight:700}
nav a{font-weight:400;color:var(--ink2);margin-left:14px;font-size:14px}
.hero{padding:48px 0 24px}
.hero h1{font-size:clamp(24px,5vw,34px);line-height:1.4;margin:0 0 14px;text-wrap:balance}
.hero p{color:var(--ink2);margin:0}
.stance{display:grid;gap:10px;margin:24px 0 0;padding:0;list-style:none}
.stance li{background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:12px 16px}
section{padding:28px 0;border-top:1px solid var(--rule)}
h2{font-size:21px;margin:0 0 12px}
h3{font-size:17px;margin:18px 0 8px}
.card{background:var(--surface);border:1px solid var(--rule);border-radius:12px;padding:20px;margin:14px 0}
.price{font-size:22px;font-weight:700;margin:6px 0}
.meta{color:var(--muted);font-size:14px}
.btn{display:inline-block;background:var(--accent);color:var(--accent-ink);text-decoration:none;font-weight:700;border-radius:8px;padding:12px 22px;margin-top:10px}
.btn[aria-disabled="true"]{opacity:.5;pointer-events:none}
ol,ul{padding-left:1.3em}
li{margin:4px 0}
dl.faq dt{font-weight:700;margin-top:14px}
dl.faq dd{margin:4px 0 0}
table{border-collapse:collapse;width:100%;font-size:15px}
th,td{border-bottom:1px solid var(--rule);text-align:left;vertical-align:top;padding:10px 8px}
th{width:34%;color:var(--ink2);font-weight:600}
.todo{color:#b03a2e;font-weight:700}
footer{color:var(--muted);font-size:13px;padding:32px 0 48px}
footer a{color:var(--ink2);margin-right:14px}
"""


def _page(cfg: dict, title: str, body: str) -> str:
    name = html.escape(cfg.get("site_name", "1人実験の伴走"))
    return (
        "<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        f"<title>{html.escape(title)}｜{name}</title><style>{CSS}</style></head><body>"
        f"<header><div class=\"wrap\"><a href=\"index.html\">{name}</a><nav><a href=\"index.html#services\">サービス</a><a href=\"index.html#faq\">よくある質問</a></nav></div></header>"
        f"<main class=\"wrap\">{body}</main>"
        f"<footer class=\"wrap\"><a href=\"law.html\">特定商取引法に基づく表示</a><a href=\"privacy.html\">記録の扱い（プライバシーポリシー）</a><div>このサービスは成分や商品をおすすめするものではなく、体調の理由を診断するものでもありません。</div></footer>"
        "</body></html>"
    )


def _esc_todo(v: str) -> str:
    s = html.escape(str(v))
    return s.replace("【要記入", "<span class=\"todo\">【要記入").replace("】", "】</span>") if "【要記入" in s else s


def index_html(cfg: dict) -> str:
    p = PLATFORMS["own_site"]
    main, entry = PRODUCTS["main"], PRODUCTS["entry"]
    stance = next(s for s in main.sections if s.head == "このサービスの立場")
    why = next(s for s in main.sections if s.head == "なぜ実験の形にするのか")
    B = [f"<div class=\"hero\"><h1>{html.escape(main.title)}</h1><p>{html.escape(fill(main.lead, p))}</p>",
         "<ul class=\"stance\">" + "".join(f"<li>{html.escape(fill(x, p))}</li>" for x in stance.items) + "</ul></div>"]
    B.append("<section><h2>なぜ実験の形にするのか</h2>" + "".join(f"<p>{html.escape(fill(x, p))}</p>" for x in why.paras) + "</section>")
    B.append("<section id=\"services\"><h2>サービス</h2>")
    for prod in (entry, main):
        link = cfg.get("pay_links", {}).get(prod.key, "")
        ok = link.startswith("https://")
        B.append(f"<div class=\"card\" id=\"{prod.key}\"><h3>{html.escape(prod.title)}</h3>")
        B.append(f"<div class=\"price\">{prod.price:,}円</div><div class=\"meta\">{html.escape(fill(prod.price_note, p))} お届け：{html.escape(prod.delivery)}</div>")
        for s in prod.sections:
            if s.head in ("このサービスの立場", "なぜ実験の形にするのか"):
                continue
            B.append(f"<h3>{html.escape(s.head)}</h3>")
            if s.items and s.paras:
                B.append(f"<p>{html.escape(fill(s.paras[0], p))}</p>")
            elif s.paras:
                B += [f"<p>{html.escape(fill(x, p))}</p>" for x in s.paras]
            if s.items:
                tag = "ol" if s.numbered else "ul"
                B.append(f"<{tag}>" + "".join(f"<li>{html.escape(fill(x, p))}</li>" for x in s.items) + f"</{tag}>")
            if s.items and len(s.paras) > 1:
                B += [f"<p>{html.escape(fill(x, p))}</p>" for x in s.paras[1:]]
        href = html.escape(link) if ok else "#"
        dis = "" if ok else ' aria-disabled="true"'
        B.append(f'<a class="btn" href="{href}"{dis}>申し込む（{prod.price:,}円）</a></div>')
    B.append("</section>")
    B.append("<section><h2>お申し込みの前にご確認ください</h2><p>次のどれかに当てはまる方は、この実験を行わないでください。どれに当てはまるかを教えていただく必要はありません。</p><ul>"
             + "".join(f"<li>{html.escape(x)}</li>" for x in EXCLUSIONS) + "</ul></section>")
    faq = {q: a for prod in (entry, main) for q, a in prod.faq}
    B.append("<section id=\"faq\"><h2>よくある質問</h2><dl class=\"faq\">" + "".join(f"<dt>{html.escape(fill(q, p))}</dt><dd>{html.escape(fill(a, p))}</dd>" for q, a in faq.items()) + "</dl></section>")
    return _page(cfg, "1人実験の伴走", "".join(B))


def law_html(cfg: dict) -> str:
    rows = "".join(f"<tr><th>{html.escape(label)}</th><td>{_esc_todo(cfg.get(k, '【要記入】'))}</td></tr>" for k, label in REQUIRED.items())
    prices = "".join(f"<tr><th>{html.escape(p.short)}</th><td>{p.price:,}円（税込）</td></tr>" for p in PRODUCTS.values())
    return _page(cfg, "特定商取引法に基づく表示", f"<section><h2>特定商取引法に基づく表示</h2><table>{rows}{prices}</table></section>")


def privacy_html(cfg: dict) -> str:
    items = [
        "お預かりするもの：お名前（お申し込み時のもの）、メールアドレス、毎日の記録（睡眠・気分・飲んだ時刻などの記録用ファイル）",
        "使う目的：お申し込みのサービスの提供（記録の確認、レポートの作成、ご連絡）だけに使います",
        "お預かりしないもの：病名、通院の有無、飲んでいる薬の名前。記録用ファイルにも書かないでください",
        "分析の方法：統計の分析プログラムとAIの補助でレポートの下書きを作り、担当者が確認します",
        "保存の期間：レポートの納品の90日後に削除します。それより早い削除のご希望にも応じます",
        "第三者への提供：法令に基づく場合を除き、ご本人の同意なく第三者に提供しません",
        "集計への利用：使ってよいとお返事いただいた場合だけ、個人が分からない形に加工した集計（推定値など）を、分析方法の見直しに使います。記録そのものは使いません",
        f"お問い合わせ：{cfg.get('email', '【要記入】')}",
    ]
    return _page(cfg, "記録の扱い", "<section><h2>記録の扱い（プライバシーポリシー）</h2><ul>" + "".join(f"<li>{_esc_todo(x)}</li>" for x in items) + "</ul></section>")


def build(cfg: dict, out: str) -> list[str]:
    """ページを書き出し、記入が残っている項目の一覧を返す。"""
    root = pathlib.Path(out)
    root.mkdir(parents=True, exist_ok=True)
    pages = {"index.html": index_html(cfg), "law.html": law_html(cfg), "privacy.html": privacy_html(cfg)}
    for name, text in pages.items():
        for w in BANNED:
            if w in re_strip(text):
                raise ValueError(f"{name} に使わない言葉「{w}」があります")
        (root / name).write_text(text, encoding="utf-8")
    todo = [k for k in list(REQUIRED) + ["pay_links"] if "【要記入" in json.dumps(cfg.get(k, "【要記入】"), ensure_ascii=False)]
    return todo


def re_strip(page: str) -> str:
    import re

    return re.sub(r"<[^>]+>", "", page)
