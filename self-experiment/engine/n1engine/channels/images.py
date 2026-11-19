"""販売・SNS 用の画像（PNG）。HTML を手元の Chrome / Chromium で撮って作る。

方針
  ・図は、リポジトリで確かめた数字か、「見本（架空の記録）」と画像に書いた例だけで作る。作った数字を実際の記録に見せない
  ・URL・メールアドレス・QR を入れない（ココナラの画像の禁止事項）。誘導は文字の「プロフィールのリンク」だけ
  ・「効く」などの言葉を使わない（文字はこのファイル内の文章だけ。テストで確認）
  ・色は dataviz の既定の配色（青 #2a78d6・橙 #eb6834、暗い面では #3987e5・#d95926）。図の文字は面に合う色の text token
  ・文字の書体は Zen Kaku Gothic New（Google Fonts）。読み込めない環境では IPAゴシック等の代わりの書体になる
"""

from __future__ import annotations

import html
import math
import os
import pathlib
import subprocess
import tempfile

from .brand import BRAND, ICON_TEXT, SIZES, TAGLINE
from ..report_html import find_chrome

E = html.escape
INK, PAPER, TEAL, TEAL_D = "#10201c", "#f3f6f4", "#4fb393", "#0f6e64"
BLUE, ORANGE = "#2a78d6", "#eb6834"
FONT = "'Zen Kaku Gothic New','Noto Sans JP','Hiragino Sans','IPAexGothic','IPAGothic','Yu Gothic',sans-serif"
MONO = "'IBM Plex Mono',ui-monospace,Menlo,monospace"

SAMPLE = "見本（架空の記録）"


def page(w: int, h: int, body: str, dark: bool = True) -> str:
    bg, fg, fg2, rule = (INK, "#eef4f1", "#a9bcb5", "#2b3a35") if dark else (PAPER, INK, "#4b5a54", "#d6dfdb")
    return f"""<!doctype html><html lang="ja"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Zen+Kaku+Gothic+New:wght@500;700;900&display=swap">
<style>
*{{box-sizing:border-box;margin:0}}
html,body{{width:{w}px;height:{h}px;overflow:hidden}}
body{{background:{bg};color:{fg};font-family:{FONT};line-height:1.5;-webkit-font-smoothing:antialiased}}
.c{{width:{w}px;height:{h}px;position:relative;padding:{int(h*0.075)}px {int(w*0.06)}px;display:flex;flex-direction:column;gap:{int(h*0.03)}px}}
.mono{{font-family:{MONO}}}
.c *{{line-break:strict;word-break:keep-all;overflow-wrap:anywhere}}
.sub{{color:{fg2}}}
.tag{{font-family:{MONO};font-size:{max(18, int(w*0.017))}px;letter-spacing:.06em;color:{TEAL if dark else TEAL_D}}}
.brand{{position:absolute;left:{int(w*0.06)}px;bottom:{int(h*0.05)}px;right:{int(w*0.06)}px;display:flex;justify-content:space-between;align-items:center;font-size:{max(18, int(w*0.018))}px;color:{fg2}}}
.brand b{{color:{fg};font-weight:700}}
.sample{{font-size:{max(16, int(w*0.016))}px;color:{fg2};border:1.5px solid {rule};border-radius:99px;padding:2px 14px;white-space:nowrap}}
svg text{{font-family:{FONT}}}
.c p,.c .bal{{text-wrap:balance}}
</style></head><body>{body}</body></html>"""


def brand_row(extra: str = "") -> str:
    return f'<div class="brand"><span><b>{BRAND}</b>　<span class="mono">{ICON_TEXT}</span></span><span>{extra}</span></div>'


def dots(n: int = 24, hi: int = 9, w: int = 600, r: int = 9, color: str = TEAL, dim: str = "#35463f") -> str:
    """n=1 の記号：たくさんの点のうち、1つだけ色が付く。"""
    gap = (w - 2 * r) / (n - 1)
    cs = "".join(f'<circle cx="{r + i * gap:.1f}" cy="{r}" r="{r}" fill="{color if i == hi else dim}"/>' for i in range(n))
    return f'<svg width="{w}" height="{2 * r}" viewBox="0 0 {w} {2 * r}">{cs}</svg>'


# ---------------------------------------------------------------- 図の部品（SVG）


