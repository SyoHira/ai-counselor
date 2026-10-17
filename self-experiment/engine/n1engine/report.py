"""レポートの下書き。担当者がコメントを添えて納品する。

言葉の決まり
- 「効果」「効く」「効力」を使わない。言えるのは「あなたの記録で出た差」だけ。
- 差がなかった場合も、失敗として書かない。それが分かったこと自体が結果。
- 病名・症状の診断に見える書き方をしない。
- 成分の説明は体内での動き方（半減期など）だけ。何に良いかは書かない。
"""

from __future__ import annotations

from . import VERSION
from .diagnostics import ESS_MIN, RHAT_MAX
from .domain.pk import STEADY_HALF_LIVES
from .domain.variables import label as var_label
from .pipeline import Analysis, OutcomeResult

CLOSING = {
    "はっきり差がある": "記録の上では、飲んだ期間の方がはっきり良い結果でした。",
    "差がありそう": "記録の上では、飲んだ期間の方が良かった可能性があります。ただし、はっきりと言える水準には届いていません。",
    "はっきりしない": "記録の上では、飲んだ期間と飲まない期間の違いは、普段の揺れの範囲に収まっていました。これはあなたの体に合っていなかったという意味ではなく、この期間の記録からは違いが読み取れなかったという意味です。続けるかどうかを、気分ではなく記録をもとに決められる材料になります。",
    "悪い方向に差がありそう": "記録の上では、飲んだ期間の方が良くなかった可能性があります。",
    "悪い方向にはっきり差がある": "記録の上では、飲んだ期間の方がはっきり良くない結果でした。続けるかどうか見直す材料になります。",
}


def _pct(x: float) -> str:
    return f"{round(x * 100)}%"


def _neutral_label(p_higher: float) -> str:
    if p_higher >= 0.95:
        return "飲んだ期間の方がはっきり高い"
    if p_higher <= 0.05:
        return "飲んだ期間の方がはっきり低い"
    return "はっきりしない"


def _diff(r: OutcomeResult, v=None) -> str:
    """差を、項目の単位で書く。対数にした項目は「何%」で書く。"""
    import math

    v = v or r.v
    sign = r.direction or 1
    m, lo, hi = v.effect_mean * sign, v.effect_low * sign, v.effect_high * sign
    if sign < 0:
        lo, hi = hi, lo
    if r.log:
        f = lambda x: f"{(math.exp(x) - 1) * 100:+.0f}%"  # noqa: E731
        return f"{f(m)}（90%の幅：{f(lo)}〜{f(hi)}）"
    unit = "点" if r.unit == "0〜10" else r.unit
    nd = 1 if r.unit in ("0〜10", "拍/分", "%") else 0
    return f"{m:+.{nd}f}{unit}（90%の幅：{lo:+.{nd}f}〜{hi:+.{nd}f}{unit}）"


def _prob_phrase(r: OutcomeResult) -> tuple[str, float]:
    if r.direction == 0:
        return "高かった確率", r.v.p_better
    return "良かった確率", r.v.p_better


def _single_head(L, res, p, name):
    mv = res.pooled_v or p.v
    L.append("## 結論")
    L.append("")
    if res.pooled_v is not None:
        L.append(f"同じ成分・同じ項目で試した方 {res.pooled['people'] - 1}人の記録の傾向を土台にして、**あなたの記録**から推定した結果です。結果はあなた1人についてのものです。")
        L.append("")
    if p.direction == 0:
        L.append(f"**{_neutral_label(mv.p_better)}**")
        L.append("")
        L.append(f"あなたの場合、飲んだ期間の方が「{name}」が高かった確率は **{_pct(mv.p_better)}** でした。")
        L.append("")
    else:
        L.append(f"**{mv.label}**")
        L.append("")
        L.append(f"あなたの場合、飲んだ期間の方が「{name}」が良かった確率は **{_pct(mv.p_better)}** でした。")
        L.append("")
        L.append(CLOSING[mv.label])
        L.append("")

    L.append("## 数字で見る")
    L.append("")
    L.append(f"- 差の大きさ：平均 **{_diff(p, mv)}**")
    if res.pooled_v is not None:
        L.append(f"  - あなたの記録だけで推定した場合：{_diff(p, p.v)}（良かった確率 {_pct(p.v.p_better)}）")
        L.append("  - 他の方の傾向を土台にすると、短い記録でも揺れに振り回されにくくなります。土台の重みは、あなたの記録が確かなほど小さくなります。")
    if res.substance is not None and res.substance.pk is not None:
        L.append("  - 飲み続けて体内の量が安定したときの差です。飲み始めの数日と、やめた後に体に残っている数日は、残っている量に応じて計算に入れています。")
    mid = res.mid
    if p.direction != 0 and not p.log and mid:
        L.append(f"- {mid:g}{'点' if p.unit == '0〜10' else p.unit}以上良かった確率：{_pct(mv.p_meaningful)}")
    L.append(f"- 前日の体調の引きずり：{p.v.rho_mean:.2f}（0なら毎日が独立、1に近いほど前日を強く引きずる）")
    L.append("")
    L.append("「90%の幅」は、本当の差がこの範囲に入っている見込みが90%という意味です。幅が0をまたいでいる場合は、差がない可能性も残っています。")
    L.append("")


