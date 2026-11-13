"""お客さんに渡すレポート（HTML・PDF）。report.py の文章に、記録の図と差の大きさの図を足す。

文章は report.render() の Markdown を1か所の元にして変換する（言葉の決まり・禁止語のテストがそのまま効く）。
図は SVG を埋め込み、外部のファイルや通信を使わない（1つのファイルで送れて、オフラインでも開ける）。

  毎日の記録   主要項目の毎日の値を、条件（飲まない／飲んだ／2成分なら4条件）ごとの色と形で打ち、
               期間ごとの平均を線で引く。背景の帯で期間を示す
  差の大きさ   推定した差と90%の幅を横線で示す。0 の線と、意味のある差の線（0〜10の項目）を引く

色は dataviz の既定の配色（青・橙・水色・黄）で、検証スクリプトで隣り合う組の色覚多様性の差を確かめた。
4色のうち水色・黄は白地とのコントラストが3:1未満なので、形（丸・四角・三角・ひし形）と凡例・表を必ず付ける。
PDF は、手元の Chromium（ヘッドレス）で印刷して作る（to_pdf）。
"""

from __future__ import annotations

import html
import math
import os
import pathlib
import re
import shutil
import subprocess
import tempfile

import numpy as np

from . import VERSION
from .domain.variables import VARIABLES, derive

SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"]
SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500"]
SHAPES = ["circle", "square", "triangle", "diamond"]


# ---------------------------------------------------------------- Markdown → HTML（report.py が出す範囲だけ）


def _inline(s: str) -> str:
    s = html.escape(s, quote=False)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", lambda m: f'<a href="{html.escape(m.group(2))}">{m.group(1)}</a>', s)
    return s