def svg_bars(w, h, cats, series, colors, ymax, unit="%", ref=None, ref_label="", fg="#eef4f1", fg2="#a9bcb5", grid="#2b3a35", names=None):
    L, R, T, B = 70, 20, 30, 70
    n, k = len(cats), len(series)
    band = (w - L - R) / n
    bw = min(70, band / (k + 1))
    sy = lambda v: T + (1 - v / ymax) * (h - T - B)  # noqa: E731
    o = [f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}">']
    v = 0
    while v <= ymax:
        o.append(f'<line x1="{L}" x2="{w - R}" y1="{sy(v):.1f}" y2="{sy(v):.1f}" stroke="{grid}"/><text x="{L - 10}" y="{sy(v) + 6:.1f}" text-anchor="end" font-size="20" fill="{fg2}">{v:g}{unit}</text>')
        v += ymax / 4
    if ref is not None:
        o.append(f'<line x1="{L}" x2="{w - R}" y1="{sy(ref):.1f}" y2="{sy(ref):.1f}" stroke="{ORANGE}" stroke-width="2" stroke-dasharray="8 6"/><text x="{w - R}" y="{sy(ref) - 8:.1f}" text-anchor="end" font-size="20" fill="{ORANGE}" font-weight="700">{E(ref_label)}</text>')
    for i, c in enumerate(cats):
        x0 = L + band * i + (band - (k * bw + (k - 1) * 4)) / 2
        for j in range(k):
            val = series[j][i]
            x, y = x0 + j * (bw + 4), sy(val)
            o.append(f'<path d="M{x:.1f},{sy(0):.1f} V{y + 6:.1f} Q{x:.1f},{y:.1f} {x + 6:.1f},{y:.1f} H{x + bw - 6:.1f} Q{x + bw:.1f},{y:.1f} {x + bw:.1f},{y + 6:.1f} V{sy(0):.1f} Z" fill="{colors[j]}"/>')
            o.append(f'<text x="{x + bw / 2:.1f}" y="{y - 9:.1f}" text-anchor="middle" font-size="24" font-weight="700" fill="{fg}">{val:g}</text>')
        o.append(f'<text x="{L + band * i + band / 2:.1f}" y="{h - B + 30}" text-anchor="middle" font-size="21" fill="{fg}">{E(c)}</text>')
    o.append(f'<line x1="{L}" x2="{w - R}" y1="{sy(0):.1f}" y2="{sy(0):.1f}" stroke="{fg2}"/></svg>')
    return "".join(o)


def svg_interval(w, rows, xmin, xmax, zero_label="差なし", fg="#eef4f1", fg2="#a9bcb5", grid="#2b3a35", color=BLUE, left=240, rowh=86):
    """点＋90%の幅（横線）。rows=[(ラベル, 平均, 下, 上)]。"""
    h = 60 + rowh * len(rows) + 50
    sx = lambda v: left + (v - xmin) / (xmax - xmin) * (w - left - 40)  # noqa: E731
    o = [f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}">']
    t = math.ceil(xmin * 2) / 2
    while t <= xmax + 1e-9:
        o.append(f'<line x1="{sx(t):.1f}" x2="{sx(t):.1f}" y1="40" y2="{h - 50}" stroke="{grid}"/><text x="{sx(t):.1f}" y="{h - 20}" text-anchor="middle" font-size="20" fill="{fg2}">{t:+.1f}</text>')
        t += 0.5
    o.append(f'<line x1="{sx(0):.1f}" x2="{sx(0):.1f}" y1="30" y2="{h - 50}" stroke="{fg}" stroke-width="2.5"/><text x="{sx(0):.1f}" y="24" text-anchor="middle" font-size="21" fill="{fg}" font-weight="700">{E(zero_label)}</text>')
    for i, (lab, m, a, b) in enumerate(rows):
        y = 60 + rowh * i + rowh / 2
        o.append(f'<text x="{left - 20}" y="{y + 7:.1f}" text-anchor="end" font-size="25" fill="{fg}">{E(lab)}</text>')
        o.append(f'<line x1="{sx(a):.1f}" x2="{sx(b):.1f}" y1="{y:.1f}" y2="{y:.1f}" stroke="{color}" stroke-width="7" stroke-linecap="round"/>')
        o.append(f'<circle cx="{sx(m):.1f}" cy="{y:.1f}" r="13" fill="{color}" stroke="{INK}" stroke-width="4"/>')
        o.append(f'<text x="{sx(m):.1f}" y="{y - 24:.1f}" text-anchor="middle" font-size="22" fill="{fg2}" class="mono" stroke="{INK}" stroke-width="7" paint-order="stroke">{m:+.2f}（{a:+.2f}〜{b:+.2f}）</text>')
    o.append("</svg>")
    return "".join(o)


