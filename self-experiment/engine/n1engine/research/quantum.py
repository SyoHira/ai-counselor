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


# ---------------------------------------------------------------- 複数人の階層モデル（v0.4.0）
#
# 1人分の答え（各順番14件ほど）では、古典と量子を見分けられない。そこで、
#   - 質問の軸のなす角 φ は質問そのものの性質なので、全員で共通
#   - 状態の角度 θ_i は人ごとに違い、全体の分布 正規(m, s²) から出る
# と考え、全員の答えを同時に使って φ・m・s を推定し、その上で各人の θ_i を推定する
# （経験ベイズ。θ は格子の上で数え上げるので近似が入らない）。
# 鏡に映した解（θ→π−θ, φ→π−φ）は同じ予測になるので、φ は 0〜π/2 に限る。
# 古典の側も同じく階層にする：各人の同時確率 p_i ~ ディリクレ(α p̄)（順番に関係なし）。

THETA_GRID = np.linspace(0, np.pi, 181)[:-1] + np.pi / 360


def _probs_grid(phi: float, theta=THETA_GRID) -> np.ndarray:
    """θ の格子すべてについての予測 [格子, 順番, Aの答え, Bの答え]（_quantum_probs を式で展開したもの）。"""
    c2, s2 = np.cos(theta) ** 2, np.sin(theta) ** 2
    cd2, sd2 = np.cos(theta - phi) ** 2, np.sin(theta - phi) ** 2
    cf2, sf2 = np.cos(phi) ** 2, np.sin(phi) ** 2
    p = np.empty((len(theta), 2, 2, 2))
    p[:, 0, 0, 0], p[:, 0, 0, 1], p[:, 0, 1, 0], p[:, 0, 1, 1] = c2 * cf2, c2 * sf2, s2 * sf2, s2 * cf2
    p[:, 1, 0, 0], p[:, 1, 1, 0], p[:, 1, 0, 1], p[:, 1, 1, 1] = cd2 * cf2, cd2 * sf2, sd2 * sf2, sd2 * cf2
    return p


def _person_ll_grid(t: np.ndarray, phi: float) -> np.ndarray:
    """1人分の表について、θ の格子ごとの対数尤度。"""
    p = np.clip(_probs_grid(phi), 1e-12, 1)
    return np.tensordot(np.log(p), t, axes=([1, 2, 3], [0, 1, 2]))


def _log_prior_grid(m: float, s: float) -> np.ndarray:
    lp = -0.5 * ((THETA_GRID - m) / s) ** 2
    return lp - np.log(np.sum(np.exp(lp - lp.max()))) - lp.max()


def fit_quantum_hier(tables: list[np.ndarray]) -> dict:
    from scipy.special import logsumexp

    def neg(params, cache={}):
        phi, m, ls = params
        if not (0.01 < phi < np.pi / 2 and 0 < m < np.pi and -4 < ls < 1.5):
            return 1e12
        key = round(phi, 6)
        if key not in cache:
            cache.clear()
            cache[key] = [_person_ll_grid(t, phi) for t in tables]
        lp = _log_prior_grid(m, np.exp(ls))
        return -sum(logsumexp(lp + ll) for ll in cache[key])

    best = None
    for phi0 in (0.3, 0.7, 1.1, 1.4):
        for m0 in (0.5, 1.5, 2.5):
            r = minimize(neg, [phi0, m0, np.log(0.3)], method="Nelder-Mead", options={"xatol": 1e-4, "fatol": 1e-6, "maxiter": 400})
            if best is None or r.fun < best.fun:
                best = r
    phi, m, ls = best.x
    lp = _log_prior_grid(m, np.exp(ls))
    people = []
    for t in tables:
        ll = _person_ll_grid(t, phi)
        w = np.exp(lp + ll - np.max(lp + ll))
        w /= w.sum()
        th_mean = float(np.sum(w * THETA_GRID))
        cdf = np.cumsum(w)
        lo, hi = THETA_GRID[np.searchsorted(cdf, 0.05)], THETA_GRID[min(np.searchsorted(cdf, 0.95), len(THETA_GRID) - 1)]
        pred = np.tensordot(w, _probs_grid(phi), axes=1)
        people.append({"theta": th_mean, "theta_low": float(lo), "theta_high": float(hi), "pred": pred})
    return {"loglik": -best.fun, "k": 3, "phi": float(phi), "m": float(m), "s": float(np.exp(ls)), "people": people}


def fit_classical_hier(tables: list[np.ndarray]) -> dict:
    from scipy.special import gammaln

    counts = [t.sum(axis=0).ravel() for t in tables]  # 順番に関係なしなので2つの順番を足す

    def neg(params):
        z = np.r_[params[:3], 0.0]
        pbar = np.exp(z - z.max())
        pbar /= pbar.sum()
        a = np.exp(params[3])
        tot = 0.0
        for c in counts:
            tot += gammaln(a) - gammaln(a + c.sum()) + np.sum(gammaln(a * pbar + c) - gammaln(a * pbar))
        return -tot

    best = None
    for a0 in (0.0, 2.0, 4.0):
        r = minimize(neg, [0, 0, 0, a0], method="Nelder-Mead", options={"maxiter": 2000, "xatol": 1e-5, "fatol": 1e-7})
        if best is None or r.fun < best.fun:
            best = r
    return {"loglik": -best.fun, "k": 4}


def compare_hier(tables: list[np.ndarray]) -> dict:
    """複数人の答えで、量子（階層）と古典（階層）を比べ、各人の θ_i と予測を返す。"""
    q = fit_quantum_hier(tables)
    c = fit_classical_hier(tables)
    aic_q, aic_c = 2 * q["k"] - 2 * q["loglik"], 2 * c["k"] - 2 * c["loglik"]
    return {"quantum": q, "classical": c, "aic_quantum": aic_q, "aic_classical": aic_c,
            "better": "quantum" if aic_q < aic_c else "classical", "people": len(tables)}


def simulate_people_quantum(n_people: int, n_per_order: int, phi: float, m: float, s: float, rng):
    thetas = np.clip(rng.normal(m, s, n_people), 0.01, np.pi - 0.01)
    return [simulate_quantum(th, phi, n_per_order, rng) for th in thetas], thetas


def simulate_people_classical(n_people: int, n_per_order: int, pbar: np.ndarray, alpha: float, rng):
    return [simulate_classical(rng.dirichlet(alpha * pbar), n_per_order, rng) for _ in range(n_people)]
