"""実験の設計：いつ飲むか（A=普段通り / B=飲む）と、毎日の質問の順番を決める。

設計の考え方
- 7日ずつ（または14日ずつ）の4期間（ABBA または BAAB）。期間を7日の倍数にして曜日をそろえる。真ん中で折り返す並びにすると、
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

# 月経周期のある人向けの56日（7日×8期間）。
# 28日の ABBA は「28日で1周する波」とほぼ同じ形になり、周期の長さが25〜35日のどれでも、
# どこから始めても、周期の時期と飲んだ期間の重なりが 0.89〜0.91 になる（エンジンで計算）。
# ABABBABA は重なりが 0.15 以下で、時間の流れとも偏らない（B の平均位置 = A の平均位置）。
CYCLE_SEQUENCES = ("ABABBABA", "BABAABAB")

# 量と反応の形を見る42日（7日×6期間、H = 半分の量）。前後対称なので、時間の流れが
# どの量にも均等にかかる（A・H・B それぞれの平均位置が同じ）。
DOSE_SEQUENCES = ("AHBBHA", "BHAAHB")
DOSE_OF_PHASE = {"A": 0.0, "H": 0.5, "B": 1.0}


# 2つの成分を掛け合わせる56日（7日×8期間、v0.5.0）。0=どちらも飲まない / 1=Aだけ / 2=Bだけ / 3=両方。
# 4条件の並びは Williams の方陣の行（どの条件も、他のどの条件の直後に1回ずつ来る）で、
# 後半は前半を逆順にする。逆順にすると4条件の平均位置がそろい（すべて3.5）、時間の流れが偏らない。
# 前半と後半で各条件が2回ずつ、持ち越しも偏らない。
FACTORIAL_SEQUENCES = ((0, 1, 3, 2, 2, 3, 1, 0), (1, 2, 0, 3, 3, 0, 2, 1))


@dataclass(frozen=True)
class FactorialDay:
    day: int
    levels: tuple[int, int]  # (Aを飲む=1, Bを飲む=1)
    rating_order: tuple[str, ...]
    pair_order: str


def make_factorial_schedule(block_len: int = 7, seed: int | None = None, swap: bool | None = None) -> list[FactorialDay]:
    """2つの成分 A・B を単独でも一緒でも試す56日の日程。swap で A と B の役を入れ替える（乱数で選ぶ）。"""
    if block_len % 7:
        raise ValueError("期間の長さは7日の倍数にする（曜日をそろえるため）")
    rng = random.Random(seed)
    seq = rng.choice(FACTORIAL_SEQUENCES)
    if swap is None:
        swap = rng.random() < 0.5
    days, n = [], 0
    for cond in seq:
        a, b = cond & 1, (cond >> 1) & 1
        if swap:
            a, b = b, a
        for _ in range(block_len):
            n += 1
            order = list(RATING_QUESTIONS)
            rng.shuffle(order)
            days.append(FactorialDay(n, (a, b), tuple(order), rng.choice(("AB", "BA"))))
    return days


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
    cycle: bool = False,
    dose_levels: bool = False,
) -> list[Day]:
    """実験の日程を作る。

    sequence を指定しなければ ABBA / BAAB のどちらかを乱数で選ぶ。
    cycle=True（月経周期を記録する人）なら ABABBABA / BABAABAB の56日から選ぶ。
    中身を隠す上級版では、本人にこの並びを見せない（家族などの協力者だけが知る）。
    """
    if block_len % 7:
        raise ValueError("期間の長さは7日の倍数にする（曜日をそろえるため）")
    rng = random.Random(seed)
    pool = DOSE_SEQUENCES if dose_levels else CYCLE_SEQUENCES if cycle else BALANCED_SEQUENCES
    seq = sequence or rng.choice(pool)
    if seq not in BALANCED_SEQUENCES + CYCLE_SEQUENCES + DOSE_SEQUENCES:
        raise ValueError(f"並びは {BALANCED_SEQUENCES + CYCLE_SEQUENCES + DOSE_SEQUENCES} のどれか: {seq}")

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
