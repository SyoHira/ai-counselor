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
    r = null_check(y, treat, rho=0.3, sigma=1.0, n_sims=500)
    assert r["observed_diff"] > 0 and r["rate"] < 0.2


def test_qq_statistic_zero_when_order_irrelevant():
    rng = np.random.default_rng(0)
    n = 20000
    qa = rng.integers(0, 2, n)
    qb = np.where(rng.random(n) < 0.7, qa, 1 - qa)
    order = rng.choice(["AB", "BA"], n)
    assert abs(qq_statistic(qa, qb, order)) < 0.02


def test_report_never_uses_efficacy_words():
    from n1engine.report import render

    day, treat, y, _ = fake_experiment(1.0, seed=4)
    X, names = build_design(day, treat)
    f = fit(y, X, day, names, n_draws=400, n_burn=200, seed=4)
    v = verdict(f)
    md = render(
        item="テスト", outcome_label="寝つき", v=v, n_days=28, n_pairs=f.n_used,
        covariates=[], null={"observed_diff": 1.0, "rate": 0.05, "one_in": 20},
        mid=1.0, priors=f.priors, blinded=False,
    )
    for word in ("効果", "効く", "効力", "治る", "改善します"):
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
