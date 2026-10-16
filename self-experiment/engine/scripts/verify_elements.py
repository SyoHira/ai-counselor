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

  v0.2.0 で追加
  pkcarry   半減期2日の成分：0/1で数える場合と曝露量で数える場合、半減期を半分／倍に誤った場合
  cycle     月経周期で記録が動くとき：28日（補正なし／あり）と56日の並び
  nullcal   偶然との比較（補正後の差が基準）が、差ゼロのとき5%前後で「20回に1回以下」を出すか
  units     分・拍/分・対数の項目（カフェイン15時の設定）で、推定が偏らず幅が正しいか
  mediator2 v0.2.0 の既定の流れで、気分を通じた差が消えないか

  v0.3.0 で追加
  pdlag     記録に現れるまでの遅れ（薬力学の持ち越し）がある／ないとき、遅れを推定する場合としない場合
  robust    大きく外れた日（体調不良など）が混ざるとき、t 分布の揺れと正規分布の揺れ
  pooling   複数人の1人実験をまとめる階層モデル（research/population.py）
  quantum   質問の順番の量子モデル（research/quantum.py）が、生成したモデルを見分けられるか

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
from n1engine.domain.pk import PK, daily_exposure, window_for  # noqa: E402
from n1engine.domain.substances import SUBSTANCES  # noqa: E402
from n1engine.domain.variables import cycle_terms  # noqa: E402
from n1engine.model import build_design, fit, verdict  # noqa: E402
from n1engine.pipeline import analyze  # noqa: E402
from n1engine.run import load  # noqa: E402
from n1engine.simulate import ar1_noise, fake_experiment, null_check  # noqa: E402
from n1engine.domain import pd as pdm  # noqa: E402
from n1engine.model import fit_chains  # noqa: E402

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


POWER_BLOCKS = (7, 14)
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


def exp_pkcarry(n):
    """本当の半減期48時間（持ち越しあり）。数え方ごとの推定・検出・幅の正しさ。"""
    true = PK(48.0, 2.0)
    w = window_for("day")
    models = {"01": None, "pk_true": true, "pk_half": PK(24.0, 2.0), "pk_double": PK(96.0, 2.0)}
    out = {}
    for effect in (0.0, 1.0):
        acc = {m: {"est": [], "p": [], "cover": []} for m in models}
        for s in range(n):
            day, treat, y, _ = fake_experiment(effect, rho=0.5, sigma=1.0, seed=70_000 + s, pk=true, window=w)
            for m, pk in models.items():
                ex = treat.astype(float) if pk is None else daily_exposure(day, treat, pk, 8.0, w)
                X, names = build_design(day, ex)
                v = verdict(quick_fit(y, X, day, names, s))
                acc[m]["est"].append(v.effect_mean)
                acc[m]["p"].append(v.p_better)
                acc[m]["cover"].append(v.effect_low <= effect <= v.effect_high)
        out[f"effect{effect:g}"] = {
            m: {"mean_est": float(np.mean(a["est"])), "ge95": float(np.mean(np.array(a["p"]) >= 0.95)), "cover": float(np.mean(a["cover"]))}
            for m, a in acc.items()
        }
    out["n"] = n
    out["true_t_half_h"] = 48.0
    return out


