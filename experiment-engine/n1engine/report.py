"""レポートの下書き。担当者がコメントを添えて納品する。

言葉の決まり
- 「効果」「効く」「効力」を使わない。言えるのは「あなたの記録で出た差」だけ。
- 差がなかった場合も、失敗として書かない。それが分かったこと自体が結果。
- 病名・症状の診断に見える書き方をしない。
"""

from __future__ import annotations

from . import VERSION
from .model import Verdict

COVARIATE_LABELS = {
    "mood": "その日の気分",
    "stress": "その日のストレス",
    "sleep": "前夜の睡眠の質",
    "trend": "時間の流れ（季節や生活の変化）",
}

CLOSING = {
    "はっきり差がある": "記録の上では、飲んだ期間の方がはっきり良い結果でした。",
    "差がありそう": "記録の上では、飲んだ期間の方が良かった可能性があります。ただし、はっきりと言える水準には届いていません。",
    "はっきりしない": "記録の上では、飲んだ期間と飲まない期間の違いは、普段の揺れの範囲に収まっていました。これはあなたの体に合っていなかったという意味ではなく、この期間の記録からは違いが読み取れなかったという意味です。続けるかどうかを、気分ではなく記録をもとに決められる材料になります。",
    "悪い方向に差がありそう": "記録の上では、飲んだ期間の方が良くなかった可能性があります。",
    "悪い方向にはっきり差がある": "記録の上では、飲んだ期間の方がはっきり良くない結果でした。続けるかどうか見直す材料になります。",
}


def _pct(x: float) -> str:
    return f"{round(x * 100)}%"


def render(
    *,
    item: str,
    outcome_label: str,
    v: Verdict,
    n_days: int,
    n_pairs: int,
    covariates: list[str],
    null: dict,
    mid: float,
    priors: dict,
    blinded: bool,
    blind: dict | None = None,
    belief: dict | None = None,
) -> str:
    L = []
    L.append(f"# 1人実験の結果：{item}")
    L.append("")
    L.append(f"記録した項目：{outcome_label}　／　記録日数：{n_days}日　／　分析エンジン v{VERSION}")
    L.append("")

    L.append("## 結論")
    L.append("")
    L.append(f"**{v.label}**")
    L.append("")
    L.append(f"あなたの記録では、飲んだ期間の方が「{outcome_label}」が良かった確率は **{_pct(v.p_better)}** でした。")
    L.append("")
    L.append(CLOSING[v.label])
    L.append("")

    L.append("## 数字で見る")
    L.append("")
    L.append(f"- 差の大きさ：平均 **{v.effect_mean:+.1f}点**（90%の幅：{v.effect_low:+.1f}〜{v.effect_high:+.1f}点）")
    L.append(f"- {mid:g}点以上良かった確率：{_pct(v.p_meaningful)}")
    L.append(f"- 前日の体調の引きずり：{v.rho_mean:.2f}（0なら毎日が独立、1に近いほど前日を強く引きずる）")
    L.append("")
    L.append("「90%の幅」は、本当の差がこの範囲に入っている見込みが90%という意味です。幅が0をまたいでいる場合は、差がない可能性も残っています。")
    L.append("")

    L.append("## 偶然と比べると")
    L.append("")
    if null["observed_diff"] <= 0:
        L.append("飲んだ期間の平均は、飲まない期間の平均を上回っていませんでした。")
    elif null["rate"] == 0:
        L.append("あなたの普段の揺れ方で、差がゼロの記録を何千回も作ってみたところ、この大きさの差は一度も出ませんでした。")
    else:
        L.append(f"あなたの普段の揺れ方で、差がゼロの記録を何千回も作ってみると、この程度の差は**約{null['one_in']:.0f}回に1回**は偶然でも出ます。")
    L.append("")

    L.append("## そろえて比べたもの")
    L.append("")
    L.append("飲んだかどうか以外で記録を動かしうるものは、分析の中で差し引いています。")
    L.append("")
    for c in ["trend", *covariates]:
        L.append(f"- {COVARIATE_LABELS.get(c, c)}")
    L.append("- 前日の体調の引きずり")
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
    L.append(f"- 設計：7日ずつ4期間、飲む期間と飲まない期間を折り返す順番で配置（推定に使えた連続した日のペア：{n_pairs}組）")
    L.append("- 分析：前日の引きずりを含めたベイズ回帰。時間の流れと上記の項目を同時に考慮")
    L.append(f"- 事前の前提：差は0を中心に±{priors['treatment_sd']:g}点程度（控えめな前提。実験前に固定）")
    L.append("- 判定基準：良かった確率95%以上で「はっきり差がある」、80%以上で「差がありそう」")
    L.append(f"- 分析エンジン v{VERSION}。答えの分かっている偽データ800件で、判定の誤りの割合と幅の正しさを検証済み")
    L.append("")

    L.append("## コメント")
    L.append("")
    L.append("<!-- ここに担当者のコメントを書く -->")
    L.append("")
    return "\n".join(L)
