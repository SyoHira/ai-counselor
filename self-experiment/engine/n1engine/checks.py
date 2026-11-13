"""その人の記録に、モデルが合っているかの確認（v0.4.0）。

偽データでの検証だけでは、「実際の人の記録にこのモデルが合うか」は分からない。
そこで分析のたびに、その人の記録そのものでモデルを確かめる。

  1日先の予測の確認
    前日までの記録と推定した式から、その日の記録を予測し、実際の記録が
    予測の分布のどこに入ったか（PIT：確率積分変換）を毎日出す。
    モデルが合っていれば、PIT は 0〜1 に一様に散らばり、90%の予測幅には約90%の日が入る。
  残りの規則性の確認（Ljung-Box 検定）
    PIT を正規分布の値に直して、1〜3日前との相関が残っていないかを調べる。
    残っていれば、引きずりの形（前日だけを引きずる）が合っていない。
  期間ごとのずれの確認（v0.4.0）
    記録から、飲んだ影響・時間の流れ・外部要因を差し引いた残り（引きずりを含む揺れ）を
    7日ずつの期間に分け、期間の平均が、前日を引きずる揺れだけで説明できる大きさかを調べる（カイ二乗）。
    ずれていれば、体調の水準が途中で一段変わるなど、直線の時間の流れで表せない変化がある。
    なお、水準の変わり目が飲む期間とちょうど重なると、飲んだ影響と区別できない（並びをランダムにする理由）。
  2つの検定のどちらかの p が 0.025 未満なら「合っていない」とする（合わせて誤報が約5%になるように）。

  実際の記録（nof1kit のメラトニン70日の公開データ）と、偽データで、
  この確認の誤報の割合を測った（CALIBRATION.md v0.4.0）。
"""

from __future__ import annotations

import numpy as np
from scipy.stats import chi2, norm, t as student_t

from .model import Fit, prepare


def one_step_pit(f: Fit, y, X, day, n_use: int = 300, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    """1日先の予測に対する実際の記録の位置（PIT）。返り値は（日, PIT）。"""
    y, X, day, cur, prev = prepare(y, X, day)
    rng = np.random.default_rng(seed)
    S = len(f.rho_draws)
    pick = rng.choice(S, size=min(n_use, S), replace=False)
    pit = np.zeros(len(cur))
    for s in pick:
        b, r, sg = f.beta_draws[s], f.rho_draws[s], f.sigma_draws[s]
        mean = X[cur] @ b + r * (y[prev] - X[prev] @ b)
        z = (y[cur] - mean) / sg
        if f.nu_draws is not None:
            pit += student_t.cdf(z, f.nu_draws[s])
        else:
            pit += norm.cdf(z)
    return day[cur], pit / len(pick)


def ljung_box(x: np.ndarray, lags: int = 3) -> float:
    x = np.asarray(x, dtype=float)
    x = x - x.mean()
    n = len(x)
    den = np.sum(x**2)
    q = 0.0
    for k in range(1, lags + 1):
        r = np.sum(x[k:] * x[:-k]) / den
        q += r**2 / (n - k)
    q *= n * (n + 2)
    return float(chi2.sf(q, lags))


def block_test(u: np.ndarray, days: np.ndarray, rho: float, sigma: float, block: int = 7) -> float:
    """揺れ u（前日を引きずる）の期間平均が、引きずりだけで説明できるかの検定。"""
    days = np.asarray(days)
    b = (days - 1) // block
    stat, df = 0.0, 0
    v0 = sigma**2 / max(1 - rho**2, 1e-3)
    for k in np.unique(b):
        m = b == k
        if m.sum() < 3:
            continue
        dd = days[m]
        cov = v0 * rho ** np.abs(dd[:, None] - dd[None, :])
        var_mean = cov.sum() / m.sum() ** 2
        stat += u[m].mean() ** 2 / var_mean
        df += 1
    return float(chi2.sf(stat, df)) if df else 1.0


ALPHA_EACH = 0.025


def check(f: Fit, y, X, day, seed: int = 0) -> dict:
    days, pit = one_step_pit(f, y, X, day, seed=seed)
    inside = (pit >= 0.05) & (pit <= 0.95)
    zs = norm.ppf(np.clip(pit, 1e-4, 1 - 1e-4))
    lb = ljung_box(zs)
    yy, XX, dd, _, _ = prepare(y, X, day)
    bm = f.beta_draws.mean(axis=0)
    u = yy - XX @ bm
    u = u - u.mean()
    bt = block_test(u, dd, float(f.rho_draws.mean()), float(np.median(f.sigma_draws)))
    cover = float(inside.mean())
    n = len(pit)
    ok = bool(lb >= ALPHA_EACH and bt >= ALPHA_EACH)
    return {
        "coverage90": cover,
        "n": n,
        "ljung_box_p": lb,
        "block_p": bt,
        "ok": ok,
        "outside_days": [int(d) for d, ins in zip(days, inside) if not ins],
    }
