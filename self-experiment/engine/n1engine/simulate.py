"""シミュレーション：3つの用途。

1. 偽データを作る（答えの分かっているデータで、エンジンが正しいかを確かめる）
2. 実験の前に、何日やれば差を見つけられるかを出す
3. 実験の後に、「差がゼロでも、この程度の差は何回に1回出るか」を出す
"""

from __future__ import annotations

import numpy as np

from .design import make_schedule
from .domain import pd as pdm
from .domain.pk import PK, Window, daily_exposure
from .model import build_design, fit, gls_estimate, verdict


def ar1_noise(n: int, rho: float, sigma: float, rng: np.random.Generator) -> np.ndarray:
    """前日を rho の強さで引きずる揺れを作る。sigma は毎日新しく加わる揺れの大きさ。"""
    e = rng.normal(0, sigma, n)
    u = np.empty(n)
    # 初日から定常状態の揺れになるように調整する
    u[0] = e[0] / np.sqrt(max(1 - rho**2, 1e-6))
    for t in range(1, n):
        u[t] = rho * u[t - 1] + e[t]
    return u


def fake_experiment(
    effect: float,
    rho: float = 0.5,
    sigma: float = 1.0,
    base: float = 5.0,
    block_len: int = 7,
    drift: float = 0.0,
    mood_weight: float = 0.0,
    seed: int | None = None,
    pk: PK | None = None,
    dose_hour: float = 8.0,
    window: Window | None = None,
    cycle: bool = False,
):
    """答え（effect）の分かっている偽の記録を作る。

    pk を与えると、本当の差が体内量に比例して現れる（飲み始めは徐々に、やめた後も残る）。
    effect は飲み続けて安定したときの差。
    """
    rng = np.random.default_rng(seed)
    days = make_schedule(block_len=block_len, seed=seed, cycle=cycle)
    n = len(days)
    day = np.array([d.day for d in days])
    treat = np.array([1 if d.phase == "B" else 0 for d in days])
    exposure = treat.astype(float) if pk is None else daily_exposure(day, treat, pk, dose_hour, window or Window(23, 31, ""))
    mood = rng.normal(5, 1.5, n)
    trend = drift * (day - day.mean()) / n
    y = base + effect * exposure + trend + mood_weight * (mood - 5) + ar1_noise(n, rho, sigma, rng)
    return day, treat, np.clip(y, 0, 10), {"mood": mood, "exposure": exposure}


MIN_BASELINE_DAYS = 7


def noise_candidates(baseline: np.ndarray, seed: int = 0) -> tuple[np.ndarray, np.ndarray]:
    """普段の記録から、引きずりの強さと毎日の揺れの大きさの「候補」を何千通り出す。

    数日分の記録から1つの値を決め打ちすると、たまたま穏やかな週だった場合に
    揺れを小さく見積もり、必要日数を楽観的に出してしまう（0.1.0 の開発中に実際に起きた：
    7日分の記録から引きずり0.17・揺れ0.65と推定したが、本当は0.5・0.9以上だった）。
    ここではベイズ推定で候補の分布を出し、記録が少ないほど幅広い候補を残す。
    """
    y = np.asarray(baseline, dtype=float)
    day = np.arange(1, len(y) + 1)
    X = np.ones((len(y), 1))
    f = fit(y, X, day, ["intercept"], n_draws=2000, n_burn=500, seed=seed)
    return f.rho_draws, f.sigma_draws


def plan_length(
    baseline: np.ndarray,
    effect: float = 1.0,
    block_lens: tuple[int, ...] = (7, 14),
    n_sims: int = 100,
    seed: int = 0,
    pk: PK | None = None,
    dose_hour: float = 8.0,
    window: Window | None = None,
) -> list[dict]:
    """実験の前に：この人の揺れ方なら、何日やれば effect 点の差を見つけられるか。

    baseline は最初の普段通りの記録（7日以上）。
    「見つけられる確率」= 本当に effect 点の差があるとき、判定が
    「はっきり差がある」になる割合。揺れ方の不確かさも含めて計算する。
    pk を与えると、成分の持ち越しも含めて計算する。期間は曜日がそろうよう7日の倍数のみ。
    """
    if any(bl % 7 for bl in block_lens):
        raise ValueError("期間の長さは7日の倍数にする（曜日をそろえるため）")
    n_base = int(np.sum(~np.isnan(np.asarray(baseline, dtype=float))))
    if n_base < MIN_BASELINE_DAYS:
        raise ValueError(f"普段通りの記録が{MIN_BASELINE_DAYS}日以上必要です（現在{n_base}日）")
    rhos, sigmas = noise_candidates(baseline, seed=seed)
    pick = np.random.default_rng(seed)
    out = []
    for i, bl in enumerate(block_lens):
        hits = 0
        for s in range(n_sims):
            j = pick.integers(len(rhos))
            rho, sigma = float(rhos[j]), float(sigmas[j])
            day, treat, y, ex = fake_experiment(
                effect, rho, sigma, block_len=bl, seed=seed + 1000 * i + s, pk=pk, dose_hour=dose_hour, window=window
            )
            X, names = build_design(day, ex["exposure"])
            # 判定と同じ設定（遅れの推定・t 分布）で見積もる。v0.2.0 までは遅れなしの式で、検出率を高めに出していた
            f = fit(y, X, day, names, n_draws=600, n_burn=300, seed=s, robust=True,
                    treat_options=pdm.options(ex["exposure"]), option_logprior=pdm.log_prior())
            if verdict(f).p_better >= 0.95:
                hits += 1
        out.append({"days": bl * 4, "power": hits / n_sims})
    return out


def null_check(
    y: np.ndarray,
    X: np.ndarray,
    day: np.ndarray,
    names: list[str],
    rho: float,
    sigma: float,
    direction: int = 1,
    n_sims: int = 2000,
    seed: int = 0,
) -> dict:
    """実験の後に：差がゼロだったとしたら、この程度の差は何回に1回出るか。

    比べる「差」は、時間の流れと外部要因を差し引き、引きずりを考慮した後の差
    （引きずりの強さを推定値に固定した最小二乗推定）。
    v0.1.0 は補正前の単純な平均の差で比べており、レポートの他の数字と基準がずれていた。

    差がゼロの偽データは、この人の揺れ方（rho, sigma）の揺れだけで作る。
    推定は直線的なので、基準値・時間の流れ・外部要因の大きさは結果に影響しない。
    """
    rng = np.random.default_rng(seed)
    j = names.index("treatment")
    observed = direction * gls_estimate(y, X, day, rho, j)
    day = np.asarray(day, dtype=int)
    y = np.asarray(y, dtype=float)
    span = int(day.max() - day.min() + 1)
    idx = day - day.min()
    side = 1 if observed >= 0 else -1  # 出た差の向き（良い方向／悪い方向）で、同じ向きにこれ以上の差が出る割合
    count = 0
    for _ in range(n_sims):
        u = ar1_noise(span, rho, sigma, rng)[idx]
        u = np.where(np.isnan(y), np.nan, u)
        if side * direction * gls_estimate(u, X, day, rho, j) >= side * observed:
            count += 1
    rate = count / n_sims
    return {
        "observed_diff": float(observed),
        "side": side,
        "rate": rate,
        "one_in": (1 / rate) if rate > 0 else float("inf"),
    }