def exp_cycle(n):
    """月経周期で記録が ±1点動く（周期28日・始まりはランダム）。差ゼロと差1点。"""
    out = {}
    designs = (("28_noadj", "ABBA", False), ("28_adj", "ABBA", True), ("56_adj", "ABABBABA", True))
    for effect in (0.0, 1.0):
        for name, base_seq, adj in designs:
            est, ps, cover, width = [], [], [], []
            for s in range(n):
                rng = np.random.default_rng(80_000 + s)
                seq = base_seq if s % 2 == 0 else base_seq.translate(str.maketrans("AB", "BA"))
                treat = np.repeat([1 if c == "B" else 0 for c in seq], 7)
                m = len(treat)
                day = np.arange(1, m + 1)
                start = int(rng.integers(0, 28))
                cd = (np.arange(m) + start) % 28 + 1
                y = 5 + effect * treat + 1.0 * np.sin(2 * np.pi * (cd - 1) / 28) + ar1_noise(m, 0.5, 1.0, rng)
                X, names = build_design(day, treat, cycle_terms(cd, 28) if adj else None)
                v = verdict(quick_fit(y, X, day, names, s))
                est.append(v.effect_mean)
                ps.append(v.p_better)
                cover.append(v.effect_low <= effect <= v.effect_high)
                width.append(v.effect_high - v.effect_low)
            out[f"{name}_effect{effect:g}"] = {
                "mean_est": float(np.mean(est)),
                "sd_est": float(np.std(est)),
                "ge95": float(np.mean(np.array(ps) >= 0.95)),
                "cover": float(np.mean(cover)),
                "width": float(np.mean(width)),
            }
    out["n"] = n
    out["cycle_amplitude"] = 1.0
    return out


def exp_nullcal(n):
    """差ゼロ（時間の流れ+3点・外部要因あり）で、偶然との比較が「20回に1回以下」を出す割合。"""
    rates = []
    for s in range(n):
        rng = np.random.default_rng(90_000 + s)
        day, treat, y, _ = fake_experiment(0.0, rho=0.5, sigma=1.0, drift=3.0, seed=90_000 + s)
        alc = rng.integers(0, 3, len(day)).astype(float)
        y = y + 0.4 * alc
        X, names = build_design(day, treat, {"alcohol": alc})
        f = quick_fit(y, X, day, names, s)
        v = verdict(f)
        r = null_check(y, X, day, names, v.rho_mean, float(f.sigma_draws.mean()), n_sims=400, seed=s)
        rates.append(r["rate"] if r["side"] > 0 else 1.0)
    a = np.array(rates)
    return {"n": n, "le05": float(np.mean(a <= 0.05)), "le10": float(np.mean(a <= 0.10))}


def exp_units(n):
    """カフェイン15時の設定（examples/make_example.py と同じ形、28日）。単位のある項目の推定。"""
    caf = SUBSTANCES["caffeine"]
    truth = {"sol": 8.0, "tst": -12.0, "rhr": 1.5, "rmssd": float(np.log(0.94))}
    acc = {k: {"est": [], "cover": []} for k in truth}
    for s in range(n):
        rng = np.random.default_rng(95_000 + s)
        days = make_schedule(seed=95_000 + s)
        m = len(days)
        day = np.array([d.day for d in days])
        treat = np.array([1 if d.phase == "B" else 0 for d in days])
        ex = daily_exposure(day, treat, caf.pk, 15.0, window_for("night"))
        offday = np.isin((day - 1) % 7, (5, 6)).astype(float)
        alcohol = rng.choice([0, 0, 0, 1, 2], m).astype(float)
        d = {
            "day": day, "treat": treat, "alcohol": alcohol, "offday": offday,
            "sol": 18 + 8 * ex - 2 * alcohol - 3 * offday + ar1_noise(m, 0.4, 5.0, rng),
            "tst": 420 - 12 * ex + ar1_noise(m, 0.3, 25, rng),
            "rhr": 58 + 1.5 * ex + 1.5 * alcohol + ar1_noise(m, 0.5, 1.2, rng),
            "rmssd": np.exp(np.log(45) + np.log(0.94) * ex + ar1_noise(m, 0.5, 0.12, rng)),
        }
        r = analyze(d, primary="sol", substance=caf, dose_hour=15, n_draws=300, null_sims=20, seed=s)
        allr = {r.primary.key: r.primary, **{x.key: x for x in r.secondary}}
        for k, t in truth.items():
            o = allr[k]
            sign = o.direction or 1
            lo, hi = sorted((o.v.effect_low * sign, o.v.effect_high * sign))
            acc[k]["est"].append(o.v.effect_mean * sign)
            acc[k]["cover"].append(lo <= t <= hi)
    return {"n": n, **{k: {"truth": truth[k], "mean_est": float(np.mean(a["est"])), "cover": float(np.mean(a["cover"]))} for k, a in acc.items()}}