def svg_line(w, h, ys, color=BLUE, fg2="#a9bcb5", grid="#2b3a35", marks=None, ylabel="", bands=None):
    L, R, T, B = 60, 20, 20, 40
    lo, hi = min(ys), max(ys)
    pad = (hi - lo) * 0.15 or 1
    sy = lambda v: T + (1 - (v - (lo - pad)) / (hi - lo + 2 * pad)) * (h - T - B)  # noqa: E731
    sx = lambda i: L + i / (len(ys) - 1) * (w - L - R)  # noqa: E731
    o = [f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}">']
    for a, b, c in (bands or []):
        o.append(f'<rect x="{sx(a):.1f}" y="{T}" width="{sx(b) - sx(a):.1f}" height="{h - T - B}" fill="{c}" opacity=".16"/>')
    for g in range(0, 5):
        yy = T + g * (h - T - B) / 4
        o.append(f'<line x1="{L}" x2="{w - R}" y1="{yy:.1f}" y2="{yy:.1f}" stroke="{grid}"/>')
    pts = " ".join(f"{sx(i):.1f},{sy(v):.1f}" for i, v in enumerate(ys))
    o.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/>')
    for i, v in enumerate(ys):
        o.append(f'<circle cx="{sx(i):.1f}" cy="{sy(v):.1f}" r="6" fill="{color}" stroke="{INK}" stroke-width="2.5"/>')
    for i in (marks or []):
        o.append(f'<line x1="{sx(i):.1f}" x2="{sx(i + 1):.1f}" y1="{sy(ys[i]) - 26:.1f}" y2="{sy(ys[i + 1]) - 26:.1f}" stroke="{ORANGE}" stroke-width="3" marker-end="url(#a)"/>')
    o.append(f'<defs><marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="{ORANGE}"/></marker></defs>')
    o.append(f'<text x="{L - 10}" y="{T + 8}" text-anchor="end" font-size="19" fill="{fg2}">{E(ylabel)}</text>')
    o.append("</svg>")
    return "".join(o)


def headline(text: str, size: int = 62, accent: str | None = None) -> str:
    t = E(text)
    if accent and accent in text:
        t = t.replace(E(accent), f'<span style="color:{TEAL}">{E(accent)}</span>')
    return f'<div style="font-size:{size}px;font-weight:900;line-height:1.3;letter-spacing:.01em;text-wrap:balance">{t}</div>'


def lead(text: str, size: int = 30) -> str:
    return f'<div class="sub" style="font-size:{size}px;line-height:1.6;max-width:86%">{E(text)}</div>'


# ---------------------------------------------------------------- 各画像


def b_icon():
    return page(400, 400, f'<div style="width:400px;height:400px;display:grid;place-items:center;background:{TEAL_D}"><div class="mono" style="font-size:130px;font-weight:700;color:#fff;letter-spacing:-.02em">{ICON_TEXT}</div></div>', dark=True).replace("padding:30px 24px", "padding:0")


def b_x_header():
    return page(1500, 500, f'<div class="c" style="justify-content:center;gap:26px"><div class="tag">N-OF-1 ・ 1人を対象にした実験</div>{headline(TAGLINE, 56)}<div>{dots(28, 10, 700, 10)}</div></div>')


def b_note_header():
    return page(1280, 670, f'<div class="c" style="justify-content:center;gap:30px"><div class="tag">{BRAND}　{ICON_TEXT}</div>{headline(TAGLINE, 58)}{lead("成分は勧めません。成分の働きも語りません。あなたの記録で出た差と、その確からしさだけをお伝えします。", 27)}<div>{dots(26, 9, 640, 10)}</div></div>')


def b_intro_card():
    items = "".join(f'<div style="display:flex;gap:18px;align-items:center;font-size:36px;font-weight:700"><span style="color:{TEAL};font-family:{MONO}">—</span>{E(t)}</div>' for t in ("成分は勧めません", "成分の働きは語りません", "差が見つからなかったことも、そのままお伝えします"))
    return page(1200, 675, f'<div class="c"><div class="tag">{BRAND}　{ICON_TEXT}</div>{headline("サプリを続けるか決める前に、自分の記録で確かめる。", 52)}<div style="display:grid;gap:14px;margin-top:6px">{items}</div></div>')


