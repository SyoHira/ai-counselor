"""要素別の検証。モデルの各要素について、偽データで「何が言えて、何が言えないか」を測る。

  python scripts/verify_elements.py <実験名> --out <出力先ディレクトリ> [--n 件数]

実験名
  example   見本の記録を当てて、分解・事前分布の感度・推定の安定性を出す
  nullalt   差ゼロと差1点のとき、判定の確率がどう分布するか
  power     記録の長さ（28/40/56日）ごとの検出率
  mediator  飲んだことで気分も変わるとき、気分を補正に入れると差が消えないか
  ceiling   記録が10点の端に張りつくとき（整数評価）の振る舞い
  design    7日×4期間を折り返す並び（ABBA）と、前半後半に分ける並び（AABB）の比較
  carry     効果が出るまで・消えるまでに数日かかるとき（持ち越し）の見落とし

結果は JSON で書き出す。CALIBRATION.md に転記するときはこの出力を使う。
推定の回数は検証用（1000回）。本番（3000回）より少ない。
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import time

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from n1engine.design import make_schedule  # noqa: E402
from n1engine.model import build_design, fit, verdict  # noqa: E402
from n1engine.run import load  # noqa: E402
from n1engine.simulate import ar1_noise, fake_experiment  # noqa: E402

N_DRAWS, N_BURN = 1000, 500


def quick_fit(y, X, day, names, seed, priors=None):
    return fit(y, X, day, names, priors=priors, n_draws=N_DRAWS, n_burn=N_BURN, seed=seed)


def r4(x):
    return [round(float(v), 4) for v in x]


def gen_phases(phases, effect, rho, sigma, drift, seed, base=5.0, block_len=7, lag=None, round_int=False):
    """指定した並びで偽の記録を作る。lag を与えると、効果が出るまで・消えるまでに時間がかかる。"""
    rng = np.random.default_rng(seed)
    treat = np.repeat([1 if p == "B" else 0 for p in phases], block_len)
    n = len(treat)
    day = np.arange(1, n + 1)
    if lag is None:
        eff = effect * treat
    else:
        s = np.zeros(n)
        prev = 0.0
        for t in range(n):
            prev = lag * prev + (1 - lag) * treat[t]
            s[t] = prev
        eff = effect * s
    y = base + eff + drift * (day - day.mean()) / n + ar1_noise(n, rho, sigma, rng)
    y = np.clip(y, 0, 10)
    if round_int:
        y = np.round(y)
    return day, treat, y


# ---------------------------------------------------------------- 実験


def exp_example(n):
    d = load(str(ROOT / "examples" / "example.csv"))
    covs = {c: d[c] for c in ("mood", "stress", "sleep")}
    X, names = build_design(d["day"], d["treat"], covs)
    f = fit(d["outcome"], X, d["day"], names, seed=0)  # 本番と同じ3000回
    v = verdict(f)
    beta = f.beta_draws.mean(axis=0)
    comp = {nm: (X[:, i] * beta[i]).tolist() for i, nm in enumerate(names)}
    fitted = sum(np.array(c) for c in comp.values())
    resid = d["outcome"] - fitted
    raw = float(np.nanmean(d["outcome"][d["treat"] == 1]) - np.nanmean(d["outcome"][d["treat"] == 0]))

    bins = np.linspace(-3, 4, 71)
    priors = {}
    for sd in (0.5, 1, 2, 5, 20):
        fp = fit(d["outcome"], X, d["day"], names, priors={"treatment_sd": sd}, seed=0)
        vp = verdict(fp)
        entry = {
            "p_better": vp.p_better,
            "effect_mean": vp.effect_mean,
            "low": vp.effect_low,
            "high": vp.effect_high,
        }
        if sd in (1, 2, 5):
            h, _ = np.histogram(fp.draws("treatment"), bins=bins, density=True)
            entry["hist"] = r4(h)
        priors[str(sd)] = entry

    # ウォームアップを捨てずに、最初の推定の動きを見る
    traces = {}
    for s in (1, 2):
        ft = fit(d["outcome"], X, d["day"], names, n_draws=600, n_burn=0, seed=s)
        traces[str(s)] = r4(ft.draws("treatment"))

    seeds = []
    for s in range(8):
        fs = fit(d["outcome"], X, d["day"], names, seed=s)
        vs = verdict(fs)
        seeds.append({"seed": s, "p_better": vs.p_better, "effect_mean": vs.effect_mean, "rho": vs.rho_mean})

    return {
        "day": d["day"].tolist(),
        "treat": d["treat"].tolist(),
        "y": d["outcome"].tolist(),
        "cov": {k: v_.tolist() for k, v_ in covs.items()},
        "beta_mean": dict(zip(names, beta.tolist())),
        "components": comp,
        "resid": resid.tolist(),
        "raw_diff": raw,
        "verdict": {"p_better": v.p_better, "effect_mean": v.effect_mean, "low": v.effect_low, "high": v.effect_high, "rho": v.rho_mean},
        "bins": r4(bins),
        "priors": priors,
        "traces": traces,
        "seeds": seeds,
        "rho_draws_hist": {
            "bins": r4(np.linspace(-0.2, 1.0, 49)),
            "hist": r4(np.histogram(f.rho_draws, bins=np.linspace(-0.2, 1.0, 49), density=True)[0]),
        },
    }


def exp_nullalt(n):
    out = {}
    for label, effect in (("null", 0.0), ("alt", 1.0)):
        ps = []
        for s in range(n):
            day, treat, y, _ = fake_experiment(effect, rho=0.6, sigma=1.0, seed=10_000 + s)
            X, names = build_design(day, treat)
            ps.append(verdict(quick_fit(y, X, day, names, s)).p_better)
        a = np.array(ps)
        out[label] = {
            "p": r4(ps),
            "ge95": float(np.mean(a >= 0.95)),
            "ge80": float(np.mean(a >= 0.80)),
            "le05": float(np.mean(a <= 0.05)),
            "le20": float(np.mean(a <= 0.20)),
        }
    out["n"] = n
    return out


POWER_BLOCKS = (7, 10, 14)
SEED0 = 0


def exp_power(n):
    out = {}
    for bl in POWER_BLOCKS:
        hit95 = hit80 = 0
        for s in range(SEED0, SEED0 + n):
            day, treat, y, _ = fake_experiment(1.0, rho=0.6, sigma=1.0, block_len=bl, seed=20_000 + s)
            X, names = build_design(day, treat)
            p = verdict(quick_fit(y, X, day, names, s)).p_better
            hit95 += p >= 0.95
            hit80 += p >= 0.80
        out[str(bl * 4)] = {"ge95": hit95 / n, "ge80": hit80 / n}
    out["n"] = n
    return out


def exp_mediator(n):
    adj, unadj, adj_p, unadj_p = [], [], [], []
    for s in range(n):
        rng = np.random.default_rng(30_000 + s)
        days = make_schedule(seed=30_000 + s)
        m = len(days)
        day = np.array([d.day for d in days])
        treat = np.array([1 if d.phase == "B" else 0 for d in days])
        mood = np.clip(5 + 1.0 * treat + rng.normal(0, 1.2, m), 0, 10)  # 飲むと気分が1点上がる
        y = 5 + 0.5 * treat + 0.5 * (mood - 5) + ar1_noise(m, 0.5, 0.9, rng)  # 気分が記録に0.5点ずつ効く
        y = np.clip(y, 0, 10)
        Xa, na = build_design(day, treat, {"mood": mood})
        Xu, nu = build_design(day, treat)
        va = verdict(quick_fit(y, Xa, day, na, s))
        vu = verdict(quick_fit(y, Xu, day, nu, s))
        adj.append(va.effect_mean)
        unadj.append(vu.effect_mean)
        adj_p.append(va.p_better)
        unadj_p.append(vu.p_better)
    return {
        "n": n,
        "true_total": 1.0,
        "true_direct": 0.5,
        "adjusted_mean": float(np.mean(adj)),
        "unadjusted_mean": float(np.mean(unadj)),
        "adjusted_ge95": float(np.mean(np.array(adj_p) >= 0.95)),
        "unadjusted_ge95": float(np.mean(np.array(unadj_p) >= 0.95)),
    }


def exp_ceiling(n):
    out = {}
    for base in (5.0, 9.0):
        for effect in (0.0, 1.0):
            est, ps = [], []
            for s in range(n):
                seq = "ABBA" if s % 2 == 0 else "BAAB"
                day, treat, y = gen_phases(seq, effect, 0.5, 1.0, 0.0, 40_000 + s, base=base, round_int=True)
                X, names = build_design(day, treat)
                v = verdict(quick_fit(y, X, day, names, s))
                est.append(v.effect_mean)
                ps.append(v.p_better)
            out[f"base{base:g}_effect{effect:g}"] = {
                "mean_est": float(np.mean(est)),
                "ge95": float(np.mean(np.array(ps) >= 0.95)),
            }
    out["n"] = n
    return out


def exp_design(n):
    out = {}
    for name, seqs in (("ABBA", ("ABBA", "BAAB")), ("AABB", ("AABB", "BBAA"))):
        for effect in (0.0, 1.0):
            raw, est, ps, width = [], [], [], []
            raw_by_seq = {q: [] for q in seqs}
            for s in range(n):
                seq = seqs[s % 2]
                day, treat, y = gen_phases(seq, effect, 0.5, 1.0, 3.0, 50_000 + s)
                raw.append(y[treat == 1].mean() - y[treat == 0].mean())
                raw_by_seq[seq].append(raw[-1])
                X, names = build_design(day, treat)
                v = verdict(quick_fit(y, X, day, names, s))
                est.append(v.effect_mean)
                ps.append(v.p_better)
                width.append(v.effect_high - v.effect_low)
            out[f"{name}_effect{effect:g}"] = {
                "raw_mean": float(np.mean(raw)),
                "raw_sd": float(np.std(raw)),
                "raw_by_seq": {q: float(np.mean(v)) for q, v in raw_by_seq.items()},
                "engine_mean": float(np.mean(est)),
                "ge95": float(np.mean(np.array(ps) >= 0.95)),
                "width": float(np.mean(width)),
            }
    out["n"] = n
    out["drift_total"] = 3.0
    return out


def exp_carry(n):
    out = {}
    for effect in (0.0, 1.0):
        est, ps = [], []
        for s in range(n):
            seq = "ABBA" if s % 2 == 0 else "BAAB"
            day, treat, y = gen_phases(seq, effect, 0.5, 1.0, 0.0, 60_000 + s, lag=0.7)
            X, names = build_design(day, treat)
            v = verdict(quick_fit(y, X, day, names, s))
            est.append(v.effect_mean)
            ps.append(v.p_better)
        out[f"effect{effect:g}"] = {"mean_est": float(np.mean(est)), "ge95": float(np.mean(np.array(ps) >= 0.95))}
    out["n"] = n
    out["lag"] = 0.7
    return out


EXPERIMENTS = {
    "example": (exp_example, 1),
    "nullalt": (exp_nullalt, 200),
    "power": (exp_power, 100),
    "mediator": (exp_mediator, 60),
    "ceiling": (exp_ceiling, 100),
    "design": (exp_design, 100),
    "carry": (exp_carry, 100),
}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("exp", choices=EXPERIMENTS)
    p.add_argument("--out", required=True)
    p.add_argument("--n", type=int)
    p.add_argument("--blocks", help="power のブロック長（日）。例: 7,10,14")
    p.add_argument("--seed0", type=int, default=0)
    p.add_argument("--tag", default="")
    a = p.parse_args()
    global POWER_BLOCKS, SEED0
    if a.blocks:
        POWER_BLOCKS = tuple(int(x) for x in a.blocks.split(","))
    SEED0 = a.seed0
    fn, default_n = EXPERIMENTS[a.exp]
    n = a.n or default_n
    t0 = time.time()
    res = fn(n)
    res["seconds"] = round(time.time() - t0, 1)
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / f"{a.exp}{a.tag}.json").write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
    print(f"{a.exp}: {res['seconds']}s")


if __name__ == "__main__":
    main()