def _substance_block(L, res, s, dose_hour, residual, washout, suit, p, label=None):
    """成分1つ分の、体内での動き。複数の要因を掛け合わせたときは、成分ごとに書く。"""
    if label:
        L.append(f"### {label}")
        L.append("")
    if s is None:
        L.append("成分を指定していないため、飲んだ日=1・飲まない日=0 として計算しています。飲み始めや、やめた後に残る分は考慮していません。")
        return
    L.append(f"- 成分：{s.name}")
    if s.pk is not None:
        rng = f"（個人差 {s.t_half_range_h[0]:g}〜{s.t_half_range_h[1]:g}時間）" if s.t_half_range_h else ""
        L.append(f"- 体内で半分になるまでの時間（半減期）：{s.pk.t_half_h:.3g}時間{rng}")
        if s.pk.tmax_h is not None:
            L.append(f"- 飲んでから最も濃くなるまで：約{s.pk.tmax_h:g}時間")
        L.append(f"- 飲む時刻 {dose_hour:g}時のとき、{p.window.label}に体に残っている量：1日の最高時の約{_pct(residual)}")
        L.append(f"- 実験の前に空ける日数の目安：{washout}日（半減期の{STEADY_HALF_LIVES}倍）")
    if s.note:
        L.append(f"- {s.note}")
    if suit:
        L.append(f"- 7日ずつ入れ替える実験への向き：**{suit['level']}**。{suit['text']}")
    if s.sources:
        L.append("- 数値の出典（{0}確認）：".format(s.checked))
        for lab, url in s.sources:
            L.append(f"  - [{lab}]({url})")
    else:
        L.append("- 数値は指定されたもので、出典を確認していません。")
    L.append("")


def _cond_row(r: OutcomeResult, label: str, v, null=None) -> str:
    """複数の要因の結果の表の1行。"""
    if r.direction == 0:
        word = _neutral_label(v.p_better)
        prob = f"高かった確率 {_pct(v.p_better)}"
    else:
        word = v.label
        prob = f"良かった確率 {_pct(v.p_better)}"
    chance = ""
    if null is not None:
        chance = "一度も出ない" if null["rate"] == 0 else f"約{null['one_in']:.0f}回に1回"
    return f"| {label} | {_diff(r, v)} | {prob} | {word} | {chance} |"