def b_fig_compare():
    svg = svg_bars(1000, 340, ["引きずり 0.6", "体調がゆるく変化", "引きずり 0.8"], [[4.0, 4.5, 4.0], [12.5, 10.0, 16.5]], [TEAL, ORANGE], 20, ref=5, ref_label="目安 5%")
    leg = f'<div style="display:flex;gap:30px;font-size:24px"><span><i style="display:inline-block;width:18px;height:18px;border-radius:4px;background:{TEAL};margin-right:10px"></i>この分析</span><span><i style="display:inline-block;width:18px;height:18px;border-radius:4px;background:{ORANGE};margin-right:10px"></i>普通の比べ方（平均の差のt検定）</span></div>'
    return page(1200, 675, f'<div class="c" style="gap:12px"><div class="tag">差が無いのに「差がある」と言った割合</div>{headline("平均の比べ方は、体調の揺れに弱い", 44)}{leg}{svg}<div class="sub" style="font-size:20px">偽データ（差が無い記録）各200件の検証。出典：分析エンジンの検証記録</div></div>{brand_row()}')


def b_fig_power():
    svg = svg_bars(900, 340, ["引きずり 0.5", "引きずり 0.8"], [[43.5, 32.5]], [TEAL], 60)
    return page(1200, 675, f'<div class="c" style="gap:14px"><div class="tag">本当に1点の差があるとき</div>{headline("28日で「はっきり差がある」と言えた割合", 44)}{svg}<div class="sub" style="font-size:20px">偽データ（1点の差がある記録）各200件の検証。半分以上は「はっきりしない」になる</div></div>{brand_row()}')


def b_fig_melatonin():
    svg = svg_interval(1050, [("同じ日の夜", 0.07, -0.12, 0.26), ("前の夜", -0.11, -0.29, 0.07)], -0.5, 0.5, rowh=120)
    return page(1200, 675, f'<div class="c" style="gap:10px"><div class="tag">公開されている1人実験のデータ（メラトニン70日）</div>{headline("気分の評価の差：同じ日の夜は「はっきりしない」", 42)}{svg}<div class="sub" style="font-size:20px;line-height:1.6">点が推定した差（0〜10点）、横線が90%の幅。同じ日の夜は幅が「差なし」をまたぎ、判定は「はっきりしない」。前の夜は −0.11 で、判定は「悪い方向に差がありそう」（良かった確率14%）。この1人のこの期間の記録の話です。<br>データ：nof1kit（Miura Meng 医師、MIT ライセンス）</div></div>{brand_row()}')


def b_fig_decision():
    def box(title, big, small, hi=False):
        return (f'<div style="flex:1;min-width:0;background:{"#17302a" if hi else "#18261f"};border:2px solid {TEAL if hi else "#2b3a35"};border-radius:16px;padding:22px 18px;display:flex;flex-direction:column;gap:12px">'
                f'<div class="tag">{E(title)}</div><div style="font-size:31px;font-weight:900;line-height:1.35;white-space:nowrap">{big}</div><div class="sub" style="font-size:21px;line-height:1.6">{small}</div></div>')
    row = (box("① 月々の支払い", "月 3,000円<br>1年で 36,000円", "お申し込みのときに書いていただく額")
           + f'<div style="align-self:center;font-size:36px;color:{TEAL}">＋</div>'
           + box("② 記録の結果", "差は見つからなかった", "差があったとしても、90%の見込みで<br>1.2点以内")
           + f'<div style="align-self:center;font-size:36px;color:{TEAL}">＝</div>'
           + box("③ 判断の材料", "払い続ける根拠は<br>見つからなかった", "決めるのはあなた。勧めも、止めもしません", hi=True))
    return page(1200, 675, f'<div class="c" style="gap:22px"><div class="tag">レポートの「続けるか・やめるかの材料」</div>{headline("サプリ代と、記録の結果を並べます", 46)}<div style="display:flex;gap:14px;align-items:stretch;margin-top:6px">{row}</div></div>{brand_row(f"<span class=sample>{SAMPLE}</span>")}')


def b_card_jitter():
    ys = [5.2, 6.1, 6.8, 6.4, 5.5, 5.0, 5.6, 6.6, 7.0, 6.2, 5.3, 5.1, 5.8, 6.5]
    svg = svg_line(1000, 300, ys, marks=[1, 7], ylabel="点", bands=[(0, 5, BLUE)])
    return page(1200, 675, f'<div class="c" style="gap:16px"><div class="tag">体調は、前の日を引きずる</div>{headline("昨日の調子が、今日に残る", 50)}{svg}{lead("引きずりを無視して「飲んだ日」と「飲まない日」を比べると、差があるように見えやすくなります。", 26)}</div>{brand_row(f"<span class=sample>説明用の例（架空）</span>")}')


