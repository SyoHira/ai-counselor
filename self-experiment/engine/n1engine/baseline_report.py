"""入口の商品：普段の記録（7日）から、その人の揺れ方と、実験で差を見つけるのに必要な日数を出すレポート。

なぜ作るか
  本番の実験（28〜56日）は、売上の確定が購入から5〜9週間後になる（納品の承諾の後）。
  普段の記録の7日だけを先に商品にすると、1〜2週間で納品でき、最初の販売実績と評価が早く付く。
  そのまま本番の実験に進めば、この7日は本番の「普段どおりの記録」としてそのまま使える。

中身（判定はしない。飲んだ期間はまだ無いので、差の話はしない）
  毎日の記録の図、平均とばらつき、前日の引きずりの見込み（幅つき）、
  実験で「はっきり差がある」と言えるまでに必要な日数の見込み（simulate.plan_length、本番と同じ判定の設定）、
  成分の7日ずつの入れ替えへの向き不向き。
"""

from __future__ import annotations

import html
import math

import numpy as np

from . import VERSION
from .domain.pk import suitability, window_for
from .domain.variables import VARIABLES, derive, transformed
from .pipeline import RATING_UNIT, _scale
from .report_html import CSS, daily_chart, md_to_sections, _legend
from .simulate import noise_candidates, plan_length


def _effects(key: str, sd: float) -> list[tuple[str, float]]:
    """見込みを出す差の大きさ（呼び名, 変換後の尺度での差）。"""
    var = VARIABLES.get(key)
    unit = var.unit if var else RATING_UNIT
    if var and var.transform == "log":
        return [("5%", math.log(1.05)), ("10%", math.log(1.10))]
    if unit == RATING_UNIT:
        return [("1点", 1.0), ("2点", 2.0)]
    small = max(1.0, round(sd * 0.5))
    large = max(small + 1, round(sd * 1.0))
    u = unit
    return [(f"{small:g}{u}", small), (f"{large:g}{u}", large)]


def analyze_baseline(base: dict, key: str, substance=None, dose_hour: float = 8.0, timing: str = "day",
                     bedtime: float = 23.0, waketime: float = 7.0, n_sims: int = 60, seed: int = 0) -> dict:
    base = derive(base)
    if key not in base:
        raise ValueError(f"主要項目 {key} の記録がありません")
    var = VARIABLES.get(key)
    unit = var.unit if var else RATING_UNIT
    raw = np.asarray(base[key], dtype=float)
    y = transformed(key, raw)
    n = int(np.sum(~np.isnan(y)))
    if n < 7:
        raise ValueError(f"普段の記録が7日以上必要です（{key} の記録は{n}日）")
    ys, sd, _ = _scale(y, np.zeros(len(y), dtype=int), unit)
    rhos, sigmas = noise_candidates(ys, seed=seed)
    w = window_for((var.timing if var and var.timing else None) or timing, bedtime, waketime)
    pk = substance.pk if substance is not None else None
    power = []
    for lab, e in _effects(key, sd if unit != RATING_UNIT else 1.0):
        r = plan_length(ys, effect=e / sd, n_sims=n_sims, seed=seed, pk=pk, dose_hour=dose_hour, window=w)
        power.append({"label": lab, **{f"d{x['days']}": x["power"] for x in r}})
    suit = suitability(pk, dose_hour, w, steady_days=substance.steady_days) if substance is not None else None
    return {
        "key": key, "label": var.label if var else key, "unit": unit, "n": n,
        "mean": float(np.nanmean(raw)), "sd": float(np.nanstd(raw)), "min": float(np.nanmin(raw)), "max": float(np.nanmax(raw)),
        "rho_mean": float(np.mean(rhos)), "rho_low": float(np.quantile(rhos, 0.05)), "rho_high": float(np.quantile(rhos, 0.95)),
        "power": power, "suit": suit, "day": np.asarray(base["day"]), "raw": raw,
    }


