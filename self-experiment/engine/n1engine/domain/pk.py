"""薬物動態学（PK）：飲んだ成分が、記録の時間帯に体の中にどれだけ残っているか。

モデル
  1コンパートメントの経口吸収モデル（Bateman式）。1回飲んだ後の濃度は

      C(τ) = ka / (ka − ke) × ( e^(−ke·τ) − e^(−ka·τ) )      τ = 飲んでからの時間

  ke = ln2 / 半減期（消える速さ）、ka = 吸収の速さ（最高濃度に達する時間 Tmax から逆算）。
  毎日飲むと前日の残りに上乗せされる（重ね合わせ）。量・体重・体積は扱わず、形だけを使う。

曝露量（判定に使う値）
  記録の時間帯（その夜 23時〜翌7時、日中 9時〜21時 など）の平均濃度を、
  「毎日飲み続けて安定した状態（定常状態）」の同じ時間帯の平均濃度で割ったもの。

    1.0 = 飲み続けて安定したときと同じだけ残っている
    0.0 = まったく残っていない

  こうすると判定の数字は「飲み続けて安定したときの差」になる。飲み始めの数日や、
  やめた後に残っている数日（持ち越し）を、0/1 の決め打ちではなく量として扱える。

前提（レポートに書く）
  - 実験開始前は飲んでいない（飲んでいた場合は、半減期の5倍以上空けてから始める）
  - 体の中の量と、記録への影響が比例する。実際には、量が消えた後も影響が残る成分がある
    （薬力学の持ち越し）。この前提は検証で崩して確かめる（CALIBRATION.md）
  - 半減期には個人差がある（カフェインで 1.5〜9.5 時間）。代表値を使い、ずれたときの
    影響を検証で測る
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

LN2 = math.log(2)
STEP_H = 0.25  # 濃度を計算する時間の刻み（時間）
STEADY_HALF_LIVES = 5  # 半減期の5倍で定常状態の約97%に達する／体からほぼ消える


@dataclass(frozen=True)
class PK:
    """体内動態の数値。tmax_h が None のときは、吸収を一瞬とみなす（半減期が日〜週単位の成分）。"""

    t_half_h: float
    tmax_h: float | None = None

    @property
    def ke(self) -> float:
        return LN2 / self.t_half_h

    @property
    def ka(self) -> float | None:
        return None if self.tmax_h is None else ka_from_tmax(self.tmax_h, self.t_half_h)

    @property
    def steady_days(self) -> float:
        """定常状態の約97%に達するまで、またはやめてからほぼ消えるまでの日数。"""
        return STEADY_HALF_LIVES * self.t_half_h / 24


@dataclass(frozen=True)
class Window:
    """記録が表す時間帯。0時起点の時間。翌朝7時は 31。"""

    start_h: float
    end_h: float
    label: str


def window_for(timing: str, bedtime: float = 23.0, waketime: float = 7.0) -> Window:
    if timing == "night":
        return Window(bedtime, 24 + waketime, f"その夜（{bedtime:g}時〜翌{waketime:g}時）")
    if timing == "day":
        return Window(9.0, 21.0, "日中（9時〜21時）")
    raise ValueError(f"timing は night か day: {timing}")


def ka_from_tmax(tmax_h: float, t_half_h: float) -> float:
    """最高濃度に達する時間 Tmax = ln(ka/ke)/(ka−ke) を ka について解く。"""
    ke = LN2 / t_half_h
    if tmax_h >= 1 / ke:
        raise ValueError(f"Tmax {tmax_h}時間 は、半減期 {t_half_h}時間 の成分では取りえません（{1 / ke:.2f}時間未満）")

    def tmax_of(ka):
        return math.log(ka / ke) / (ka - ke)

    lo, hi = ke * (1 + 1e-9), 1e4
    for _ in range(200):  # tmax_of は ka について単調に減る
        mid = math.sqrt(lo * hi)
        if tmax_of(mid) > tmax_h:
            lo = mid
        else:
            hi = mid
    return math.sqrt(lo * hi)


def _single(tau: np.ndarray, pk: PK) -> np.ndarray:
    """1回飲んだ後、τ時間後の濃度（量・体積は1）。"""
    tau = np.asarray(tau, dtype=float)
    out = np.zeros_like(tau)
    m = tau >= 0
    if pk.ka is None:
        out[m] = np.exp(-pk.ke * tau[m])
    else:
        ka, ke = pk.ka, pk.ke
        out[m] = ka / (ka - ke) * (np.exp(-ke * tau[m]) - np.exp(-ka * tau[m]))
    return out


def _steady(tau: np.ndarray, pk: PK, period: float = 24.0) -> np.ndarray:
    """毎日同じ時刻に飲み続けた定常状態で、最後に飲んでから τ 時間後の濃度（0 ≤ τ < 24）。"""
    ke = pk.ke
    if pk.ka is None:
        return np.exp(-ke * tau) / (1 - np.exp(-ke * period))
    ka = pk.ka
    return ka / (ka - ke) * (np.exp(-ke * tau) / (1 - np.exp(-ke * period)) - np.exp(-ka * tau) / (1 - np.exp(-ka * period)))


def _window_grid(w: Window) -> np.ndarray:
    return np.arange(w.start_h, w.end_h, STEP_H) + STEP_H / 2


def steady_window_mean(pk: PK, dose_hour: float, w: Window) -> float:
    tau = np.mod(_window_grid(w) - dose_hour, 24.0)
    return float(_steady(tau, pk).mean())


def steady_peak(pk: PK) -> float:
    return float(_steady(np.arange(0, 24, STEP_H / 4), pk).max())


def residual_share(pk: PK, dose_hour: float, w: Window) -> float:
    """定常状態で、記録の時間帯に残っている平均の量（1日の最高濃度に対する割合）。

    曝露量は時間帯ごとに 1.0 にそろえてしまうので、「そもそもその時間帯にどれだけ残るか」は
    これで別に示す。例：カフェインを15時に飲むと、その夜にも最高濃度の数十%が残る。
    """
    return steady_window_mean(pk, dose_hour, w) / steady_peak(pk)


def fill_phases(day: np.ndarray, treat: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """記録が抜けた日の「飲んだかどうか」を補う。期間は続いているので前後の日から埋める。"""
    day = np.asarray(day, dtype=int)
    full = np.arange(1, int(day.max()) + 1)
    t = np.full(len(full), -1)
    t[day - 1] = np.asarray(treat, dtype=int)
    for i in range(len(t)):  # 前の日から
        if t[i] < 0 and i > 0 and t[i - 1] >= 0:
            t[i] = t[i - 1]
    for i in range(len(t) - 2, -1, -1):  # 初日が抜けていたら後ろから
        if t[i] < 0:
            t[i] = t[i + 1]
    return full, t


def daily_exposure(
    day: np.ndarray,
    treat: np.ndarray,
    pk: PK,
    dose_hour: float,
    w: Window,
    dose_hours: np.ndarray | None = None,
    taken: np.ndarray | None = None,
    amounts: np.ndarray | None = None,
) -> np.ndarray:
    """記録した各日の曝露量（定常状態=1.0）。

    day, treat は記録のある日だけでよい（抜けた日は前後から補う）。
    dose_hours に実際に飲んだ時刻が入っていればそれを使い、無い日は予定の dose_hour を使う。
    taken が 0 の日（飲む日に飲み忘れた日）は、その日の分を体内量に入れない。
    amounts はその日の量（いつもの量 = 1、半分 = 0.5）。体内量は量に比例する（1コンパートメントの線形性）。
    判定は「飲む日」「飲まない日」の割り付けのまま行い、体内量だけを実際に合わせる。
    """
    day = np.asarray(day, dtype=int)
    full, t = fill_phases(day, treat)
    hours = np.full(len(full), float(dose_hour))
    if dose_hours is not None:
        dh = np.asarray(dose_hours, dtype=float)
        for d, h in zip(day, dh):
            if not np.isnan(h):
                hours[d - 1] = h
    skip = set()
    if taken is not None:
        skip = {int(d) for d, k in zip(day, np.asarray(taken, dtype=float)) if k == 0}
    doses = np.array([(d - 1) * 24 + hours[d - 1] for d in full if t[d - 1] == 1 and d not in skip])
    amt = np.ones(len(full))
    if amounts is not None:
        for d, a in zip(day, np.asarray(amounts, dtype=float)):
            if not np.isnan(a):
                amt[d - 1] = a
    dose_amt = np.array([amt[d - 1] for d in full if t[d - 1] == 1 and d not in skip])

    ref = steady_window_mean(pk, dose_hour, w)
    out = np.zeros(len(day))
    grid = _window_grid(w)
    for i, d in enumerate(day):
        times = (d - 1) * 24 + grid
        if len(doses):
            c = (dose_amt[:, None] * _single(times[None, :] - doses[:, None], pk)).sum(axis=0)
            out[i] = c.mean() / ref
    return out


def exposure_contrast(pk: PK, block_len: int, dose_hour: float, w: Window) -> float:
    """7日ずつ ABBA で入れ替えたとき、飲む期間と飲まない期間の曝露量の平均の差。

    1.0 なら 0/1 で切り替わるのと同じだけの差がつく。持ち越しが大きいほど小さくなり、
    差を見つけるのに必要な日数はおよそ (1/この値)² 倍になる。
    """
    seq = "ABBA"
    treat = np.repeat([1 if p == "B" else 0 for p in seq], block_len)
    day = np.arange(1, len(treat) + 1)
    e = daily_exposure(day, treat, pk, dose_hour, w)
    return float(e[treat == 1].mean() - e[treat == 0].mean())


SUITABLE, CAUTION, UNSUITABLE, UNKNOWN = "向いている", "持ち越しを計算に入れて実施", "7日ずつの入れ替えには向かない", "体内動態を計算に入れられない"


def suitability(pk: PK | None, dose_hour: float, w: Window, block_len: int = 7, steady_days: tuple[float, float] | None = None) -> dict:
    """この成分を、block_len 日ずつ入れ替える1人実験で調べられるか。

    しきい値（0.85 / 0.5）はこのエンジンの設計上の決めごとで、文献の値ではない。
    0.85 は必要日数の増え方が約1.4倍以内、0.5 は約4倍に相当する。
    """
    if pk is None:
        if steady_days and steady_days[0] > block_len:
            return {"level": UNSUITABLE, "contrast": None, "steady_days": steady_days,
                    "text": f"体内で安定するまでに{steady_days[0]:g}〜{steady_days[1]:g}日かかり、{block_len}日ずつ入れ替えても体内の量がほとんど変わらない。"}
        return {"level": UNKNOWN, "contrast": None, "steady_days": steady_days,
                "text": "単純な半減期で表せないため、飲んだ日=1・飲まない日=0 として扱う（v0.1.0 と同じ）。"}
    c = exposure_contrast(pk, block_len, dose_hour, w)
    level = SUITABLE if c >= 0.85 else CAUTION if c >= 0.5 else UNSUITABLE
    better = None
    if level != SUITABLE:
        for bl in (14, 21, 28):
            if bl > block_len and exposure_contrast(pk, bl, dose_hour, w) >= 0.85:
                better = bl
                break
    text = f"飲む期間と飲まない期間の体内量の差は、0/1で切り替わる場合の{c:.0%}。"
    if level != SUITABLE:
        factor = 1 / max(c, 1e-6) ** 2
        text += f"差を見つけるのに必要な日数はおよそ{factor:.1f}倍になる。" if factor < 10 else "差を見つけるのに必要な日数が10倍を超え、現実的でない。"
        text += f"{better}日ずつなら85%以上になる。" if better else "28日ずつでも85%に届かない。"
    return {"level": level, "contrast": c, "steady_days": (pk.steady_days, pk.steady_days), "better_block": better, "text": text}


def washout_days(pk: PK) -> int:
    """実験の前に空ける日数の目安（半減期の5倍）。薬力学の持ち越しは含まない。"""
    return max(1, math.ceil(pk.steady_days))
