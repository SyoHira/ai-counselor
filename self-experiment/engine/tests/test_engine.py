"""エンジンの検証。答えの分かっている偽データで確かめる。

本格的な検証（800件）は CALIBRATION.md の手順で行う。
ここでは数分で終わる規模で、壊れていないことを確かめる。
"""

import sys
import pathlib

import numpy as np
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from n1engine.design import BALANCED_SEQUENCES, make_schedule  # noqa: E402
from n1engine.model import build_design, fit, verdict  # noqa: E402
from n1engine.research.qq import qq_statistic  # noqa: E402
from n1engine.simulate import fake_experiment, null_check  # noqa: E402


def _run(effect, rho, seed, drift=0.0):
    day, treat, y, _ = fake_experiment(effect, rho=rho, sigma=1.0, drift=drift, seed=seed)
    X, names = build_design(day, treat)
    return verdict(fit(y, X, day, names, n_draws=800, n_burn=400, seed=seed))


def test_schedule_is_balanced():
    for seed in range(20):
        s = make_schedule(seed=seed)
        seq = "".join(d.phase for d in s[::7])
        assert seq in BALANCED_SEQUENCES
        assert sum(d.phase == "B" for d in s) == 14


def test_false_alarm_rate_is_controlled():
    # 差ゼロ・引きずり強め。誤って「はっきり差がある」と言う割合が大きく外れないこと
    hits = sum(_run(0.0, 0.7, s).p_better >= 0.95 for s in range(60))
    assert hits / 60 <= 0.15


def test_large_difference_is_found():
    hits = sum(_run(3.0, 0.4, s).label == "はっきり差がある" for s in range(20))
    assert hits / 20 >= 0.8


def test_drift_is_not_mistaken_for_difference():
    # 体調が時間とともに大きく変わっても、差ゼロなら「はっきり差がある」が多発しない
    hits = sum(_run(0.0, 0.5, s, drift=4.0).p_better >= 0.95 for s in range(40))
    assert hits / 40 <= 0.15


def test_lower_is_better_flips_direction():
    day, treat, y, _ = fake_experiment(-2.5, rho=0.3, sigma=0.8, seed=1)
    X, names = build_design(day, treat)
    f = fit(y, X, day, names, n_draws=800, n_burn=400, seed=1)
    assert verdict(f, direction=-1).p_better > 0.9


def test_missing_days_do_not_break_fit():
    day, treat, y, _ = fake_experiment(1.0, seed=2)
    keep = ~np.isin(day, [5, 6, 15, 22])
    X, names = build_design(day[keep], treat[keep])
    f = fit(y[keep], X, day[keep], names, n_draws=400, n_burn=200, seed=2)
    assert f.n_used < len(day) - 1


def test_null_check_reports_rate():
    day, treat, y, _ = fake_experiment(2.0, rho=0.3, seed=3)
    X, names = build_design(day, treat)
    r = null_check(y, X, day, names, rho=0.3, sigma=1.0, n_sims=500)
    assert r["observed_diff"] > 0 and r["rate"] < 0.2


def test_null_check_uses_adjusted_difference():
    # v0.1.0 の問題の再発防止：補正前の単純な差ではなく、時間の流れを差し引いた後の差で比べる
    day, treat, y, _ = fake_experiment(0.0, rho=0.3, drift=6.0, seed=5, block_len=7)
    X, names = build_design(day, treat)
    r = null_check(y, X, day, names, rho=0.3, sigma=1.0, n_sims=200)
    raw = y[treat == 1].mean() - y[treat == 0].mean()
    from n1engine.model import gls_estimate
    assert abs(r["observed_diff"] - gls_estimate(y, X, day, 0.3, 1)) < 1e-9
    assert r["observed_diff"] != raw


def test_qq_statistic_zero_when_order_irrelevant():
    rng = np.random.default_rng(0)
    n = 20000
    qa = rng.integers(0, 2, n)
    qb = np.where(rng.random(n) < 0.7, qa, 1 - qa)
    order = rng.choice(["AB", "BA"], n)
    assert abs(qq_statistic(qa, qb, order)) < 0.02