def b_card_gap():
    svg = svg_interval(1050, [("見つからなかった", 0.1, -0.9, 1.1)], -1.5, 1.5, left=270, rowh=160)
    return page(1200, 675, f'<div class="c" style="gap:12px"><div class="tag">見つからなかった ≠ 無い</div>{headline("差があったとしても、この範囲に収まる", 46)}{svg}{lead("幅が「差なし」をまたぐときは、小さな差があるかもしれません。レポートには、その幅をいつも添えます。", 25)}</div>{brand_row(f"<span class=sample>説明用の例（架空）</span>")}')


def b_card_caffeine():
    from ..domain.pk import ka_from_tmax

    th, tmax, dose = 5.0, 1.0, 15.0
    ke = math.log(2) / th
    ka = ka_from_tmax(tmax, th)
    def conc(t):
        tt = t - dose
        return 0.0 if tt <= 0 else ka / (ka - ke) * (math.exp(-ke * tt) - math.exp(-ka * tt))
    ts = [i / 4 for i in range(0, 4 * 31)]  # 0〜31時
    cs = [conc(t) for t in ts]
    peak = max(cs)
    W, H, L, R, T, B = 1000, 320, 60, 20, 20, 50
    sx = lambda t: L + t / 31 * (W - L - R)  # noqa: E731
    sy = lambda c: T + (1 - c / peak) * (H - T - B)  # noqa: E731
    pts = " ".join(f"{sx(t):.1f},{sy(c):.1f}" for t, c in zip(ts, cs))
    night_val = sum(conc(23 + i / 20) for i in range(0, 160)) / 160 / peak  # 23時〜翌7時の平均
    o = [f'<svg width="{W}" height="{H}" viewBox="0 0 {W} {H}">',
         f'<rect x="{sx(23):.1f}" y="{T}" width="{sx(31) - sx(23):.1f}" height="{H - T - B}" fill="{BLUE}" opacity=".18"/>',
         f'<polyline points="{pts}" fill="none" stroke="{TEAL}" stroke-width="5"/>',
         f'<line x1="{sx(dose):.1f}" x2="{sx(dose):.1f}" y1="{T}" y2="{H - B}" stroke="{ORANGE}" stroke-width="3" stroke-dasharray="8 6"/>',
         f'<text x="{sx(dose) - 10:.1f}" y="{T + 22}" text-anchor="end" font-size="22" fill="{ORANGE}" font-weight="700">15時に飲む</text>',
         f'<text x="{(sx(23) + sx(31)) / 2:.1f}" y="{T + 26}" text-anchor="middle" font-size="22" fill="#cfe0ff" font-weight="700">夜（23時〜翌7時）</text>',
         f'<line x1="{L}" x2="{W - R}" y1="{H - B}" y2="{H - B}" stroke="#a9bcb5"/>']
    for t in range(0, 32, 4):
        o.append(f'<text x="{sx(t):.1f}" y="{H - 16}" text-anchor="middle" font-size="19" fill="#a9bcb5">{t % 24}時</text>')
    o.append("</svg>")
    return page(1200, 675, f'<div class="c" style="gap:12px"><div class="tag">いつ飲むかで、夜の記録に入る量が変わる</div>{headline("カフェイン（半減期 約5時間）を15時に飲むと", 42)}{"".join(o)}{lead(f"夜の間（23時〜翌7時）の平均で、1日の最高時の約{night_val * 100:.0f}%が体に残る計算です（1コンパートメントの計算例）。", 25)}</div>{brand_row()}')


def _blocks(seq, w=1000, labels=("飲まない", "飲む")):
    n = len(seq)
    bw = (w - 8 * (n - 1)) / n
    fs = 30 if n <= 4 else 21
    o = [f'<svg width="{w}" height="150" viewBox="0 0 {w} 150">']
    for i, s in enumerate(seq):
        x = i * (bw + 8)
        col = ORANGE if s else "#35463f"
        o.append(f'<rect x="{x:.1f}" y="20" width="{bw:.1f}" height="80" rx="10" fill="{col}"/><text x="{x + bw / 2:.1f}" y="70" text-anchor="middle" font-size="{fs}" font-weight="700" fill="#fff">{labels[1] if s else labels[0]}</text><text x="{x + bw / 2:.1f}" y="130" text-anchor="middle" font-size="21" fill="#a9bcb5">7日</text>')
    o.append("</svg>")
    return "".join(o)


