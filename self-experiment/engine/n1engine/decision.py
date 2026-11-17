"""続ける・やめるの判断材料（v0.5.0 の判定の上に載せる文章。分析の計算は変えない）。

売るもの
  「差があったか」ではなく、「このサプリに払い続ける根拠が、あなたの記録に出たか」。
  お客さんが申し込み時に書いた月額（円）と、判定の結果（良かった確率・意味のある大きさ・90%の幅）を並べる。
  「はっきりしない」も、「払い続ける根拠は、この記録では見つからなかった」という情報になる。

言わないこと
  ・やめることを勧めない（成分を勧めも止めもしない。決めるのはご本人）
  ・「差が無い」と言い切らない。見つからなかった場合は、90%の幅の上端（差があったとしても、この範囲内）を添える
  ・成分そのものの働きを言わない（この記録のこの人の差だけ）
"""

from __future__ import annotations

import math
from dataclasses import dataclass

GOOD, SMALL, MAYBE, UNCLEAR, BAD = "good", "small", "maybe", "unclear", "bad"


@dataclass
class Decision:
    kind: str
    headline: str  # 1行の見出し
    body: str  # 説明（1〜2文）
    edge: float  # 良い方向の差の、90%の幅の上端（元の単位の大きさ）


def classify(v, mid: float | None, direction: int) -> str | None:
    """判定の種類。良し悪しを決めない項目（direction=0）は None。"""
    if direction == 0:
        return None
    if v.p_better >= 0.95 and v.effect_low > 0:
        return GOOD if (mid is None or mid <= 0 or v.p_meaningful >= 0.80) else SMALL
    if v.p_better <= 0.05:
        return BAD
    if v.p_better >= 0.80:
        return MAYBE
    return UNCLEAR


def _edge_text(edge: float, unit: str, log: bool) -> str:
    if log:
        return f"{(math.exp(max(edge, 0)) - 1) * 100:.0f}%"
    nd = 1 if unit in ("点", "拍/分", "%") else 0
    return f"{max(edge, 0):.{nd}f}{unit}"


def decide(v, mid: float | None, direction: int, unit: str, log: bool = False) -> Decision | None:
    kind = classify(v, mid, direction)
    if kind is None:
        return None
    edge = _edge_text(v.effect_high, unit, log)
    if kind == GOOD:
        if mid:
            body = f"良い方向の差が、意味のある大きさ以上である確率は {round(v.p_meaningful * 100)}% でした。"
        else:  # 分・拍/分などの項目は、意味のある大きさの基準を決めていない
            body = f"良い方向の差があった確率は {round(v.p_better * 100)}% でした（この項目では、意味のある大きさの基準は決めていません）。"
        return Decision(kind, "続ける根拠が、あなたの記録に出ています", body, v.effect_high)
    if kind == SMALL:
        return Decision(kind, "良い方向の差は出ていますが、小さい可能性があります",
                        f"差は良い方向で、はっきり出ていました。ただ、意味のある大きさ以上と言える確率は {round(v.p_meaningful * 100)}% にとどまります。", v.effect_high)
    if kind == BAD:
        return Decision(kind, "飲んだ期間の方が、記録は良くない方向でした",
                        "払い続ける根拠は、この記録からは見つかりませんでした。気になる症状がある場合は、医療機関にご相談ください。", v.effect_high)
    if kind == MAYBE:
        return Decision(kind, "良い方向の可能性はありますが、払い続ける根拠と言えるほどではありません",
                        f"良い方向の差があったとしても、90%の見込みで {edge}以内です。", v.effect_high)
    return Decision(kind, "払い続ける根拠は、この記録では見つかりませんでした",
                    f"差が無いとは言い切れません。良い方向の差があったとしても、90%の見込みで {edge}以内です。", v.effect_high)


def yen(x: float) -> str:
    return f"{int(round(x)):,}円"


def money_lines(monthly: float) -> list[str]:
    return [f"月 {yen(monthly)}　→　1年で {yen(monthly * 12)}"]


FOOT = ("続けるか・やめるかは、この記録のほか、このサプリを飲む目的や体調を踏まえて、ご自身で決めてください。"
        "この記録は、あなたの期間・あなたの記録での結果で、成分そのものの働きを示すものではありません。")


def section(L: list[str], rows: list[tuple[str, float, Decision | None]]) -> None:
    """レポートの Markdown に「続けるか・やめるかの材料」の節を足す。rows=（呼び名, 月額, 判断）。"""
    L.append("## 続けるか・やめるかの材料")
    L.append("")
    L.append("お申し込みのときに書いていただいた月額と、記録の結果を並べました。")
    L.append("")
    if len(rows) == 1:
        label, monthly, d = rows[0]
        L.append(f"- {label}：" + money_lines(monthly)[0])
        if d is None:
            L.append("- この項目は良し悪しを決めないため、払い続ける根拠の判断は付けていません。")
        else:
            L.append(f"- **{d.headline}**")
            L.append(f"  - {d.body}")
        L.append("")
    else:
        L.append("| 条件 | 月額 | 1年の支払い | 記録の結果 |")
        L.append("|---|---|---|---|")
        for label, monthly, d in rows:
            L.append(f"| {label} | {yen(monthly)} | {yen(monthly * 12)} | {d.headline if d else '良し悪しを決めない項目'} |")
        L.append("")
        for label, monthly, d in rows:
            if d:
                L.append(f"- {label}：{d.body}")
        L.append("")
    L.append(FOOT)
    L.append("")