def test_report_never_uses_efficacy_words():
    from n1engine.domain.substances import SUBSTANCES
    from n1engine.pipeline import analyze
    from n1engine.report import render

    for key in ("caffeine", "magnesium", "vitamin_d"):
        day, treat, y, _ = fake_experiment(1.0, seed=4)
        d = {"day": day, "treat": treat, "outcome": y, "mood": y + 0.1}
        res = analyze(d, substance=SUBSTANCES[key], n_draws=200, null_sims=50)
        md = render(item="テスト", outcome_label="寝つき", res=res, blinded=False)
        for word in ("効果", "効く", "効力", "効き", "治る", "改善します"):
            assert word not in md


def test_planner_requires_enough_baseline():
    from n1engine.simulate import plan_length

    with pytest.raises(ValueError):
        plan_length(np.array([5.0, 6.0, 5.5, 6.2, 5.8]), n_sims=1)


def test_planner_is_not_overconfident_on_short_calm_baseline():
    # 0.1.0 開発中に起きた問題の再発防止：穏やかな7日分の記録から、
    # 28日で9割以上見つけられると楽観的に出さないこと
    from n1engine.simulate import plan_length

    calm = np.array([6.0, 5.2, 6.0, 5.3, 7.0, 6.9, 6.4])
    res = plan_length(calm, block_lens=(7,), n_sims=40)
    assert res[0]["power"] < 0.9


# ---------------------------------------------------------------- v0.2.0 専門領域の層


def test_block_length_must_be_multiple_of_seven():
    with pytest.raises(ValueError):
        make_schedule(block_len=10)


def test_ka_from_tmax_round_trip():
    import math
    from n1engine.domain.pk import ka_from_tmax

    ka = ka_from_tmax(1.0, 5.0)
    ke = math.log(2) / 5.0
    assert abs(math.log(ka / ke) / (ka - ke) - 1.0) < 1e-6


def test_exposure_reaches_steady_state_and_washes_out():
    from n1engine.domain.pk import PK, daily_exposure, window_for

    pk = PK(t_half_h=24.0, tmax_h=2.0)
    day = np.arange(1, 41)
    treat = (day <= 20).astype(int)
    e = daily_exposure(day, treat, pk, 8.0, window_for("day"))
    assert e[0] < 0.7  # 初日はまだ安定していない
    assert abs(e[19] - 1.0) < 0.02  # 20日続ければ定常状態
    assert 0.3 < e[20] < 0.8  # やめた翌日も残る（持ち越し）
    assert e[30] < 0.01


def test_bedtime_residual_grows_with_later_dose():
    from n1engine.domain.pk import residual_share, window_for
    from n1engine.domain.substances import SUBSTANCES

    c = SUBSTANCES["caffeine"].pk
    night = window_for("night")
    assert residual_share(c, 8, night) < residual_share(c, 15, night) < residual_share(c, 20, night)


def test_suitability_flags_slow_substances():
    from n1engine.domain.pk import SUITABLE, UNSUITABLE, suitability, window_for
    from n1engine.domain.substances import SUBSTANCES

    w = window_for("day")
    assert suitability(SUBSTANCES["caffeine"].pk, 8, w)["level"] == SUITABLE
    assert suitability(SUBSTANCES["vitamin_d"].pk, 8, w)["level"] == UNSUITABLE
    s = SUBSTANCES["omega3"]
    assert suitability(s.pk, 8, w, steady_days=s.steady_days)["level"] == UNSUITABLE


def test_every_listed_number_has_a_source():
    from n1engine.domain.substances import SUBSTANCES

    for s in SUBSTANCES.values():
        assert s.sources, s.key
        for _, url in s.sources:
            assert url.startswith("https://")


def test_exposure_model_recovers_carryover():
    # 半減期2日（持ち越しあり）。0/1 で数えると差を小さく見積もり、曝露量で数えると戻る
    from n1engine.domain.pk import PK, window_for

    pk = PK(t_half_h=48.0, tmax_h=2.0)
    w = window_for("day")
    est01, estpk = [], []
    for s in range(12):
        day, treat, y, ex = fake_experiment(1.5, rho=0.3, sigma=0.8, seed=200 + s, pk=pk, window=w)
        X0, n0 = build_design(day, treat)
        Xp, n_ = build_design(day, ex["exposure"])
        est01.append(verdict(fit(y, X0, day, n0, n_draws=400, n_burn=200, seed=s)).effect_mean)
        estpk.append(verdict(fit(y, Xp, day, n_, n_draws=400, n_burn=200, seed=s)).effect_mean)
    assert np.mean(est01) < 1.2
    assert abs(np.mean(estpk) - 1.5) < 0.35