def b_card_abba():
    return page(1200, 675, f'<div class="c" style="gap:18px"><div class="tag">飲む期間と飲まない期間の並べ方</div>{headline("折り返して並べると、時間の流れと分けられる", 50)}<div style="margin:10px 0">{_blocks([0, 1, 1, 0])}</div>{lead("前半だけ飲む並びだと、季節や生活の変化と区別できません。7日ずつにするのは、曜日をそろえるためです。", 30)}</div>{brand_row()}')


def b_card_vitd():
    W = 1000
    items = [("カフェイン", 5.0, "約5時間"), ("7日の入れ替え", 168.0, "7日"), ("ビタミンD", 420.0, "2〜3週間")]
    sx = lambda h: 220 + (math.log10(h) - math.log10(2)) / (math.log10(600) - math.log10(2)) * (W - 400)  # noqa: E731
    o = [f'<svg width="{W}" height="330" viewBox="0 0 {W} 330">']
    for i, (lab, hrs, txt) in enumerate(items):
        y = 30 + i * 100
        col = TEAL if i == 0 else ORANGE if i == 2 else BLUE
        o.append(f'<text x="200" y="{y + 28}" text-anchor="end" font-size="26" fill="#eef4f1">{E(lab)}</text><rect x="220" y="{y}" width="{sx(hrs) - 220:.1f}" height="40" rx="8" fill="{col}"/><text x="{sx(hrs) + 14:.1f}" y="{y + 29}" font-size="26" font-weight="700" fill="#eef4f1">{E(txt)}</text>')
    o.append('<text x="220" y="325" font-size="19" fill="#a9bcb5">（横軸は対数。体内の量が半分になるまでの時間）</text></svg>')
    return page(1200, 675, f'<div class="c" style="gap:14px"><div class="tag">この形の実験で調べられない成分</div>{headline("半分になるまで2〜3週間の成分は、7日ずつでは入れ替わらない", 40)}{"".join(o)}{lead("お申し込みの前にお知らせして、お断りしています。", 25)}</div>{brand_row()}')


def b_card_cause():
    left = "".join(f'<div style="background:#18261f;border:2px solid #2b3a35;border-radius:12px;padding:12px 24px;font-size:32px;font-weight:700">{E(t)}</div>' for t in ("季節の変化", "仕事の忙しさ", "期待", "前日の疲れの持ち越し", "飲んだこと"))
    return page(1200, 675, f'<div class="c" style="gap:16px"><div class="tag">「飲み始めたら良くなった気がする」</div>{headline("同時に動くものを、分けて見る", 54)}<div style="display:flex;gap:30px;align-items:center"><div style="display:grid;gap:9px;flex:1.2">{left}</div><div style="font-size:70px;color:{TEAL}">→</div><div style="flex:1;font-size:48px;font-weight:900;line-height:1.4;border:2px solid {TEAL};border-radius:16px;padding:24px;text-align:center">あなたの<br>記録</div></div></div>{brand_row()}')


def b_card_combo():
    cells = [("どちらも飲まない", False, False), ("Aだけ", True, False), ("Bだけ", False, True), ("両方", True, True)]
    box = "".join(f'<div style="background:{"#17302a" if a and b else "#18261f"};border:2px solid {TEAL if a and b else "#2b3a35"};border-radius:14px;padding:22px;font-size:34px;font-weight:700;text-align:center">{t}<div class="sub" style="font-size:22px;font-weight:500;margin-top:6px">7日 × 2回</div></div>' for t, a, b in cells)
    return page(1200, 675, f'<div class="c" style="gap:16px"><div class="tag">2つのサプリを比べる56日</div>{headline("単独の差と、両方飲んだときの上乗せに分ける", 44)}<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">{box}</div>{lead("上乗せは見つけにくい項目です。本当に+2点の上乗せがあっても、見つけられたのは約3回に2回（偽データでの検証）。", 23)}</div>{brand_row()}')


