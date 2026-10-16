"""薬力学（PD）の持ち越し：体内量が記録に現れるまでの遅れ。

なぜ必要か
  薬物動態（pk.py）は「体の中にどれだけあるか」を計算する。しかし記録（睡眠・気分）に
  現れるのは、その量が働く場所に届き、体の反応が入れ替わった後になる。
  そのため、体内量が消えた後も記録への影響が残ることがある。v0.2.0 はこれを測っていなかった。

モデル
  薬力学でこの遅れを表す代表的な2つのモデルは、どちらも、影響が小さく比例する範囲では
  「体内量の一次の遅れ」という同じ形になる。

  - 効果コンパートメント（Sheiner 1979）：血中から「働く場所」へ一次の速さ ke0 で移る。
  - 間接反応モデル（Dayneka, Garg, Jusko 1993）：体の反応が作られ（kin）、
    一次の速さ kout で消える。成分はその作られ方か消え方を変える。

  1日ごとの記録では、1日の中の体内量を一定とみなすと、一次の遅れは次の形で正確に書ける。

      記録に届く量(今日) = λ × 記録に届く量(昨日) + (1 − λ) × 体内量(今日)
      λ = 0.5^(1 / 遅れの半減期[日])

  遅れの半減期 0日 は「遅れなし」（v0.2.0 と同じ）。安定した状態では、どの遅れでも 1.0 になるので、
  判定の「差」は引き続き「飲み続けて安定したときの差」を表す。

  これは N-of-1 試験で持ち越しを推定する分布ラグモデル（Liao 他、arXiv 2112.13991）の、
  ラグの形を一次の遅れに絞った場合にあたる。28〜56日の記録で、ラグを日ごとに自由に
  推定するのは不安定なので、遅れの長さ1つだけを推定する。

遅れの長さの決め方
  候補（0, 0.5, 1, 2, 3, 5, 7日）ごとに曝露量の列を作り、ギブスサンプリングの中で
  データに合う候補を選び直す（model.fit の treat_options）。
  事前の重みは「遅れなし」に 0.75、残りの6つに等しく分ける。このエンジンの決めごと（文献の値ではない）。
  0.5・0.75・0.9・1.0（遅れを考えない）を偽データで比べて決めた（CALIBRATION.md v0.3.0）：
  0.5 では遅れが無いときの検出が 50% → 37% に落ち、0.75 では 47% にとどまり、
  2日の遅れがあるときの推定は 0.62（遅れを考えない）→ 0.78 に戻った。

限界
  - 影響が量に比例する範囲を前提にしている。飽和（Emax）は、飲む量が1種類しかない
    1人実験では推定できない。
  - 遅れの候補は7つに限っている。7日より長い遅れは「7日」に寄せて推定される。
"""

from __future__ import annotations

import numpy as np

PD_HALF_DAYS = (0.0, 0.5, 1.0, 2.0, 3.0, 5.0, 7.0)
PRIOR_NO_LAG = 0.75


def lam(half_days: float) -> float:
    return 0.0 if half_days <= 0 else float(0.5 ** (1.0 / half_days))


def lag_filter(x: np.ndarray, half_days: float) -> np.ndarray:
    """1日ごとの体内量 x（1日目から連続）に、一次の遅れをかける。開始前は 0。"""
    lm = lam(half_days)
    out = np.empty(len(x))
    z = 0.0
    for t, v in enumerate(np.asarray(x, dtype=float)):
        z = lm * z + (1 - lm) * v
        out[t] = z
    return out


def options(x_full: np.ndarray, halves=PD_HALF_DAYS) -> np.ndarray:
    """遅れの候補ごとの曝露量（行=候補、列=1日目からの日）。"""
    return np.vstack([lag_filter(x_full, h) for h in halves])


def log_prior(halves=PD_HALF_DAYS, p0: float = PRIOR_NO_LAG) -> np.ndarray:
    k = len(halves) - 1
    return np.log(np.array([p0] + [(1 - p0) / k] * k))


def posterior_table(lag_draws: np.ndarray, halves=PD_HALF_DAYS) -> list[tuple[float, float]]:
    """遅れの半減期ごとの事後確率。"""
    n = len(lag_draws)
    return [(h, float(np.sum(lag_draws == i) / n)) for i, h in enumerate(halves)]