def _multi_head(L, res, p, name):
    """複数の成分・要因を掛け合わせた実験の結論。"""
    m = p.multi
    facs = m["factors"]
    names = "・".join(f["label"] for f in facs)
    L.append("## 結論")
    L.append("")
    L.append(f"{names}を、単独でも一緒でも試した実験です。「{name}」について、次の4つに分けて推定しました。")
    L.append("")
    L.append("| 条件 | 差（飲み続けたとき） | 確率 | 判定 | 偶然でも出る頻度 |")
    L.append("|---|---|---|---|---|")
    for i, f in enumerate(facs):
        v = f["v"]
        lab = f"{f['label']}だけ"
        if i == 0 and res.pooled_v is not None:
            v = res.pooled_v
            lab += "（他の方の傾向を土台）"
        L.append(_cond_row(p, lab, v, f.get("null")))
    L.append(_cond_row(p, m["both_label"], m["both"]))
    for it in m["interactions"]:
        L.append(_cond_row(p, f"上乗せ（{it['pair'][0]}×{it['pair'][1]}）", it["v"], it.get("null")))
    L.append("")
    L.append("- 「〜だけ」は、ほかを取らない期間と比べた差です。「一緒に」は、すべてを一緒に取ったときの差（単独の差の合計に上乗せを足したもの）です。")
    if p.direction < 0:
        way = "マイナスなら、一緒に取った方が足し算より良く、プラスなら足し算より悪い結果です（この項目は数字が低いほど良いため）。"
    elif p.direction > 0:
        way = "プラスなら、一緒に取った方が足し算より良く、マイナスなら足し算より悪い結果です。"
    else:
        way = "プラスなら足し算より高く、マイナスなら足し算より低い結果です。"
    L.append(f"- 「上乗せ」は、一緒に取ったときの差が、単独の差の合計からどれだけずれるかです。{way}")
    L.append("- 上乗せは、単独の差を見つけるより、はっきり見つけにくい項目です（56日の偽データで、本当に2点の上乗せがあっても見つけられたのは約3回に2回）。「はっきりしない」は、上乗せが無いという意味ではありません。")
    L.append("- 「偶然でも出る頻度」は、差がゼロの記録を何千回も作ったとき、同じ向きにこれ以上の差が出る頻度です。")
    if res.pooled_v is not None:
        L.append(f"- 同じ組み合わせで試した方 {res.pooled['people'] - 1}人の記録の傾向を、最初の成分の単独の差の土台に使っています。")
    L.append(f"- 前日の体調の引きずり：{p.v.rho_mean:.2f}（0なら毎日が独立、1に近いほど前日を強く引きずる）")
    L.append("")
    weak = [(k, x) for k, x in m["vif"].items() if x > 5]
    if weak:
        L.append("**並びの注意**：次の項目は、時間の流れや外部要因、ほかの項目と重なりが大きく、見分けにくくなっています（重なりの指標が5を超えています）。差の幅が広くなっています。")
        for k, x in weak:
            L.append(f"- {_term_label(m, k)}（{x:.1f}）")
        L.append("")
    L.append("「90%の幅」は、本当の差がこの範囲に入っている見込みが90%という意味です。幅が0をまたいでいる場合は、差がない可能性も残っています。")
    L.append("")


def _term_label(m, name: str) -> str:
    for f in m["factors"]:
        if f["name"] == name:
            return f["label"] + "だけ"
    for it in m["interactions"]:
        if it["name"] == name:
            return it["label"]
    return name


def _lag_section(L, label, pd_table, excluded, shape_table, priors_n=0, with_shape=True, heading="## 記録に現れるまでの遅れ"):
    L.append(heading)
    L.append("")
    L.append("体に入った量は、すぐに記録に現れるとは限りません。働く場所に届き、体の反応が入れ替わるまでの遅れがあると、飲むのをやめた後も数日は記録に影響が残ります。この遅れの長さも、あなたの記録から推定しました。")
    L.append("")
    L.append("| 遅れ（半分になるまでの日数） | 見込み |")
    L.append("|---|---|")
    for h, pr in pd_table:
        L.append(f"| {'遅れなし' if h == 0 else f'{h:g}日'} | {_pct(pr)} |")
    L.append("")
    lag_p = 1 - pd_table[0][1]
    if lag_p >= 0.8:
        L.append(f"遅れがある見込みが{_pct(lag_p)}です。次に試すときは、飲まない期間の最初の数日を長めに取ると比べやすくなります。")
    elif lag_p <= 0.3:
        L.append("遅れはほとんど無いと見られます。")
    else:
        L.append("遅れがあるかどうかは、この記録からははっきりしません。")
    L.append("")
    if excluded:
        longest = max(h for h, _ in pd_table if h not in excluded)
        L.append(f"あなたの実験の並びでは、{'・'.join(f'{h:g}日' for h in excluded)}の遅れは、体調のゆるい変化と見分けられないため候補から外しました（{longest:g}日までを見ています）。もっと長い遅れを確かめるには、14日ずつの並びで試します。")
        L.append("")
    if priors_n:
        L.append(f"遅れの見込みには、同じ成分・同じ項目で試した方 {priors_n}人の結果を事前の重みとして使っています。")
        L.append("")