def b_card_stance():
    cols = [("勧めない", "成分も商品も、提案しません。すでに飲んでいるものを確かめるだけです。"), ("働きを語らない", "言うのは「あなたの記録で出た差」と、その確からしさだけです。"), ("そのまま伝える", "差が見つからなかったことも、結果としてそのままお伝えします。")]
    box = "".join(f'<div style="flex:1;background:#18261f;border:2px solid #2b3a35;border-radius:16px;padding:30px 24px"><div style="font-size:36px;font-weight:900;color:{TEAL};white-space:nowrap">{E(a)}</div><div style="font-size:25px;line-height:1.75;margin-top:16px" class="sub">{E(b)}</div></div>' for a, b in cols)
    return page(1200, 675, f'<div class="c" style="gap:22px"><div class="tag">{BRAND}の立場</div>{headline("勧めないのに、なぜ分析するのか", 54)}<div style="display:flex;gap:18px;flex:1;margin-bottom:60px">{box}</div></div>{brand_row()}')


def b_card_next():
    cols = [("期間を56日に", "記録を足して、小さな差まで見る"), ("中身を隠す", "本物と空のカプセルで、期待の影響を除く"), ("そのまま終える", "「見つからなかった」を材料にする")]
    box = "".join(f'<div style="flex:1;background:#18261f;border:2px solid #2b3a35;border-radius:16px;padding:32px 28px"><div class="mono" style="font-size:40px;color:{TEAL}">{i + 1}</div><div style="font-size:36px;font-weight:900;margin-top:8px;white-space:nowrap">{E(a)}</div><div style="font-size:26px;line-height:1.75;margin-top:14px" class="sub">{E(b)}</div></div>' for i, (a, b) in enumerate(cols))
    return page(1200, 675, f'<div class="c" style="gap:22px"><div class="tag">結果が「はっきりしない」だったとき</div>{headline("次にできることは3つ", 58)}<div style="display:flex;gap:18px;flex:1;margin-bottom:60px">{box}</div></div>{brand_row()}')


def _thumb(tagline, head, accent, fig, foot):
    return page(1220, 1240, f'<div class="c" style="justify-content:space-between;padding-top:90px;padding-bottom:130px"><div style="display:flex;flex-direction:column;gap:28px"><div class="tag">{BRAND}　{ICON_TEXT}</div>{headline(head, 92, accent)}<div style="font-size:34px;line-height:1.65" class="sub">{E(tagline)}</div></div><div>{fig}</div></div>{brand_row(foot)}', dark=False)


def _mini_decision():
    return (f'<div style="display:flex;gap:16px;align-items:stretch">'
            f'<div style="flex:1;border:3px solid #d6dfdb;border-radius:18px;padding:26px;background:#fff"><div class="tag">月々の支払い</div><div style="font-size:54px;font-weight:900;line-height:1.3">年 36,000円</div></div>'
            f'<div style="align-self:center;font-size:48px;color:{TEAL_D}">＋</div>'
            f'<div style="flex:1;border:3px solid {TEAL_D};border-radius:18px;padding:26px;background:#fff"><div class="tag">記録の結果</div><div style="font-size:54px;font-weight:900;line-height:1.3">28日の実験</div></div></div>'
            f'<div style="margin-top:22px">{_blocks([0, 1, 1, 0], 1000, ("", "")).replace("#35463f", "#c9d4cf").replace(chr(60) + "text", chr(60) + "text")}</div>'
            f'<div style="margin-top:10px;font-size:24px;color:#4b5a54">例：月3,000円の場合　<span class="sample" style="border-color:#d6dfdb">{SAMPLE}</span></div>')


def b_thumb_entry():
    ys = [5.0, 6.2, 5.4, 6.8, 5.1, 4.6, 6.0]
    fig = svg_line(1000, 440, ys, fg2="#4b5a54", grid="#d6dfdb", ylabel="点").replace(f'stroke="{INK}"', 'stroke="#fff"')
    return _thumb("普段どおりの7日間の記録から、あなたの体調の揺れ方と、実験に必要な日数の見込みを出します。", "体調の揺れ方を、7日で測る", "7日", fig + f'<div style="margin-top:8px"><span class="sample" style="border-color:#d6dfdb;color:#4b5a54">{SAMPLE}</span></div>', "入口")


def b_thumb_standard():
    return _thumb("飲む期間と飲まない期間を入れ替えて28日間記録。月々の支払いと記録の結果を並べて、決める材料をお出しします。", "払い続ける根拠は、記録にありますか？", "記録", _mini_decision(), "標準 28日")


