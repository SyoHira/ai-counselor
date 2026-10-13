"""シミュレーション：3つの用途。

1. 偽データを作る（答えの分かっているデータで、エンジンが正しいかを確かめる）
2. 実験の前に、何日やれば差を見つけられるかを出す
3. 実験の後に、「差がゼロでも、この程度の差は何回に1回出るか」を出す
"""

from __future__ import annotations

import numpy as np

from .design import make_schedule
from .model import build_design, fit, verdict


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
):
    """答え（effect）の分かっている偽の記録を作る。"""
    rng = np.random.default_rng(seed)
    days = make_schedule(block_len=block_len, seed=seed)
    n = len(days)
    day = np.array([d.day for d in days])
    treat = np.array([1 if d.phase == "B" else 0 for d in days])
    mood = rng.normal(5, 1.5, n)
    trend = drift * (day - day.mean()) / n
    y = base + effect * treat + trend + mood_weight * (mood - 5) + ar1_noise(n, rho, sigma, rng)
    return day, treat, np.clip(y, 0, 10), {"mood": mood}


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
    block_lens: tuple[int, ...] = (7, 10, 14),
    n_sims: int = 100,
    seed: int = 0,
) -> list[dict]:
    """実験の前に：この人の揺れ方なら、何日やれば effect 点の差を見つけられるか。

    baseline は最初の普段通りの記録（7日以上）。
    「見つけられる確率」= 本当に effect 点の差があるとき、判定が
    「はっきり差がある」になる割合。揺れ方の不確かさも含めて計算する。
    """
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
            day, treat, y, _ = fake_experiment(effect, rho, sigma, block_len=bl, seed=seed + 1000 * i + s)
            X, names = build_design(day, treat)
            f = fit(y, X, day, names, n_draws=600, n_burn=300, seed=s)
            if verdict(f).p_better >= 0.95:
                hits += 1
        out.append({"days": bl * 4, "power": hits / n_sims})
    return out


def null_check(
    y: np.ndarray,
    treat: np.ndarray,
    rho: float,
    sigma: float,
    direction: int = 1,
    n_sims: int = 2000,
    seed: int = 0,
) -> dict:
    """実験の後に：差がゼロだったとしたら、この程度の差は何回に1回出るか。

    この人の揺れ方（rho, sigma）で、差がゼロの偽データを何千回も作り、
    飲んだ期間と飲まない期間の平均の差が、実際の差以上になった割合を数える。
    """
    rng = np.random.default_rng(seed)
    y = np.asarray(y, dtype=float)
    treat = np.asarray(treat)
    ok = ~np.isnan(y)
    observed = direction * (y[ok & (treat == 1)].mean() - y[ok & (treat == 0)].mean())
    n = len(y)
    count = 0
    for _ in range(n_sims):
        u = ar1_noise(n, rho, sigma, rng)
        diff = direction * (u[ok & (treat == 1)].mean() - u[ok & (treat == 0)].mean())
        if diff >= observed:
            count += 1
    rate = count / n_sims
    return {
        "observed_diff": float(observed),
        "rate": rate,
        "one_in": (1 / rate) if rate > 0 else float("inf"),
    }