def test_body_responses_are_not_adjusted():
    # 補正しすぎの再発防止：気分・睡眠・心拍は補正に入れない。外部要因だけを入れる
    from n1engine.domain.variables import confounders_in

    rng = np.random.default_rng(0)
    d = {k: rng.normal(size=28) for k in ("mood", "stress", "sleep", "rhr", "rmssd", "alcohol", "offday")}
    d["cycle_day"] = np.arange(28) % 28 + 1
    conf = confounders_in(d, 28)
    assert set(conf) == {"alcohol", "offday", "cycle_sin", "cycle_cos"}


def test_blank_confounder_keeps_the_day():
    day, treat, y, _ = fake_experiment(1.0, seed=6)
    alc = np.random.default_rng(6).integers(0, 3, len(day)).astype(float)
    X1, n1 = build_design(day, treat, {"alcohol": alc})
    alc2 = alc.copy()
    alc2[[3, 10]] = np.nan
    X2, n2 = build_design(day, treat, {"alcohol": alc2})
    f1 = fit(y, X1, day, n1, n_draws=100, n_burn=50, seed=0)
    f2 = fit(y, X2, day, n2, n_draws=100, n_burn=50, seed=0)
    assert f1.n_used == f2.n_used


def test_28_day_design_overlaps_with_menstrual_cycle_but_56_day_does_not():
    from n1engine.design import CYCLE_SEQUENCES
    from n1engine.domain.variables import cycle_terms

    def overlap(seq, L, start):
        t = np.repeat([1.0 if c == "B" else 0.0 for c in seq], 7)
        n = len(t)
        cd = (np.arange(n) + start) % L + 1
        c = cycle_terms(cd, L)
        Z = np.column_stack([np.ones(n), c["cycle_sin"], c["cycle_cos"]])
        f = Z @ np.linalg.lstsq(Z, t, rcond=None)[0]
        return np.sqrt(1 - np.sum((t - f) ** 2) / np.sum((t - t.mean()) ** 2))

    for L in (25, 28, 31, 35):
        assert min(overlap("ABBA", L, s) for s in range(L)) > 0.85
        assert max(overlap(CYCLE_SEQUENCES[0], L, s) for s in range(L)) < 0.2


def test_convergence_diagnostics():
    from n1engine.diagnostics import check

    rng = np.random.default_rng(0)
    good = rng.normal(size=(4, 1000))
    bad = good + np.array([[0], [0], [0], [1.5]])
    assert check(good)["ok"]
    assert not check(bad)["ok"]


def test_example_pipeline_runs_with_domain_variables():
    from n1engine.domain.substances import SUBSTANCES
    from n1engine.pipeline import analyze
    from n1engine.run import load

    d = load(str(pathlib.Path(__file__).resolve().parents[1] / "examples" / "example.csv"))
    res = analyze(d, primary="sol", substance=SUBSTANCES["caffeine"], dose_hour=15, n_draws=300, null_sims=50)
    assert res.primary.direction == -1
    assert "mood" not in res.confounders and "alcohol" in res.confounders
    assert {r.key for r in res.secondary} >= {"rhr", "rmssd", "tst"}
    assert res.cycle_overlap is not None and res.cycle_overlap < 0.3


def test_missed_dose_lowers_exposure():
    from n1engine.domain.pk import PK, daily_exposure, window_for

    pk = PK(t_half_h=24.0, tmax_h=2.0)
    day = np.arange(1, 15)
    treat = (day <= 10).astype(int)
    taken = np.ones(14)
    full = daily_exposure(day, treat, pk, 8.0, window_for("day"), taken=taken)
    taken[5] = 0  # 6日目に飲み忘れ
    miss = daily_exposure(day, treat, pk, 8.0, window_for("day"), taken=taken)
    assert miss[5] < full[5] * 0.7
    assert np.allclose(miss[:5], full[:5])