def exp_mediator2(n):
    """exp_mediator と同じ偽データを、v0.2.0 の既定の流れ（気分は参考項目、補正しない）で分析する。"""
    est, ps = [], []
    for s in range(n):
        rng = np.random.default_rng(30_000 + s)
        days = make_schedule(seed=30_000 + s)
        m = len(days)
        day = np.array([d.day for d in days])
        treat = np.array([1 if d.phase == "B" else 0 for d in days])
        mood = np.clip(5 + 1.0 * treat + rng.normal(0, 1.2, m), 0, 10)
        y = np.clip(5 + 0.5 * treat + 0.5 * (mood - 5) + ar1_noise(m, 0.5, 0.9, rng), 0, 10)
        r = analyze({"day": day, "treat": treat, "outcome": y, "mood": mood}, n_draws=300, null_sims=20, seed=s, secondary=False)
        assert "mood" not in r.confounders
        est.append(r.primary.v.effect_mean)
        ps.append(r.primary.v.p_better)
    return {"n": n, "true_total": 1.0, "mean_est": float(np.mean(est)), "ge95": float(np.mean(np.array(ps) >= 0.95))}


def v03_fit(y, x_full, day, seed, pd=True, robust=True, conf=None):
    """v0.3.0 の既定（遅れを推定・t 分布）と、それを切った場合を同じデータで比べるための当てはめ。"""
    rows = np.asarray(day, dtype=int) - 1
    X, names = build_design(day, x_full[rows], conf)
    kw = {"robust": robust}
    if pd:
        kw.update(treat_options=pdm.options(x_full)[:, rows], option_logprior=pdm.log_prior())
    f = fit_chains(y, X, day, names, n_draws=250, n_burn=300, seed=seed, **kw)
    return f, verdict(f)


def gen_pd(seq, effect, pd_half, rho, sigma, seed, outliers=0, shift=-4.0):
    rng = np.random.default_rng(seed)
    treat = np.repeat([1 if p == "B" else 0 for p in seq], 7)
    n = len(treat)
    day = np.arange(1, n + 1)
    z = pdm.lag_filter(treat.astype(float), pd_half)
    y = 5 + effect * z + ar1_noise(n, rho, sigma, rng)
    if outliers:
        bad = rng.choice(n, outliers, replace=False)
        y[bad] += shift
    return day, treat, y


def exp_pdlag(n):
    out = {}
    for pd_half in (0.0, 2.0):
        for effect in (0.0, 1.0):
            acc = {m: {"est": [], "p": [], "cover": [], "plag": []} for m in ("v02", "v03")}
            for s in range(n):
                seq = "ABBA" if s % 2 == 0 else "BAAB"
                day, treat, y = gen_pd(seq, effect, pd_half, 0.5, 1.0, 110_000 + s)
                x = treat.astype(float)
                for m, (pdon, rob) in {"v02": (False, False), "v03": (True, True)}.items():
                    f, v = v03_fit(y, x, day, s, pdon, rob)
                    acc[m]["est"].append(v.effect_mean)
                    acc[m]["p"].append(v.p_better)
                    acc[m]["cover"].append(v.effect_low <= effect <= v.effect_high)
                    if pdon:
                        acc[m]["plag"].append(float(np.mean(f.lag_draws > 0)))
            out[f"half{pd_half:g}_effect{effect:g}"] = {
                m: {"mean_est": float(np.mean(a["est"])), "ge95": float(np.mean(np.array(a["p"]) >= 0.95)),
                    "cover": float(np.mean(a["cover"])), **({"p_lag": float(np.mean(a["plag"]))} if a["plag"] else {})}
                for m, a in acc.items()
            }
    out["n"] = n
    return out


