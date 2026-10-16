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


def _diff(r: OutcomeResult) -> str:
    """差を、項目の単位で書く。対数にした項目は「何%」で書く。"""
    import math

    sign = r.direction or 1
    m, lo, hi = r.v.effect_mean * sign, r.v.effect_low * sign, r.v.effect_high * sign
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


def render(*, item: str, outcome_label: str | None, res: Analysis, blinded: bool, blind=None, belief=None) -> str:
    p = res.primary
    name = outcome_label or p.label
    L = []
    L.append(f"# 1人実験の結果：{item}")
    L.append("")
    L.append(f"主要項目：{name}（{p.window.label}）　／　記録日数：{p.n_days}日　／　分析エンジン v{VERSION}")
    L.append("")

    L.append("## 結論")
    L.append("")
    if p.direction == 0:
        L.append(f"**{_neutral_label(p.v.p_better)}**")
        L.append("")
        L.append(f"あなたの記録では、飲んだ期間の方が「{name}」が高かった確率は **{_pct(p.v.p_better)}** でした。")
        L.append("")
    else:
        L.append(f"**{p.v.label}**")
        L.append("")
        L.append(f"あなたの記録では、飲んだ期間の方が「{name}」が良かった確率は **{_pct(p.v.p_better)}** でした。")
        L.append("")
        L.append(CLOSING[p.v.label])
        L.append("")

    L.append("## 数字で見る")
    L.append("")
    L.append(f"- 差の大きさ：平均 **{_diff(p)}**")
    if res.substance is not None and res.substance.pk is not None:
        L.append("  - 飲み続けて体内の量が安定したときの差です。飲み始めの数日と、やめた後に体に残っている数日は、残っている量に応じて計算に入れています。")
    mid = res.mid
    if p.direction != 0 and not p.log and mid:
        L.append(f"- {mid:g}{'点' if p.unit == '0〜10' else p.unit}以上良かった確率：{_pct(p.v.p_meaningful)}")
    L.append(f"- 前日の体調の引きずり：{p.v.rho_mean:.2f}（0なら毎日が独立、1に近いほど前日を強く引きずる）")
    L.append("")
    L.append("「90%の幅」は、本当の差がこの範囲に入っている見込みが90%という意味です。幅が0をまたいでいる場合は、差がない可能性も残っています。")
    L.append("")

    L.append("## 偶然と比べると")
    L.append("")
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
    s = res.substance
    if s is None:
        L.append("成分を指定していないため、飲んだ日=1・飲まない日=0 として計算しています。飲み始めや、やめた後に残る分は考慮していません。")
    else:
        L.append(f"- 成分：{s.name}")
        if s.pk is not None:
            rng = f"（個人差 {s.t_half_range_h[0]:g}〜{s.t_half_range_h[1]:g}時間）" if s.t_half_range_h else ""
            L.append(f"- 体内で半分になるまでの時間（半減期）：{s.pk.t_half_h:.3g}時間{rng}")
            if s.pk.tmax_h is not None:
                L.append(f"- 飲んでから最も濃くなるまで：約{s.pk.tmax_h:g}時間")
            L.append(f"- 飲む時刻 {res.dose_hour:g}時のとき、{p.window.label}に体に残っている量：1日の最高時の約{_pct(res.residual)}")
            L.append(f"- 実験の前に空ける日数の目安：{res.washout}日（半減期の{STEADY_HALF_LIVES}倍）")
        if s.note:
            L.append(f"- {s.note}")
        if res.suit:
            L.append(f"- 7日ずつ入れ替える実験への向き：**{res.suit['level']}**。{res.suit['text']}")
        if s.sources:
            L.append("- 数値の出典（{0}確認）：".format(s.checked))
            for lab, url in s.sources:
                L.append(f"  - [{lab}]({url})")
        else:
            L.append("- 数値は指定されたもので、出典を確認していません。")
    L.append("")

    if p.pd_table:
        L.append("## 記録に現れるまでの遅れ")
        L.append("")
        L.append("体に入った量は、すぐに記録に現れるとは限りません。働く場所に届き、体の反応が入れ替わるまでの遅れがあると、飲むのをやめた後も数日は記録に影響が残ります。この遅れの長さも、あなたの記録から推定しました。")
        L.append("")
        L.append("| 遅れ（半分になるまでの日数） | 見込み |")
        L.append("|---|---|")
        for h, pr in p.pd_table:
            L.append(f"| {'遅れなし' if h == 0 else f'{h:g}日'} | {_pct(pr)} |")
        L.append("")
        lag_p = 1 - p.pd_table[0][1]
        if lag_p >= 0.8:
            L.append(f"遅れがある見込みが{_pct(lag_p)}です。次に試すときは、飲まない期間の最初の数日を長めに取ると比べやすくなります。")
        elif lag_p <= 0.3:
            L.append("遅れはほとんど無いと見られます。")
        else:
            L.append("遅れがあるかどうかは、この記録からははっきりしません。")
        L.append("")
        L.append("前提：影響の大きさが体の中の量に比例する範囲で考えています（薬力学の作用部位モデル・間接反応モデルの考え方）。")
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
        L.append("| 項目 | 時間帯 | 差（飲み続けたとき） | 確率 |")
        L.append("|---|---|---|---|")
        for r in res.secondary:
            phrase, pr = _prob_phrase(r)
            L.append(f"| {r.label} | {r.window.label} | {_diff(r)} | {phrase} {_pct(pr)} |")
        L.append("")

    L.append("## 計算の確認")
    L.append("")
    dg = p.fit.diag or {}
    t = dg.get("treatment")
    if t:
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

    L.append("## この分析で言えないこと")
    L.append("")
    if not blinded:
        L.append("- 中身を知った上で飲んでいるため、「飲んだから」なのか「飲んだと分かっていたから」なのかは区別できません。区別するには、中身を隠す上級版が必要です。")
    L.append("- この結果はあなたの記録についてのものです。他の人に当てはまるかどうか、成分そのものの働きについては何も言えません。")
    L.append("- 体調が変わった理由を特定するものではありません。気になる症状がある場合は医療機関に相談してください。")
    L.append("")

    L.append("## 方法")
    L.append("")
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
