"""計算が落ち着いているかの確認（収束診断）。

推定を、出発点を変えて4本並行に走らせ、4本が同じ答えに落ち着いているかを見る。
  R̂（アールハット）  4本の間のばらつき ÷ 各本の中のばらつき。1.01 未満なら落ち着いている
  ESS（有効な回数）   前後の推定が似ている分を差し引いた、実質の推定回数。400 以上を目安にする
基準は Vehtari 他 2021（順位で正規化した分割 R̂）の推奨値。
"""

from __future__ import annotations

import numpy as np
from scipy.stats import norm, rankdata

RHAT_MAX = 1.01
ESS_MIN = 400


def _split(chains: np.ndarray) -> np.ndarray:
    m, n = chains.shape
    h = n // 2
    return np.vstack([chains[:, :h], chains[:, n - h:]])


def _rank_normal(x: np.ndarray) -> np.ndarray:
    r = rankdata(x.ravel(), method="average").reshape(x.shape)
    return norm.ppf((r - 3 / 8) / (x.size + 1 / 4))


def _rhat_basic(x: np.ndarray) -> float:
    m, n = x.shape
    W = x.var(axis=1, ddof=1).mean()
    B = n * x.mean(axis=1).var(ddof=1)
    var_plus = (n - 1) / n * W + B / n
    return float(np.sqrt(var_plus / W)) if W > 0 else float("nan")


def rhat(chains: np.ndarray) -> float:
    """順位で正規化した分割 R̂。中心のずれと裾のずれの大きい方。"""
    s = _split(np.asarray(chains, dtype=float))
    bulk = _rhat_basic(_rank_normal(s))
    folded = np.abs(s - np.median(s))
    tail = _rhat_basic(_rank_normal(folded))
    return max(bulk, tail)


def _autocov(x: np.ndarray) -> np.ndarray:
    n = len(x)
    x = x - x.mean()
    f = np.fft.rfft(x, 2 * n)
    ac = np.fft.irfft(f * np.conj(f))[:n] / n
    return ac


def ess(chains: np.ndarray) -> float:
    """中心（平均）についての有効な回数（bulk-ESS）。Geyer の打ち切りを使う。"""
    z = _rank_normal(_split(np.asarray(chains, dtype=float)))
    m, n = z.shape
    acov = np.array([_autocov(c) for c in z])
    W = (acov[:, 0] * n / (n - 1)).mean()
    var_plus = W * (n - 1) / n + z.mean(axis=1).var(ddof=1)
    rho = 1 - (W - acov.mean(axis=0)) / var_plus
    rho[0] = 1.0
    tau = 0.0
    prev = np.inf
    t = 0
    while t + 1 < n:
        p = rho[t] + rho[t + 1]
        if p < 0:
            break
        p = min(p, prev)  # 単調に減るように
        tau += p
        prev = p
        t += 2
    tau = 2 * tau - 1
    return float(m * n / max(tau, 1e-9))


def check(chains: np.ndarray) -> dict:
    r, e = rhat(chains), ess(chains)
    return {"rhat": r, "ess": e, "ok": bool(r < RHAT_MAX and e >= ESS_MIN)}