def render_md(r: dict, item: str, substance_name: str | None) -> str:
    u = "点" if r["unit"] == RATING_UNIT else r["unit"]
    f = (lambda x: f"{x:.1f}") if r["unit"] in (RATING_UNIT, "拍/分", "%") else (lambda x: f"{x:.0f}")
    L = [f"# 普段の記録から見たあなたの揺れ方：{item}", "",
         f"項目：{r['label']}　／　記録日数：{r['n']}日　／　分析エンジン v{VERSION}", "", "## 結論", ""]
    best = max(r["power"], key=lambda p: p.get("d56", 0))
    L.append(f"あなたの「{r['label']}」は、7日間で平均 **{f(r['mean'])}{u}**、ふだんのばらつき（標準偏差）は **{f(r['sd'])}{u}** でした。")
    L.append("")
    L.append(f"この揺れ方なら、本当に {best['label']} の差があるとき、56日の実験で「はっきり差がある」と言える見込みは **約{round(best.get('d56', 0) * 100)}%** です。")
    L.append("")
    L.append("## 毎日の揺れ方")
    L.append("")
    L.append(f"- 平均：{f(r['mean'])}{u}（いちばん低い日 {f(r['min'])}{u}、いちばん高い日 {f(r['max'])}{u}）")
    L.append(f"- 前日の調子の引きずり：{r['rho_mean']:.2f}（90%の幅 {r['rho_low']:.2f}〜{r['rho_high']:.2f}。0なら毎日が独立、1に近いほど前日を強く引きずる）")
    L.append("- 7日間の記録から見積もっているので、幅は広めです。引きずりが強いほど、差を見つけるのに長い期間が必要になります。")
    L.append("")
    L.append("## 実験に必要な日数の見込み")
    L.append("")
    L.append("本当にその大きさの差があるとき、実験の最後に「はっきり差がある」（良かった確率95%以上）と言える見込みです。あなたの揺れ方の不確かさも含めて、答えの分かっている記録を何十回も作って数えました。")
    L.append("")
    L.append("| 本当の差 | 28日の実験 | 56日の実験 |")
    L.append("|---|---|---|")
    for p in r["power"]:
        L.append(f"| {p['label']} | {round(p.get('d28', 0) * 100)}% | {round(p.get('d56', 0) * 100)}% |")
    L.append("")
    L.append("見込みが低い場合も、実験が無駄になるわけではありません。差が小さいこと、あるいはこの期間では見分けられないことが分かります。差が大きいほど、短い期間で見つかります。")
    L.append("")
    if r["suit"]:
        L.append("## 成分の体内での動き")
        L.append("")
        L.append(f"- {substance_name}：7日ずつ入れ替える実験への向き **{r['suit']['level']}**。{r['suit']['text']}")
        L.append("")
    L.append("## この結果の範囲")
    L.append("")
    L.append("- 普段の記録だけを見たもので、まだ飲んだ期間と比べていません。成分について何かを示すものではありません。")
    L.append("- 体調が変わった理由を診断するものではありません。気になる症状がある場合は医療機関に相談してください。")
    L.append("")
    L.append("## コメント")
    L.append("")
    L.append("<!-- ここに担当者のコメントを書く -->")
    L.append("")
    return "\n".join(L)


def render_html(md: str, r: dict, comment: str | None = None) -> str:
    title, sub, sections = md_to_sections(md)
    u = "点" if r["unit"] == RATING_UNIT else r["unit"]
    cond = np.zeros(len(r["day"]), dtype=int)
    fig = ("<section><h2>毎日の記録</h2><figure>" + _legend(["普段どおりの日"])
           + daily_chart(r["day"], r["raw"], cond, ["普段どおりの日"], u, r["label"])
           + f"<figcaption>普段どおりに過ごした{r['n']}日の「{html.escape(r['label'])}」。横線は平均。</figcaption></figure></section>")
    body = []
    for head, content in sections:
        if head == "コメント":
            if comment and comment.strip():
                body.append(f'<section><h2>担当者からのコメント</h2><div class="staff">{html.escape(comment.strip())}</div></section>')
            continue
        cls = ' class="lead"' if head == "結論" else ""
        body.append(f"<section{cls}><h2>{html.escape(head)}</h2>{content}</section>")
        if head == "結論":
            body.append(fig)
    return ("<!doctype html><html lang=\"ja\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            f"<title>{html.escape(title)}</title><style>{CSS}</style></head><body><main>"
            f"<header><h1>{html.escape(title)}</h1><p class=\"sub\">{html.escape(sub)}</p></header>" + "".join(body)
            + f"<footer>分析エンジン v{VERSION}。このレポートはあなたの記録だけについてのものです。</footer></main></body></html>")
