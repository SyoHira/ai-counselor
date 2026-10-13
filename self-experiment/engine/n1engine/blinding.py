"""中身を隠して飲む上級版の確認。

確認すること
1. 中身を見抜けていなかったか
   本人の「今日は本物を飲んだと思う」が、実際の中身と半々より多く一致していたら、
   隠しきれていなかった可能性がある。中身を隠した191人の研究でも、
   72%が自分の飲んだものを当てていた（Szigeti 他 2021, eLife）。
2. 思い込みと記録の関係
   同じ研究では「本物を飲んだと思ったか」の方が、実際の中身より結果をよく予測した。
   実際の中身をそろえた上で、思い込みが記録とどれだけ関係していたかを出す。

注意：思い込みは「飲んだもの」の影響を受けて変わりうる。だから思い込みで
飲んだ差を補正し直すことはしない（補正すると飲んだ差の一部まで消してしまう）。
関係の大きさを並べて見せるだけにとどめる。
"""

from __future__ import annotations

import numpy as np
from scipy import stats


def blind_integrity(belief: np.ndarray, treat: np.ndarray) -> dict:
    ok = ~np.isnan(belief)
    b = belief[ok].astype(int)
    t = treat[ok].astype(int)
    n = len(b)
    if n == 0:
        return {"n": 0}
    correct = int((b == t).sum())
    test = stats.binomtest(correct, n, 0.5, alternative="greater")
    return {
        "n": n,
        "accuracy": correct / n,
        "p_value": float(test.pvalue),
        # 半々より有意に多く当てていたら、隠しきれていなかった可能性がある
        "likely_broken": bool(test.pvalue < 0.05),
    }


def belief_association(y: np.ndarray, treat: np.ndarray, belief: np.ndarray) -> dict:
    """実際の中身をそろえた上で、思い込みと記録の関係を最小二乗で見る（目安）。"""
    ok = ~np.isnan(y) & ~np.isnan(belief)
    if ok.sum() < 6:
        return {}
    X = np.column_stack([np.ones(ok.sum()), treat[ok], belief[ok]])
    coef, *_ = np.linalg.lstsq(X, y[ok], rcond=None)
    return {"treatment_coef": float(coef[1]), "belief_coef": float(coef[2])}
