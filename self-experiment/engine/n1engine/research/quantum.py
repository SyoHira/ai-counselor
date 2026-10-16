"""研究層：質問の順番による回答の変化を、量子確率モデルで表して検証する。

背景
  2つの「はい／いいえ」の質問は、どちらを先に聞くかで答えの割合が変わる（質問順序効果）。
  量子認知の研究では、心の状態をベクトル、質問への答えを部分空間への射影（Lüders の規則）で表し、
  答えた後は状態がその部分空間に移ると考える。射影の順番を入れ替えると結果が変わるので、
  順序効果が自然に出る（Wang & Busemeyer 2013, Topics in Cognitive Science）。
  このモデルから、パラメータを使わずに「答えが食い違う確率は順番によらない」という
  QQ等式が導かれ、全米規模の調査70件で支持された（Wang 他 2014, PNAS）。
  一方、最も単純な2次元のモデルは「逆の条件付き確率が等しい」（Grand Reciprocity）も予測し、
  これは多くのデータで成り立たなかった（Boyer-Kassem 他 2016）。

ここで比べる4つのモデル（すべて同じデータに当てはめ、BIC で比べる）
  classical     順番に関係なく同じ同時確率（古典確率、パラメータ3）
  quantum2d     2次元の実ベクトル空間：状態の角度 θ と、2つの質問の軸のなす角 φ（パラメータ2）
                p(A=a の後 B=b) = |<a|ψ>|² |<b|a>|²
  qq_saturated  QQ等式だけを課し、ほかは自由（パラメータ5）。高次元の量子モデルの予測にあたる
  saturated     順番ごとに自由（パラメータ6）

結果の扱い
  どのモデルが選ばれても、その結果を公開する。顧客のレポートには使わない（README の昇格基準）。
"""

from __future__ import annotations

import numpy as np
from scipy.optimize import minimize
from scipy.stats import chi2

YES, NO = 0, 1
ORDERS = ("AB", "BA")


def table_from_records(qa, qb, order) -> np.ndarray:
    """日ごとの答え（1=はい、0=いいえ）と順番から、表 [順番, Aの答え, Bの答え] の件数を作る。"""
    t = np.zeros((2, 2, 2))
    for a, b, o in zip(qa, qb, order):
        if o not in ORDERS or a is None or b is None or np.isnan(a) or np.isnan(b):
            continue
        t[ORDERS.index(o), YES if a == 1 else NO, YES if b == 1 else NO] += 1
    return t


def _quantum_probs(theta: float, phi: float) -> np.ndarray:
    """2次元モデルの予測：[順番, Aの答え, Bの答え] の確率。"""
    psi = np.array([np.cos(theta), np.sin(theta)])
    A = [np.array([1.0, 0.0]), np.array([0.0, 1.0])]
    B = [np.array([np.cos(phi), np.sin(phi)]), np.array([-np.sin(phi), np.cos(phi)])]
    p = np.zeros((2, 2, 2))
    for a in (YES, NO):
        for b in (YES, NO):
            p[0, a, b] = (A[a] @ psi) ** 2 * (B[b] @ A[a]) ** 2  # A を先に
            p[1, a, b] = (B[b] @ psi) ** 2 * (A[a] @ B[b]) ** 2  # B を先に
    return p


def _ll(t: np.ndarray, p: np.ndarray) -> float:
    p = np.clip(p, 1e-12, 1)
    return float(np.sum(t * np.log(p)))


def fit_quantum2d(t: np.ndarray) -> dict:
    best = None
    for th0 in np.linspace(0.1, np.pi - 0.1, 7):
        for ph0 in np.linspace(0.1, np.pi - 0.1, 7):
            r = minimize(lambda x: -_ll(t, _quantum_probs(*x)), [th0, ph0], method="Nelder-Mead", options={"xatol": 1e-6, "fatol": 1e-8})
            if best is None or r.fun < best.fun:
                best = r
    th, ph = best.x
    return {"ll": -best.fun, "k": 2, "theta": float(th % np.pi), "phi": float(ph % np.pi), "probs": _quantum_probs(th, ph)}


def fit_classical(t: np.ndarray) -> dict:
    pooled = t.sum(axis=0)
    p = pooled / pooled.sum()
    return {"ll": _ll(t, np.stack([p, p])), "k": 3, "probs": np.stack([p, p])}


def fit_saturated(t: np.ndarray) -> dict:
    p = t / t.sum(axis=(1, 2), keepdims=True)
    return {"ll": _ll(t, p), "k": 6, "probs": p}


def fit_qq(t: np.ndarray) -> dict:
    """QQ等式（食い違う確率が順番によらない）を課した最尤推定。式で解ける。"""
    agree = np.array([[1, 0], [0, 1]], dtype=bool)
    d = t[:, ~agree].sum() / t.sum()
    p = np.zeros_like(t)
    for o in range(2):
        na, nd = t[o][agree].sum(), t[o][~agree].sum()
        p[o][agree] = (1 - d) * (t[o][agree] / na if na else 0.5)
        p[o][~agree] = d * (t[o][~agree] / nd if nd else 0.5)
    return {"ll": _ll(t, p), "k": 5, "probs": p}


def compare_models(t: np.ndarray) -> dict:
    n = t.sum()
    fits = {"classical": fit_classical(t), "quantum2d": fit_quantum2d(t), "qq_saturated": fit_qq(t), "saturated": fit_saturated(t)}
    table = {}
    for name, f in fits.items():
        table[name] = {"ll": f["ll"], "k": f["k"], "aic": 2 * f["k"] - 2 * f["ll"], "bic": f["k"] * np.log(n) - 2 * f["ll"]}
    sat = fits["saturated"]["ll"]
    disagree = t[:, [0, 1], [1, 0]].sum(axis=1) / t.sum(axis=(1, 2))
    return {
        "models": table,
        "best_bic": min(table, key=lambda m: table[m]["bic"]),
        "qq_lr_p": float(chi2.sf(2 * (sat - fits["qq_saturated"]["ll"]), 1)),
        "quantum2d_lr_p": float(chi2.sf(2 * (sat - fits["quantum2d"]["ll"]), 4)),
        "classical_lr_p": float(chi2.sf(2 * (sat - fits["classical"]["ll"]), 3)),
        "theta": fits["quantum2d"]["theta"],
        "phi": fits["quantum2d"]["phi"],
        "qq_q": float(disagree[0] - disagree[1]),
        "answers": int(n),
    }


def simulate_quantum(theta: float, phi: float, n_per_order: int, rng) -> np.ndarray:
    p = _quantum_probs(theta, phi)
    return np.stack([rng.multinomial(n_per_order, p[o].ravel()).reshape(2, 2) for o in range(2)]).astype(float)


def simulate_classical(p: np.ndarray, n_per_order: int, rng) -> np.ndarray:
    return np.stack([rng.multinomial(n_per_order, p).reshape(2, 2) for _ in range(2)]).astype(float)
