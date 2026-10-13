"""判定の本体：前日の引きずりを考慮したベイズ回帰。

何をしているか
  その日の記録 = 基準値
               + 飲んだ日の上乗せ（これを知りたい）
               + 時間の流れによる変化
               + その日の気分・ストレス・睡眠の影響
               + 揺れ

  揺れは「前日の揺れを一部引きずる」と考える（自己相関）。
  毎日の体調は前日の状態を持ち越すので、普通の比較（t検定）をそのまま使うと
  偶然の差を「差がある」と判定しすぎる。ここでは引きずりの強さ（rho）も
  データから同時に推定する。

計算方法
  ギブスサンプリング（Chib 1993 の自己相関つき回帰）。
  「上乗せ」「揺れの大きさ」「引きずりの強さ」を順番に、他を仮に固定しながら
  何千回も推定し直し、そのばらつきから「上乗せが0より大きい確率」を出す。
  初日は前日がないので、前日がそろっている日のペアだけで推定する。
  記録が抜けた日があっても、その日と翌日のペアが使えなくなるだけで止まらない。
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

# 事前の前提（事前分布）。実験の前に決めて固定し、レポートに書く。途中で変えない。
DEFAULT_PRIORS = {
    # 飲んだ日の上乗せ：「たぶん差はない、あっても±2点程度」という控えめな前提
    "treatment_sd": 2.0,
    # 基準値：0〜10の記録の真ん中あたり、幅広く
    "intercept_mean": 5.0,
    "intercept_sd": 5.0,
    # 時間の流れ・気分などの影響（標準化した1単位あたり）
    "other_sd": 2.0,
    # 揺れの大きさ（逆ガンマ分布）
    "sigma2_shape": 2.0,
    "sigma2_scale": 2.0,
    # 引きずりの強さ：0中心、-1〜1に制限
    "rho_mean": 0.0,
    "rho_sd": 0.5,
}


@dataclass
class Fit:
    """推定結果。draws は推定を繰り返した結果の列（多いほど安定する）。"""

    names: list[str]
    beta_draws: np.ndarray  # (回数, 係数の数)
    rho_draws: np.ndarray
    sigma_draws: np.ndarray
    n_used: int  # 推定に使えた日のペア数
    priors: dict = field(default_factory=dict)

    def draws(self, name: str) -> np.ndarray:
        return self.beta_draws[:, self.names.index(name)]


def _standardize(x: np.ndarray) -> np.ndarray:
    sd = np.nanstd(x)
    if sd == 0 or np.isnan(sd):
        return np.zeros_like(x)
    return (x - np.nanmean(x)) / sd


def build_design(
    day: np.ndarray,
    treat: np.ndarray,
    covariates: dict[str, np.ndarray] | None = None,
) -> tuple[np.ndarray, list[str]]:
    """説明に使う変数の表（設計行列）を作る。気分などは標準化してそろえる。"""
    cols = [np.ones_like(day, dtype=float), treat.astype(float), _standardize(day.astype(float))]
    names = ["intercept", "treatment", "trend"]
    for name, values in (covariates or {}).items():
        cols.append(_standardize(np.asarray(values, dtype=float)))
        names.append(name)
    return np.column_stack(cols), names


def fit(
    y: np.ndarray,
    X: np.ndarray,
    day: np.ndarray,
    names: list[str],
    priors: dict | None = None,
    n_draws: int = 3000,
    n_burn: int = 1000,
    seed: int | None = None,
) -> Fit:
    """自己相関つきベイズ回帰をギブスサンプリングで推定する。"""
    pr = {**DEFAULT_PRIORS, **(priors or {})}
    rng = np.random.default_rng(seed)

    y = np.asarray(y, dtype=float)
    day = np.asarray(day)
    ok = ~np.isnan(y) & ~np.isnan(X).any(axis=1)
    y, X, day = y[ok], X[ok], day[ok]
    order = np.argsort(day)
    y, X, day = y[order], X[order], day[order]

    # 前日の記録がそろっているペアだけを使う
    pair = np.where(np.diff(day) == 1)[0]
    cur, prev = pair + 1, pair
    if len(pair) < X.shape[1] + 2:
        raise ValueError(f"連続した記録が足りません（{len(pair)}組）")

    k = X.shape[1]
    b0 = np.zeros(k)
    b0[0] = pr["intercept_mean"]
    prior_sd = np.full(k, pr["other_sd"])
    prior_sd[names.index("intercept")] = pr["intercept_sd"]
    if "treatment" in names:
        prior_sd[names.index("treatment")] = pr["treatment_sd"]
    B0_inv = np.diag(1.0 / prior_sd**2)

    beta = np.linalg.lstsq(X, y, rcond=None)[0]
    sigma2 = float(np.var(y - X @ beta)) or 1.0
    rho = 0.0

    total = n_draws + n_burn
    beta_out = np.empty((n_draws, k))
    rho_out = np.empty(n_draws)
    sig_out = np.empty(n_draws)

    for it in range(total):
        # 1) 引きずりを取り除いた形に変換して、係数を推定し直す
        ys = y[cur] - rho * y[prev]
        Xs = X[cur] - rho * X[prev]
        V = np.linalg.inv(B0_inv + Xs.T @ Xs / sigma2)
        m = V @ (B0_inv @ b0 + Xs.T @ ys / sigma2)
        beta = rng.multivariate_normal(m, V)

        # 2) 揺れの大きさを推定し直す
        resid = ys - Xs @ beta
        shape = pr["sigma2_shape"] + len(cur) / 2
        scale = pr["sigma2_scale"] + resid @ resid / 2
        sigma2 = scale / rng.gamma(shape)

        # 3) 引きずりの強さを推定し直す（-1〜1の範囲に制限）
        u = y - X @ beta
        prec = 1 / pr["rho_sd"] ** 2 + u[prev] @ u[prev] / sigma2
        mean = (pr["rho_mean"] / pr["rho_sd"] ** 2 + u[prev] @ u[cur] / sigma2) / prec
        for _ in range(100):
            cand = rng.normal(mean, 1 / np.sqrt(prec))
            if -1 < cand < 1:
                rho = cand
                break

        if it >= n_burn:
            j = it - n_burn
            beta_out[j] = beta
            rho_out[j] = rho
            sig_out[j] = np.sqrt(sigma2)

    return Fit(names, beta_out, rho_out, sig_out, len(cur), pr)


@dataclass
class Verdict:
    """判定。direction は「良くなる向き」を +1、「下がるほど良い記録」なら -1。"""

    p_better: float  # 飲んだ期間の方が良かった確率
    p_meaningful: float  # 意味のある大きさ（mid 点）以上良かった確率
    effect_mean: float  # 良くなる向きにそろえた差（点）
    effect_low: float  # 幅の下限
    effect_high: float  # 幅の上限
    rho_mean: float
    label: str


LABELS = (
    (0.95, "はっきり差がある"),
    (0.80, "差がありそう"),
)
WORSE_LABELS = (
    (0.95, "悪い方向にはっきり差がある"),
    (0.80, "悪い方向に差がありそう"),
)


# レポートに出す幅。名目の値ではなく、偽データで実際に何%正解を含むかを測って決める。
# 0.1.0 の検証（CALIBRATION.md）：名目90%の幅は実際85%しか正解を含まなかったため、
# 名目95%の幅を「90%の幅」として出す。
INTERVAL_QUANTILES = (0.025, 0.975)


def verdict(f: Fit, direction: int = 1, mid: float = 1.0) -> Verdict:
    eff = f.draws("treatment") * direction
    p_better = float(np.mean(eff > 0))
    label = "はっきりしない"
    for threshold, text in LABELS:
        if p_better >= threshold:
            label = text
            break
    else:
        for threshold, text in WORSE_LABELS:
            if 1 - p_better >= threshold:
                label = text
                break
    return Verdict(
        p_better=p_better,
        p_meaningful=float(np.mean(eff >= mid)),
        effect_mean=float(eff.mean()),
        effect_low=float(np.quantile(eff, INTERVAL_QUANTILES[0])),
        effect_high=float(np.quantile(eff, INTERVAL_QUANTILES[1])),
        rho_mean=float(f.rho_draws.mean()),
        label=label,
    )