def b_thumb_premium():
    fig = _blocks([0, 1, 0, 1, 1, 0, 1, 0], 1000).replace("#35463f", "#c9d4cf").replace('fill="#a9bcb5"', 'fill="#4b5a54"')
    cells = "".join(f'<div style="flex:1;border:3px solid {TEAL_D if i == 3 else "#d6dfdb"};border-radius:16px;padding:18px 6px;background:#fff;font-size:25px;font-weight:700;text-align:center;white-space:nowrap">{t}</div>' for i, t in enumerate(("どちらも飲まない", "Aだけ", "Bだけ", "両方")))
    return _thumb("揺れが大きい方、2つのサプリを比べたい方、期待の影響を除きたい方のための56日の実験です。", "56日で、より確かに見る", "56日", fig + f'<div style="display:flex;gap:12px;margin-top:30px">{cells}</div><div style="margin-top:10px;font-size:24px;color:#4b5a54">2つを比べる場合の4つの条件（各7日×2回）</div>', "上級 56日")


def b_thumb_partner():
    steps = "".join(f'<div style="flex:1;border:3px solid #d6dfdb;border-radius:16px;padding:22px;background:#fff"><div class="mono" style="font-size:32px;color:{TEAL_D}">{i + 1}</div><div style="font-size:34px;font-weight:900;margin-top:4px">{a}</div><div style="font-size:22px;color:#4b5a54;margin-top:6px;line-height:1.6">{b}</div></div>' for i, (a, b) in enumerate((("記録用ファイル", "お客さまごとに作成"), ("記録を集める", "配布と回収はお客さまとの場で"), ("レポート", "1件ごと、5日以内に返却"))))
    return _thumb("お客さまの1人実験の記録を、統計で分析したレポートにして返します。成分は勧めず、記録で出た差だけを返します。", "お客さまの記録を、分析して返します", "分析", f'<div style="display:flex;gap:14px">{steps}</div><div style="margin-top:18px;font-size:24px;color:#4b5a54">お客さまの同意は、事前にお取りください</div>', "伴走者向け")


ASSETS = {
    "icon": ("x_icon", b_icon), "x_header": ("x_header", b_x_header), "note_header": ("note_header", b_note_header),
    "x_header_card": ("post_image", b_intro_card), "fig_compare": ("post_image", b_fig_compare), "fig_power": ("post_image", b_fig_power),
    "fig_melatonin": ("post_image", b_fig_melatonin), "fig_decision": ("post_image", b_fig_decision),
    "card_jitter": ("post_image", b_card_jitter), "card_gap": ("post_image", b_card_gap), "card_caffeine": ("post_image", b_card_caffeine),
    "card_abba": ("post_image", b_card_abba), "card_vitd": ("post_image", b_card_vitd), "card_cause": ("post_image", b_card_cause),
    "card_combo": ("post_image", b_card_combo), "card_stance": ("post_image", b_card_stance), "card_next": ("post_image", b_card_next),
    "thumb_entry": ("coconala_thumb", b_thumb_entry), "thumb_standard": ("coconala_thumb", b_thumb_standard),
    "thumb_premium": ("coconala_thumb", b_thumb_premium), "thumb_partner": ("coconala_thumb", b_thumb_partner),
}


def html_of(key: str) -> tuple[str, tuple[int, int]]:
    size_key, fn = ASSETS[key]
    return fn(), SIZES[size_key][0]


def to_png(html_text: str, size: tuple[int, int], path: str, wait_ms: int = 2500) -> None:
    chrome = find_chrome()
    if not chrome:
        raise RuntimeError("画像にするための Chrome / Chromium が見つかりません（N1_CHROME で場所を指定できます）")
    w, h = size
    with tempfile.TemporaryDirectory() as tmp:
        src = pathlib.Path(tmp) / "a.html"
        src.write_text(html_text, encoding="utf-8")
        args = [chrome, "--headless", "--disable-gpu", "--hide-scrollbars", f"--virtual-time-budget={wait_ms}",
                f"--window-size={w},{h}", f"--screenshot={os.path.abspath(path)}", src.as_uri()]
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            args.insert(1, "--no-sandbox")
        subprocess.run(args, check=True, capture_output=True, timeout=120)


def png_size(path: str) -> tuple[int, int]:
    import struct

    with open(path, "rb") as fh:
        head = fh.read(24)
    return struct.unpack(">II", head[16:24])


def export(out: str, keys: list[str] | None = None) -> list[str]:
    root = pathlib.Path(out)
    root.mkdir(parents=True, exist_ok=True)
    written = []
    for key in keys or list(ASSETS):
        text, size = html_of(key)
        f = root / f"{key}.png"
        to_png(text, size, str(f))
        got = png_size(str(f))
        if got != size:
            raise RuntimeError(f"{key}：画像の大きさが {got}（想定 {size}）")
        written.append(str(f))
    return written
