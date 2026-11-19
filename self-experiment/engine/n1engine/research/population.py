"""研究層：複数人の1人実験をまとめる階層ベイズモデル。

背景
  同じ成分・同じ記録項目で1人実験をした人が増えると、
  「その人の差」と「人による違いの大きさ」を同時に推定できる。
  各人の推定は、全体の平均に向かって、その人の記録の確かさに応じて引き寄せられる（部分的な共有）。
  N-of-1 試験を束ねる標準的な方法（Zucker 他 1997, J Clin Epidemiol；
  Schmid & Yang 2022, Harvard Data Science Review）。

モデル
  その人の推定値  est_i ~ 正規(θ_i, se_i²)      se_i は各人の1人実験の事後の標準偏差
  その人の本当の差 θ_i  ~ 正規(μ, τ²)           μ = 全体の平均、τ = 人による違いの大きさ
  事前：μ ~ 正規(0, 2²)、τ ~ 半正規(1)

使い方の決まり（v0.4.0）
  - 複数人の記録を前提に分析し、レポートに出すのはその人の θ_i（その人の差）だけ。
    全体の平均 μ や「この成分は◯点」という結果はレポートや宣伝に出さない（成分そのものの働きの話になるため）。
  - 同意を得た人の要約（推定値・幅・遅れと形の見込み）だけを使う。日々の記録そのものは集めない。
  - 期待の分 δ：中身を知って飲んだ人と、中身を隠して飲んだ人の推定の差から推定する（cohort.py）。
"""

from __future__ import annotations

import numpy as np

TAU_GRID = np.linspace(0.005, 3.0, 600)


def pool(est, se, seed: int = 0, n_draws: int = 4000, n_burn: int = 1000, mu_sd: float = 2.0, tau_scale: float = 1.0,
         open_label=None, delta_sd: float = 1.0) -> dict:
    """open_label を与えると、中身を知って飲んだ人の推定に共通の上乗せ δ（期待の分）を加えて推定する。

        est_i ~ 正規(θ_i + δ・open_i, se_i²)
    δ は、中身を隠して飲んだ人（open_i = 0）がいるときだけデータから決まる。いなければ δ は推定しない。
    """
    est = np.asarray(est, dtype=float)
    se = np.asarray(se, dtype=float)
    k = len(est)
    rng = np.random.default_rng(seed)
    op = np.zeros(k) if open_label is None else np.asarray(open_label, dtype=float)
    use_delta = open_label is not None and np.any(op == 0) and np.any(op == 1)
    delta = 0.0
    mu, tau = float(np.mean(est)), float(np.std(est)) or 0.5
    mu_out, tau_out, th_out = np.empty(n_draws), np.empty(n_draws), np.empty((n_draws, k))
    d_out = np.zeros(n_draws)
    log_prior_tau = -0.5 * (TAU_GRID / tau_scale) ** 2
    for it in range(n_draws + n_burn):
        prec = 1 / se**2 + 1 / tau**2
        th = rng.normal(((est - delta * op) / se**2 + mu / tau**2) / prec, 1 / np.sqrt(prec))
        if use_delta:
            pd_ = np.sum(op / se**2) + 1 / delta_sd**2
            delta = rng.normal(np.sum(op * (est - th) / se**2) / pd_, 1 / np.sqrt(pd_))
        p_mu = 1 / mu_sd**2 + k / tau**2
        mu = rng.normal((th.sum() / tau**2) / p_mu, 1 / np.sqrt(p_mu))
        ss = np.sum((th - mu) ** 2)
        lt = log_prior_tau - k * np.log(TAU_GRID) - ss / (2 * TAU_GRID**2)
        pt = np.exp(lt - lt.max())
        tau = float(rng.choice(TAU_GRID, p=pt / pt.sum()))
        if it >= n_burn:
            j = it - n_burn
            mu_out[j], tau_out[j], th_out[j], d_out[j] = mu, tau, th, delta
    new = rng.normal(mu_out, tau_out)
    q = lambda a, axis=None: np.quantile(a, [0.025, 0.975], axis=axis)  # noqa: E731
    return {
        "mu_mean": float(mu_out.mean()),
        "mu_low": float(q(mu_out)[0]),
        "mu_high": float(q(mu_out)[1]),
        "tau_mean": float(tau_out.mean()),
        "individual_mean": th_out.mean(axis=0),
        "individual_low": q(th_out, 0)[0],
        "individual_high": q(th_out, 0)[1],
        "new_person_low": float(q(new)[0]),
        "new_person_high": float(q(new)[1]),
        "people": k,
        "theta_draws": th_out,
        "delta_estimated": bool(use_delta),
        "delta_mean": float(d_out.mean()),
        "delta_low": float(q(d_out)[0]),
        "delta_high": float(q(d_out)[1]),
    }