def _table(rows: list[str]) -> str:
    cells = [[c.strip() for c in r.strip().strip("|").split("|")] for r in rows]
    head, body = cells[0], [c for c in cells[2:]]
    out = ['<div class="tw"><table><thead><tr>', *(f"<th>{_inline(c)}</th>" for c in head), "</tr></thead><tbody>"]
    for r in body:
        out.append("<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in r) + "</tr>")
    out.append("</tbody></table></div>")
    return "".join(out)


def md_to_sections(md: str) -> tuple[str, str, list[tuple[str, str]]]:
    """（題名, 題名の下の1行, [(見出し, 本文HTML)]）に分ける。"""
    lines = md.split("\n")
    title, sub, sections = "", "", []
    cur_head, buf = None, []
    i = 0

    def flush():
        if cur_head is not None:
            sections.append((cur_head, "".join(buf)))

    while i < len(lines):
        ln = lines[i]
        if ln.startswith("# "):
            title = ln[2:].strip()
        elif ln.startswith("## "):
            flush()
            cur_head, buf = ln[3:].strip(), []
        elif cur_head is None:
            if ln.strip() and not ln.startswith("<!--"):
                sub = ln.strip()
        elif ln.startswith("### "):
            buf.append(f"<h3>{_inline(ln[4:].strip())}</h3>")
        elif ln.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append(lines[i])
                i += 1
            buf.append(_table(rows))
            continue
        elif ln.startswith("- "):
            items = []
            while i < len(lines) and (lines[i].startswith("- ") or lines[i].startswith("  - ")):
                if lines[i].startswith("- "):
                    items.append([lines[i][2:], []])
                else:
                    items[-1][1].append(lines[i][4:])
                i += 1
            out = ["<ul>"]
            for text, kids in items:
                k = "<ul>" + "".join(f"<li>{_inline(x)}</li>" for x in kids) + "</ul>" if kids else ""
                out.append(f"<li>{_inline(text)}{k}</li>")
            out.append("</ul>")
            buf.append("".join(out))
            continue
        elif ln.startswith("<!--"):
            pass  # 担当者のコメント欄の印。本文にコメントが入っていなければ出さない
        elif ln.strip():
            buf.append(f"<p>{_inline(ln.strip())}</p>")
        i += 1
    flush()
    return title, sub, sections


# ---------------------------------------------------------------- 図の部品


def _nice_ticks(lo: float, hi: float, n: int = 5) -> list[float]:
    """lo〜hi を必ず含む、切りのよい目盛り。"""
    if not np.isfinite(lo) or not np.isfinite(hi) or hi <= lo:
        hi = lo + 1
    raw = (hi - lo) / max(n - 1, 1)
    mag = 10 ** math.floor(math.log10(raw))
    step = next(s * mag for s in (1, 2, 2.5, 5, 10) if s * mag >= raw)
    start, end = math.floor(lo / step), math.ceil(hi / step)
    return [round(k * step, 10) for k in range(start, end + 1)]


def _fmt(x: float) -> str:
    return f"{x:.0f}" if abs(x - round(x)) < 1e-9 else f"{x:.1f}"


def _marker(shape: str, x: float, y: float, slot: int, title: str) -> str:
    cls = f'class="mk s{slot}"'
    t = f"<title>{html.escape(title)}</title>"
    if shape == "circle":
        return f'<circle {cls} cx="{x:.1f}" cy="{y:.1f}" r="4.5">{t}</circle>'
    if shape == "square":
        return f'<rect {cls} x="{x - 4:.1f}" y="{y - 4:.1f}" width="8" height="8" rx="1">{t}</rect>'
    if shape == "triangle":
        return f'<polygon {cls} points="{x:.1f},{y - 5.5:.1f} {x + 5:.1f},{y + 3.5:.1f} {x - 5:.1f},{y + 3.5:.1f}">{t}</polygon>'
    return f'<polygon {cls} points="{x:.1f},{y - 5.5:.1f} {x + 5.5:.1f},{y:.1f} {x:.1f},{y + 5.5:.1f} {x - 5.5:.1f},{y:.1f}">{t}</polygon>'


def _legend(labels: list[str]) -> str:
    items = []
    for k, lab in enumerate(labels):
        svg = f'<svg width="14" height="14" viewBox="-7 -7 14 14" aria-hidden="true">{_marker(SHAPES[k], 0, 0, k, lab).replace("<title>" + html.escape(lab) + "</title>", "")}</svg>'
        items.append(f'<span class="lg">{svg}{html.escape(lab)}</span>')
    return f'<div class="legend">{"".join(items)}</div>'


# ---------------------------------------------------------------- 毎日の記録の図


def conditions(d: dict, res) -> tuple[np.ndarray, list[str]]:
    """毎日の条件の番号と、その呼び名。"""
    treat = np.asarray(d["treat"], dtype=int)
    if res.extras:
        cond = treat.copy()
        for k, e in enumerate(res.extras):
            cond = cond + (2 ** (k + 1)) * np.asarray(d["treat_" + e.key], dtype=int)
        names = [res.primary_label] + [e.label for e in res.extras]
        labels = []
        for c in range(2 ** len(names)):
            on = [names[j] for j in range(len(names)) if (c >> j) & 1]
            labels.append("どれも飲まない" if not on else "全部" if len(on) == len(names) else "・".join(on) + "だけ")
        if len(names) == 2:
            labels = ["どちらも飲まない", f"{names[0]}だけ", f"{names[1]}だけ", "両方"]
        return cond, labels
    if "amount" in d and np.any((treat == 1) & (np.asarray(d["amount"], dtype=float) == 0.5)):
        half = (treat == 1) & (np.asarray(d["amount"], dtype=float) == 0.5)
        return np.where(half, 2, treat), ["飲まない期間", "飲んだ期間", "半分の量の期間"]
    return treat, ["飲まない期間", "飲んだ期間"]


def daily_chart(day, y, cond, labels, unit: str, label: str) -> str:
    day = np.asarray(day, dtype=int)
    y = np.asarray(y, dtype=float)
    ok = ~np.isnan(y)
    W, H, L, R, T, B = 680, 310, 52, 16, 26, 40
    x0, x1 = day.min() - 0.5, day.max() + 0.5
    lo, hi = np.nanmin(y), np.nanmax(y)
    pad = (hi - lo) * 0.08 or 1
    ticks = _nice_ticks(lo - pad, hi + pad)
    y0, y1 = ticks[0], ticks[-1]
    sx = lambda v: L + (v - x0) / (x1 - x0) * (W - L - R)  # noqa: E731
    sy = lambda v: T + (y1 - v) / (y1 - y0) * (H - T - B)  # noqa: E731
    out = [f'<svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label="{html.escape(label)}の毎日の記録">']
    # 期間の帯と平均の線
    order = np.argsort(day)
    dd, cc, yy = day[order], np.asarray(cond)[order], y[order]
    runs, s = [], 0
    for i in range(1, len(dd) + 1):
        if i == len(dd) or cc[i] != cc[s] or dd[i] - dd[i - 1] > 3:
            runs.append((s, i))
            s = i
    for a, b in runs:
        c = int(cc[a])
        out.append(f'<rect class="band s{c}" x="{sx(dd[a] - 0.5):.1f}" y="{T}" width="{sx(dd[b - 1] + 0.5) - sx(dd[a] - 0.5):.1f}" height="{H - T - B}"/>')
    for t in ticks:
        out.append(f'<line class="grid" x1="{L}" x2="{W - R}" y1="{sy(t):.1f}" y2="{sy(t):.1f}"/><text class="tick" x="{L - 8}" y="{sy(t) + 4:.1f}" text-anchor="end">{_fmt(t)}</text>')
    for a, b in runs:
        seg = yy[a:b]
        if np.any(~np.isnan(seg)):
            m = float(np.nanmean(seg))
            c = int(cc[a])
            out.append(f'<line class="mean s{c}" x1="{sx(dd[a] - 0.4):.1f}" x2="{sx(dd[b - 1] + 0.4):.1f}" y1="{sy(m):.1f}" y2="{sy(m):.1f}"><title>{html.escape(labels[c])}（{dd[a]}〜{dd[b - 1]}日目）の平均 {_fmt(m)}{html.escape(unit)}</title></line>')
    for d_, c, v in zip(dd, cc, yy):
        if not np.isnan(v):
            out.append(_marker(SHAPES[int(c) % 4], sx(d_), sy(v), int(c) % 4, f"{d_}日目・{labels[int(c)]}：{_fmt(v)}{unit}"))
    out.append(f'<line class="axis" x1="{L}" x2="{W - R}" y1="{H - B}" y2="{H - B}"/>')
    for t in range(1, int(day.max()) + 1, 7):
        out.append(f'<text class="tick" x="{sx(t):.1f}" y="{H - B + 18}" text-anchor="middle">{t}</text>')
    out.append(f'<text class="tick" x="{W - R}" y="{H - 6}" text-anchor="end">日目</text>')
    out.append(f'<text class="tick" x="{L - 8}" y="{T - 12}" text-anchor="end">{html.escape(unit)}</text>')
    out.append("</svg>")
    return "".join(out)


# ---------------------------------------------------------------- 差の大きさの図


def effect_chart(rows: list[tuple[str, float, float, float]], unit: str, direction: int, mid: float | None) -> str:
    """rows：（呼び名, 平均, 幅の下, 幅の上）。元の単位で、記録が増える向きを＋にした値。"""
    W, L, R, T, rowh = 680, 200, 24, 30, 38
    H = T + rowh * len(rows) + 34
    vals = [v for r in rows for v in r[1:]] + [0.0]
    if mid:
        vals.append(mid * (direction or 1))
    lo, hi = min(vals), max(vals)
    pad = (hi - lo) * 0.12 or 1
    ticks = _nice_ticks(lo - pad, hi + pad)
    x0, x1 = ticks[0], ticks[-1]
    sx = lambda v: L + (v - x0) / (x1 - x0) * (W - L - R)  # noqa: E731
    out = [f'<svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label="差の大きさと90%の幅">']
    for t in ticks:
        out.append(f'<line class="grid" x1="{sx(t):.1f}" x2="{sx(t):.1f}" y1="{T - 6}" y2="{H - 30}"/><text class="tick" x="{sx(t):.1f}" y="{H - 14}" text-anchor="middle">{"+" if t > 0 else ""}{_fmt(t)}</text>')
    out.append(f'<line class="zero" x1="{sx(0):.1f}" x2="{sx(0):.1f}" y1="{T - 10}" y2="{H - 30}"/>')
    out.append(f'<text class="tick" x="{sx(0):.1f}" y="{T - 14}" text-anchor="middle">差なし</text>')
    if mid:
        mx = mid * (direction or 1)
        out.append(f'<line class="midline" x1="{sx(mx):.1f}" x2="{sx(mx):.1f}" y1="{T - 6}" y2="{H - 30}"/>')
        out.append(f'<text class="tick" x="{sx(mx):.1f}" y="{T - 14}" text-anchor="middle">意味のある差</text>')
    if direction:
        good_right = direction > 0
        left, right = ("悪い方向", "良い方向") if good_right else ("良い方向", "悪い方向")
    else:
        left, right = "低い", "高い"
    out.append(f'<text class="tick" x="{L}" y="{H - 2}">← {left}</text><text class="tick" x="{W - R}" y="{H - 2}" text-anchor="end">{right} →</text>')
    for k, (lab, m, a, b) in enumerate(rows):
        y = T + rowh * k + rowh / 2
        out.append(f'<text class="rowlab" x="{L - 12}" y="{y + 4:.1f}" text-anchor="end">{html.escape(lab)}</text>')
        out.append(f'<line class="ci" x1="{sx(a):.1f}" x2="{sx(b):.1f}" y1="{y:.1f}" y2="{y:.1f}"/>')
        out.append(f'<circle class="pt" cx="{sx(m):.1f}" cy="{y:.1f}" r="5.5"><title>{html.escape(lab)}：{"+" if m > 0 else ""}{_fmt(m)}{html.escape(unit)}（90%の幅 {_fmt(a)}〜{_fmt(b)}）</title></circle>')
    out.append("</svg>")
    return "".join(out)


def _raw(r, v):
    """判定の値（良い向き＋）を、元の単位・増える向き＋に戻す。対数の項目は%にする。"""
    s = r.direction or 1
    m, a, b = v.effect_mean * s, v.effect_low * s, v.effect_high * s
    a, b = min(a, b), max(a, b)
    if r.log:
        m, a, b = ((math.exp(x) - 1) * 100 for x in (m, a, b))
    return m, a, b


def effect_rows(res) -> list[tuple[str, float, float, float]]:
    p = res.primary
    if p.multi:
        rows = [(f"{f['label']}だけ", *_raw(p, res.pooled_v if (k == 0 and res.pooled_v is not None) else f["v"])) for k, f in enumerate(p.multi["factors"])]
        rows.append(("一緒に", *_raw(p, p.multi["both"])))
        rows += [("上乗せ", *_raw(p, it["v"])) for it in p.multi["interactions"]]
        return rows
    if res.pooled_v is not None:
        return [("あなたの差", *_raw(p, res.pooled_v)), ("記録だけの推定", *_raw(p, p.v))]
    return [("あなたの差", *_raw(p, p.v))]


# ---------------------------------------------------------------- ページ


CSS = """
:root{color-scheme:light;--bg:#f9f9f7;--surface:#fcfcfb;--ink:#0b0b0b;--ink2:#52514e;--muted:#898781;--grid:#e1e0d9;--axis:#c3c2b7;--rule:rgba(11,11,11,.10);--accent:#2a78d6;
--s0:%s;--s1:%s;--s2:%s;--s3:%s}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])){color-scheme:dark;--bg:#0d0d0d;--surface:#1a1a19;--ink:#f0efec;--ink2:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--rule:rgba(255,255,255,.10);--accent:#3987e5;--s0:%s;--s1:%s;--s2:%s;--s3:%s}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif;font-size:15px;line-height:1.75}
main{max-width:760px;margin:0 auto;padding:32px 16px 64px}
header h1{font-size:22px;line-height:1.4;margin:0 0 6px}
header .sub{color:var(--ink2);font-size:13px;margin:0}
section{background:var(--surface);border:1px solid var(--rule);border-radius:10px;padding:18px 20px;margin-top:16px;break-inside:avoid-page}
section.lead{border-left:4px solid var(--accent)}
h2{font-size:17px;margin:0 0 10px}
h3{font-size:15px;margin:14px 0 6px}
p{margin:8px 0}
ul{margin:8px 0;padding-left:1.3em}
li{margin:3px 0}
a{color:var(--accent)}
.tw{overflow-x:auto;margin:10px 0}
table{border-collapse:collapse;width:100%%;font-size:14px}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--grid);vertical-align:top}
th{color:var(--ink2);font-weight:600}
td{font-variant-numeric:tabular-nums}
figure{margin:14px 0 4px;break-inside:avoid}
figcaption{font-size:13px;color:var(--ink2);margin-top:4px}
.chart{width:100%%;height:auto;display:block}
.chart text{font-family:inherit}
.chart .tick{font-size:11px;fill:var(--muted)}
.chart .rowlab{font-size:13px;fill:var(--ink)}
.chart .grid{stroke:var(--grid);stroke-width:1}
.chart .axis{stroke:var(--axis);stroke-width:1}
.chart .zero{stroke:var(--ink2);stroke-width:1}
.chart .midline{stroke:var(--muted);stroke-width:1;stroke-dasharray:4 3}
.chart .ci{stroke:var(--s0);stroke-width:3;stroke-linecap:round}
.chart .pt{fill:var(--s0);stroke:var(--surface);stroke-width:2}
.chart .mk{stroke:var(--surface);stroke-width:2}
.chart .band{opacity:.09}
.chart .mean{stroke-width:2;stroke-linecap:round}
.s0{fill:var(--s0);stroke:var(--s0)} .s1{fill:var(--s1);stroke:var(--s1)} .s2{fill:var(--s2);stroke:var(--s2)} .s3{fill:var(--s3);stroke:var(--s3)}
.chart .mk.s0,.chart .mk.s1,.chart .mk.s2,.chart .mk.s3{stroke:var(--surface)}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:var(--ink2);margin:6px 0}
.lg{display:inline-flex;align-items:center;gap:6px}
.lg .mk{stroke:none}
details{margin-top:8px;font-size:14px}
summary{cursor:pointer;color:var(--ink2)}
.staff{border-left:3px solid var(--accent);padding:4px 12px;white-space:pre-wrap}
footer{color:var(--muted);font-size:12px;margin-top:24px}
@media print{body{background:#fff}main{padding:0;max-width:none}section{border-color:#ddd}details{display:none}@page{size:A4;margin:14mm 12mm}}
""" % (*SERIES, *SERIES_DARK)


def render_html(md: str, res, d: dict, primary: str, comment: str | None = None) -> str:
    """report.render() の Markdown に、図を足した HTML を作る。comment は担当者のコメント。"""
    d = derive(d)
    title, sub, sections = md_to_sections(md)
    p = res.primary
    var = VARIABLES.get(primary)
    unit = "点" if p.unit == "0〜10" else p.unit
    cond, labels = conditions(d, res)
    used = sorted(set(int(c) for c in cond))
    labels_used = [labels[c] if c < len(labels) else str(c) for c in range(max(used) + 1)]
    y = np.asarray(d[primary], dtype=float)
    fig_daily = (
        "<figure>"
        + _legend(labels_used[: max(used) + 1])
        + daily_chart(d["day"], y, cond, labels_used, unit, p.label)
        + f"<figcaption>毎日の「{html.escape(p.label)}」。色と形は条件、横線はその期間の平均、薄い帯は期間の区切り。"
        + ("低いほど良い項目です。" if p.direction < 0 else "高いほど良い項目です。" if p.direction > 0 else "")
        + "この図は記録そのもので、前日の引きずりや外部要因はまだ差し引いていません（差し引いた後の差は下の図）。</figcaption></figure>"
    )
    rows = effect_rows(res)
    eunit = "%" if p.log else unit
    fig_eff = (
        "<figure>"
        + effect_chart(rows, eunit, p.direction, None if p.log or res.mid is None else res.mid)
        + "<figcaption>点が推定した差、横線が90%の幅（本当の差がこの範囲に入っている見込みが90%）。幅が「差なし」の線をまたいでいれば、差がない可能性も残っています。"
        + "時間の流れ・外部要因・前日の引きずりを差し引いた後の値です。</figcaption></figure>"
    )
    table_rows = "".join(
        f"<tr><td>{int(dd)}</td><td>{html.escape(labels_used[int(c)])}</td><td>{'' if np.isnan(v) else _fmt(v)}</td></tr>"
        for dd, c, v in sorted(zip(np.asarray(d['day']), cond, y))
    )
    table = f'<details><summary>毎日の記録を表で見る</summary><div class="tw"><table><thead><tr><th>日目</th><th>条件</th><th>{html.escape(p.label)}（{html.escape(unit)}）</th></tr></thead><tbody>{table_rows}</tbody></table></div></details>'
    figures = f'<section><h2>記録と差を図で見る</h2>{fig_daily}{table}{fig_eff}</section>'

    body = []
    for head, content in sections:
        if head == "コメント":
            if comment and comment.strip():
                body.append(f'<section><h2>担当者からのコメント</h2><div class="staff">{html.escape(comment.strip())}</div></section>')
            continue
        cls = ' class="lead"' if head == "結論" else ""
        body.append(f"<section{cls}><h2>{html.escape(head)}</h2>{content}</section>")
        if head == "結論":
            body.append(figures)
    return (
        "<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        f"<title>{html.escape(title)}</title><style>{CSS}</style></head><body><main>"
        f"<header><h1>{html.escape(title)}</h1><p class=\"sub\">{_inline(sub)}</p></header>"
        + "".join(body)
        + f"<footer>分析エンジン v{VERSION}。このレポートはあなたの記録だけについてのもので、成分そのものの働きを示すものではありません。</footer>"
        "</main></body></html>"
    )


# ---------------------------------------------------------------- PDF


def find_chrome() -> str | None:
    """PDF にするための Chromium。環境変数 N1_CHROME、PATH、Playwright の置き場所の順に探す。"""
    if os.environ.get("N1_CHROME"):
        return os.environ["N1_CHROME"]
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome"):
        p = shutil.which(name)
        if p:
            return p
    for pat in ("/opt/pw-browsers/chromium-*/chrome-linux64/chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"):
        hits = sorted(pathlib.Path("/").glob(pat.lstrip("/")))
        if hits:
            return str(hits[-1])
    return None


def to_pdf(html_text: str, pdf_path: str) -> None:
    chrome = find_chrome()
    if not chrome:
        raise RuntimeError("PDF にするための Chrome / Chromium が見つかりません（N1_CHROME で場所を指定できます）")
    with tempfile.TemporaryDirectory() as tmp:
        src = pathlib.Path(tmp) / "report.html"
        src.write_text(html_text, encoding="utf-8")
        args = [chrome, "--headless", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={os.path.abspath(pdf_path)}", src.as_uri()]
        if hasattr(os, "geteuid") and os.geteuid() == 0:
            args.insert(1, "--no-sandbox")
        subprocess.run(args, check=True, capture_output=True, timeout=120)
    if not os.path.exists(pdf_path):
        raise RuntimeError("PDF を作れませんでした")
