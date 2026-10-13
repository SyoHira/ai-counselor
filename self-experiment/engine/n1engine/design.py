"""実験の設計：いつ飲むか（A=普段通り / B=飲む）と、毎日の質問の順番を決める。

設計の考え方
- 7日ずつの4期間（ABBA または BAAB）。真ん中で折り返す並びにすると、
  「時間とともに体調が少しずつ変わる」影響が、飲んだ期間と飲まない期間に
  均等にかかる。前半A・後半Bの単純な並びだと、時間の変化と飲んだ影響が区別できない。
- 質問の順番は毎日ランダムにする。順番で回答が偏ることは調査研究で確かめられている。
  順番は記録しておき、研究層（量子認知の検証）の材料にもする。
"""

from __future__ import annotations

from dataclasses import dataclass
import random

# 0〜10で答える質問。順番を毎日入れ替える。
RATING_QUESTIONS = ("outcome", "mood", "stress", "sleep")

# 研究層用の「はい／いいえ」の質問の組。順番だけを入れ替える。
BINARY_PAIR = ("qa", "qb")

BALANCED_SEQUENCES = ("ABBA", "BAAB")


@dataclass(frozen=True)
class Day:
    day: int  # 1始まり
    phase: str  # "A" = 普段通り, "B" = 飲む
    rating_order: tuple[str, ...]
    pair_order: str  # "AB" = qa→qb の順, "BA" = qb→qa の順


def make_schedule(
    block_len: int = 7,
    seed: int | None = None,
    sequence: str | None = None,
) -> list[Day]:
    """実験の日程を作る。

    sequence を指定しなければ ABBA / BAAB のどちらかを乱数で選ぶ。
    中身を隠す上級版では、本人にこの並びを見せない（家族などの協力者だけが知る）。
    """
    rng = random.Random(seed)
    seq = sequence or rng.choice(BALANCED_SEQUENCES)
    if seq not in BALANCED_SEQUENCES:
        raise ValueError(f"並びは {BALANCED_SEQUENCES} のどれか: {seq}")

    days = []
    n = 0
    for phase in seq:
        for _ in range(block_len):
            n += 1
            order = list(RATING_QUESTIONS)
            rng.shuffle(order)
            days.append(
                Day(
                    day=n,
                    phase=phase,
                    rating_order=tuple(order),
                    pair_order=rng.choice(("AB", "BA")),
                )
            )
    return days


def helper_sheet(days: list[Day], blinded: bool) -> str:
    """協力者用の割り付け表。中身を隠す場合は、本人ではなく協力者に渡す。"""
    lines = ["日\t渡すもの"]
    for d in days:
        if blinded:
            what = "本物のカプセル" if d.phase == "B" else "空のカプセル"
        else:
            what = "飲む" if d.phase == "B" else "飲まない（普段通り）"
        lines.append(f"{d.day}\t{what}")
    return "\n".join(lines)