def exp_robust(n):
    out = {}
    for outl in (0, 2):
        for effect in (0.0, 1.0):
            acc = {m: {"est": [], "p": [], "cover": []} for m in ("normal", "t")}
            for s in range(n):
                seq = "ABBA" if s % 2 == 0 else "BAAB"
                day, treat, y = gen_pd(seq, effect, 0.0, 0.5, 1.0, 120_000 + s, outliers=outl, shift=-5.0)
                x = treat.astype(float)
                for m, rob in (("normal", False), ("t", True)):
                    f, v = v03_fit(y, x, day, s, False, rob)
                    acc[m]["est"].append(v.effect_mean)
                    acc[m]["p"].append(v.p_better)
                    acc[m]["cover"].append(v.effect_low <= effect <= v.effect_high)
            out[f"outliers{outl}_effect{effect:g}"] = {
                m: {"mean_est": float(np.mean(a["est"])), "sd_est": float(np.std(a["est"])), "ge95": float(np.mean(np.array(a["p"]) >= 0.95)),
                    "le05": float(np.mean(np.array(a["p"]) <= 0.05)), "cover": float(np.mean(a["cover"]))}
                for m, a in acc.items()
            }
    out["n"] = n
    out["outlier_shift"] = -5.0
    return out


def exp_pooling(n):
    from n1engine.research.population import pool

    rng = np.random.default_rng(130_000)
    out = {}
    for tau in (0.3, 1.0):
        err_raw, err_pool, cov_ind, cov_mu = [], [], [], []
        for s in range(n):
            k = 12
            mu = 0.6
            theta = rng.normal(mu, tau, k)
            se = rng.uniform(0.5, 1.0, k)
            est = rng.normal(theta, se)
            r = pool(est, se, seed=s, n_draws=2000)
            err_raw.append(np.mean((est - theta) ** 2))
            err_pool.append(np.mean((r["individual_mean"] - theta) ** 2))
            cov_ind.append(np.mean((r["individual_low"] <= theta) & (theta <= r["individual_high"])))
            cov_mu.append(r["mu_low"] <= mu <= r["mu_high"])
        out[f"tau{tau:g}"] = {"mse_unpooled": float(np.mean(err_raw)), "mse_pooled": float(np.mean(err_pool)),
                              "cover_individual": float(np.mean(cov_ind)), "cover_mu": float(np.mean(cov_mu))}
    out["n"] = n
    out["people_per_set"] = 12
    return out


def exp_quantum(n):
    from n1engine.research.quantum import compare_models, simulate_quantum, simulate_classical

    out = {}
    for gen in ("quantum", "classical"):
        wins = {"classical": 0, "quantum2d": 0, "qq_saturated": 0, "saturated": 0}
        qq_reject = 0
        for s in range(n):
            rng = np.random.default_rng(140_000 + s)
            if gen == "quantum":
                tab = simulate_quantum(theta=0.6, phi=0.9, n_per_order=300, rng=rng)
            else:
                tab = simulate_classical(p=np.array([0.35, 0.15, 0.2, 0.3]), n_per_order=300, rng=rng)
            r = compare_models(tab)
            wins[r["best_bic"]] += 1
            qq_reject += r["qq_lr_p"] < 0.05
        out[gen] = {"best_by_bic": {k: v / n for k, v in wins.items()}, "qq_rejected": qq_reject / n}
    out["n"] = n
    out["answers_per_order"] = 300
    return out


EXPERIMENTS = {
    "example": (exp_example, 1),
    "nullalt": (exp_nullalt, 200),
    "power": (exp_power, 100),
    "mediator": (exp_mediator, 60),
    "ceiling": (exp_ceiling, 100),
    "design": (exp_design, 100),
    "carry": (exp_carry, 100),
    "pkcarry": (exp_pkcarry, 100),
    "cycle": (exp_cycle, 100),
    "nullcal": (exp_nullcal, 200),
    "units": (exp_units, 60),
    "mediator2": (exp_mediator2, 60),
    "pdlag": (exp_pdlag, 60),
    "robust": (exp_robust, 60),
    "pooling": (exp_pooling, 200),
    "quantum": (exp_quantum, 200),
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