def render(*, item: str, outcome_label: str | None, res: Analysis, blinded: bool, blind=None, belief=None) -> str:
    p = res.primary
    name = outcome_label or p.label
    L = []
    L.append(f"# 1人実験の結果：{item}")
    L.append("")
    L.append(f"主要項目：{name}（{p.window.label}）　／　記録日数：{p.n_days}日　／　分析エンジン v{VERSION}")
    L.append("")

    if p.multi:
        _multi_head(L, res, p, name)
    else:
        _single_head(L, res, p, name)

    L.append("## 期待の分")
    L.append("")
    pl = res.pooled
    if res.blinded:
        L.append("中身を隠して飲んだので、「飲んだと分かっていたから」という期待の分は、記録の差に入っていません。")
    elif pl is not None and pl["delta_estimated"]:
        L.append(f"中身を隠して試した方 {pl['blinded_people']}人と、中身を知って試した方の記録を比べ、中身を知っていることで記録が動く分（期待の分）を推定しました：平均 {pl['delta_mean']:+.2f}（95%の幅 {pl['delta_low']:+.2f}〜{pl['delta_high']:+.2f}）。上の差は、この分を差し引いたあなたの差です。")
    else:
        L.append("中身を知って飲んだので、記録の差には期待の分が含まれている可能性があります。中身を隠して試した方の記録が集まると、その分を推定して差し引きます。今すぐ取り除くには、中身を隠す上級版（家族などに本物と空のカプセルを入れ替えてもらう）で試します。")
    L.append("")

    L.append("## 偶然と比べると")
    L.append("")
    if p.multi:
        L.append("時間の流れと外部要因を差し引いた後の差を、あなたの普段の揺れ方で差がゼロの記録を何千回も作って比べました。結果は、上の表の「偶然でも出る頻度」に入れています。")
        L.append("")
    else:
        nd = res.null
        way = "良い方向" if nd.get("side", 1) > 0 else "悪い方向"
        if p.direction == 0:
            way = "高い方向" if nd.get("side", 1) > 0 else "低い方向"
        if nd["rate"] == 0:
            L.append(f"時間の流れと外部要因を差し引いた後の差（{way}）を、あなたの普段の揺れ方で差がゼロの記録を何千回も作って比べたところ、この大きさの差は一度も出ませんでした。")
        else:
            L.append(f"時間の流れと外部要因を差し引いた後の差（{way}）は、あなたの普段の揺れ方で差がゼロの記録を何千回も作ってみると、**約{nd['one_in']:.0f}回に1回**は偶然でも出ます。")
        L.append("")

    L.append("## 成分の体内での動き")
    L.append("")
    _substance_block(L, res, res.substance, res.dose_hour, res.residual, res.washout, res.suit, p, res.primary_label if p.multi else None)
    for f_ in (p.multi["factors"][1:] if p.multi else []):
        _substance_block(L, res, f_.get("substance"), f_.get("dose_hour", 8.0), f_.get("residual"), f_.get("washout"), f_.get("suit"), p, f_["label"])
    L.append("")

    if p.pd_table:
        if p.multi:
            for f_ in p.multi["factors"]:
                _lag_section(L, f_["label"], f_["pd_table"], f_["excluded_lags"], f_["shape_table"],
                             res.priors_from_others if f_ is p.multi["factors"][0] else 0,
                             heading=f"## 記録に現れるまでの遅れ：{f_['label']}")
        else:
            _lag_section(L, "", p.pd_table, p.excluded_lags, p.shape_table, res.priors_from_others)

    if p.shape_table:
        L.append("## 量と反応の形")
        L.append("")
        L.append("記録への影響が体の中の量に比例するのか、量が増えると頭打ちになるのかも推定しました。")
        L.append("")
        for f_ in (p.multi["factors"] if p.multi else [{"label": "", "shape_table": p.shape_table}]):
            if f_["label"]:
                L.append(f"**{f_['label']}**")
                L.append("")
            L.append("| 形 | 見込み |")
            L.append("|---|---|")
            for lab, pr in f_["shape_table"]:
                L.append(f"| {lab} | {_pct(pr)} |")
            L.append("")
        L.append("半分の量の期間がある並び（42日）で試すと、この形がはっきり見えます。")
        L.append("")

    L.append("## そろえて比べたもの")
    L.append("")
    L.append("飲んだかどうか以外で記録を動かしうる外部要因は、分析の中で差し引いています。")
    L.append("")
    shown = []
    for c in ["trend", *res.confounders]:
        lab = var_label(c)
        if lab in shown:
            continue
        shown.append(lab)
        miss = res.missing.get(c, 0)
        L.append(f"- {lab}" + (f"（空欄{miss}日は平均で埋めた）" if miss else ""))
    L.append("- 前日の体調の引きずり")
    if p.outlier_days is not None:
        if p.outlier_days:
            L.append(f"- ふだんの揺れより大きく外れた日（{'・'.join(f'{d}日目' for d in p.outlier_days)}）は、結果を左右しすぎないよう重みを下げました")
        else:
            L.append("- ふだんの揺れより大きく外れた日は見当たりませんでした（外れた日があれば重みを下げる計算にしています）")
    L.append("")
    L.append("気分・ストレス・睡眠・心拍などの体の記録は、飲んだことで動きうるため差し引いていません。差し引くと、それを通じて生じた差まで消してしまいます。")
    if res.cycle_overlap is not None and res.cycle_overlap >= 0.5:
        L.append("")
        L.append(f"月経周期の時期と、飲んだ期間の並びが重なっています（重なり{res.cycle_overlap:.2f}、1に近いほど区別しにくい）。周期の影響と飲んだ影響を分けにくく、差の幅が広がっています。28日の並び（7日×4期間）は、周期の長さや始めた日に関係なく重なりが約0.9になります。周期を記録する場合は56日の並び（7日×8期間）を使うと、重なりは0.15以下になります。")
    L.append("")

    if res.secondary:
        L.append("## 参考：ほかの体の記録")
        L.append("")
        L.append("実験前に決めた主要項目以外の記録です。項目が多いほど、偶然どれかに差が出やすくなるため、判定の言葉は付けていません。気になる項目は、次の実験の主要項目にして確かめられます。")
        L.append("")
        if p.multi:
            heads = [f"{f_['label']}だけ" for f_ in p.multi["factors"]] + [p.multi["both_label"]]
            L.append("| 項目 | 時間帯 | " + " | ".join(heads) + " |")
            L.append("|---|---|" + "---|" * len(heads))
            for r in res.secondary:
                cells = [_diff(r, f_["v"]) for f_ in r.multi["factors"]] + [_diff(r, r.multi["both"])]
                L.append(f"| {r.label} | {r.window.label} | " + " | ".join(cells) + " |")
        else:
            L.append("| 項目 | 時間帯 | 差（飲み続けたとき） | 確率 |")
            L.append("|---|---|---|---|")
            for r in res.secondary:
                phrase, pr = _prob_phrase(r)
                L.append(f"| {r.label} | {r.window.label} | {_diff(r)} | {phrase} {_pct(pr)} |")
        L.append("")

    L.append("## 計算の確認")
    L.append("")
    fc = p.fitcheck
    if fc:
        L.append(f"**あなたの記録への当てはまり**：前日までの記録から毎日の記録を予測し、実際の記録が90%の予測幅に入った日は {_pct(fc['coverage90'])}（{fc['n']}日、目安90%）。前後の日との規則性の残り：p={fc['ljung_box_p']:.2f}、期間ごとのずれ：p={fc.get('block_p', 1):.2f}（どちらかが0.025未満なら、式が記録に合っていない）。")
        if fc["ok"]:
            L.append("この分析の式は、あなたの記録に合っていました。")
        else:
            L.append("この分析の式が、あなたの記録に十分合っていない可能性があります。担当者が記録を見直し、必要なら式を変えて分析し直します。")
        L.append("")
    dg = p.fit.diag or {}
    t = dg.get("treatment")
    if p.multi and dg.get("terms"):
        terms = dg["terms"]
        bad = [k for k, x in terms.items() if not x["ok"]]
        ok = "問題なし" if not bad else "要確認（推定回数を増やして再計算する）"
        L.append(f"出発点を変えた{dg['n_chains']}本の計算が同じ答えに落ち着いているかを、すべての項目で確認しました：**{ok}**")
        for k, x in terms.items():
            L.append(f"- {_term_label(p.multi, k)}：R̂ {x['rhat']:.3f}（基準 {RHAT_MAX} 未満）／有効な推定回数 {x['ess']:.0f}回（基準 {ESS_MIN}回以上）{'' if x['ok'] else '　←要確認'}")
    elif t:
        ok = "問題なし" if t["ok"] else "要確認（推定回数を増やして再計算する）"
        L.append(f"出発点を変えた{dg['n_chains']}本の計算が同じ答えに落ち着いているかを確認しました：**{ok}**")
        L.append(f"（R̂ {t['rhat']:.3f}、基準 {RHAT_MAX} 未満／有効な推定回数 {t['ess']:.0f}回、基準 {ESS_MIN}回以上）")
    L.append("")

    if blinded and blind:
        L.append("## 中身を隠した確認")
        L.append("")
        L.append(f"- 「今日は本物を飲んだと思う」が実際と一致した割合：{_pct(blind['accuracy'])}（{blind['n']}日）")
        if blind.get("likely_broken"):
            L.append("- 半々より多く当たっていたため、中身を見抜けていた可能性があります。その場合、期待の影響を完全には取り除けていません。")
        else:
            L.append("- 半々と比べてはっきり多くはなく、中身はおおむね隠せていたと考えられます。")
        if belief:
            L.append(f"- 実際の中身をそろえた上で、「本物を飲んだと思った日」は記録が平均 {belief['belief_coef']:+.1f}点 動いていました（目安）。")
        L.append("")

    qd = res.quantum
    if qd:
        L.append("## 研究：質問の順番とあなたの答え方")
        L.append("")
        L.append(f"毎日の「体の調子は良かったか」「気分は良かったか」の2問を、順番を入れ替えて聞いていました。同意をいただいた {qd['people']}人の答えをあわせ、量子確率モデル（答えるたびに心の状態が質問の軸に移ると考えるモデル）で分析しました。これは研究で、上の結果とは関係しません。")
        L.append("")
        L.append(f"- 「体の調子は良かった」と答えた割合：先に聞いた日 {_pct(qd['obs_first'])}、気分の後に聞いた日 {_pct(qd['obs_second'])}（モデルの予測 {_pct(qd['pred_first'])} → {_pct(qd['pred_second'])}）")
        L.append(f"- あなたの状態の角度 θ：{qd['theta']:.2f}（90%の幅 {qd['theta_low']:.2f}〜{qd['theta_high']:.2f}）。2問の軸のなす角 φ（全員共通）：{qd['phi']:.2f}")
        L.append(f"- {qd['people']}人の答え全体では、{'量子確率モデル' if qd['better'] == 'quantum' else '順番に左右されない古典的なモデル'}の方がよく当てはまりました（AIC：量子 {qd['aic_quantum']:.1f}、古典 {qd['aic_classical']:.1f}）。")
        L.append("")

    L.append("## この結果の範囲")
    L.append("")
    L.append("- この結果は、あなたの記録から推定した、あなたの差です。他の方の記録は推定の土台に使っていますが、他の方の結果や成分そのものの働きを示すものではありません。")
    L.append("- 体調が変わった理由を診断するものではありません。気になる症状がある場合は医療機関に相談してください。")
    L.append("")

    L.append("## 方法")
    L.append("")
    if p.multi:
        L.append(f"- 設計：{len(p.multi['factors'])}つの成分・要因を掛け合わせる並び（推定に使えた連続した日のペア：{p.fit.n_used}組）。条件ごとの差と、同時に取ったときの上乗せ（曝露量どうしの積）を同じ式で推定")
        L.append("- 遅れ・形は、成分ごとに別々に推定（他の方の傾向を土台にするのは、最初の成分だけ）")
    else:
        L.append(f"- 設計：飲む期間と飲まない期間を折り返す順番で4期間（推定に使えた連続した日のペア：{p.fit.n_used}組）")
    L.append("- 分析：前日の引きずりを含めたベイズ回帰。飲んだかどうかは、成分の体内動態から計算した「記録の時間帯に体に残っている量」で表す（1コンパートメントの経口モデル）")
    L.append("- 記録に現れるまでの遅れ（一次の遅れ、候補7つ）と、外れた日に強い揺れ（t 分布）を同時に推定")
    L.append(f"- 事前の前提：差は0を中心に±{p.fit.priors['treatment_sd']:g}点程度（0〜10以外の項目は、飲まない期間のばらつきを1点としてそろえる）。実験前に固定")
    L.append("- 判定基準：良かった確率95%以上で「はっきり差がある」、80%以上で「差がありそう」。主要項目は実験前に1つ決める")
    L.append(f"- 分析エンジン v{VERSION}。答えの分かっている偽データで、判定の誤りの割合と幅の正しさを検証済み（CALIBRATION.md）")
    L.append("")

    L.append("## コメント")
    L.append("")
    L.append("<!-- ここに担当者のコメントを書く -->")
    L.append("")
    return "\n".join(L)
