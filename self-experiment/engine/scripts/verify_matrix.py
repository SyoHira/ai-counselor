"""複数の成分を掛け合わせた分析の検証（v0.5.0）。成分の組 × 本当の差の組み合わせを総当たりで確かめる。

  python scripts/verify_matrix.py --list
  python scripts/verify_matrix.py --pair caffeine-theanine --scenario synergy --n 30
  python scripts/verify_matrix.py --all --n 30 --jobs 4 --out matrix.json

答えの分かっている偽の記録（2つの成分を単独・一緒に試す56日）を、本番と同じ analyze() で分析し、
次の項目を数える。しきい値を下回ったら終了コード1で終わる（CI で使う）。

  成分の組（PAIRS）      体内動態のある成分どうし／ない成分との組／半減期が短い成分どうし
  本当の差（SCENARIOS）  null＝どれも差なし／main＝単独の差だけ／synergy＝一緒だと上乗せ／antagonism＝一緒だと打ち消し
  数えるもの             各項目（Aだけ・Bだけ・上乗せ）の「90%の幅が正解を含む割合」、
                         差があるとき見つけた割合、差が無いのに「はっきり差がある」と言った割合、
                         計算が落ち着いた割合（R̂・ESS）、当てはまりの確認を通った割合、並びの重なり（VIF）

しきい値は、同じ件数・同じ乱数の種で測った値（CALIBRATION.md v0.5.0）に余裕を持たせて決めている。
乱数の種は固定なので、同じ環境なら同じ結果になる。
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from n1engine.design import make_factorial_schedule  # noqa: E402
from n1engine.domain.pk import daily_exposure, window_for  # noqa: E402
from n1engine.domain.substances import SUBSTANCES, custom  # noqa: E402
from n1engine.pipeline import Factor, analyze  # noqa: E402
from n1engine.simulate import ar1_noise  # noqa: E402

# 一覧にない成分（半減期24時間）。翌日にも体内量が残るので、成分どうしの持ち越しが重なる。
SLOW = custom(24.0, 2.0, "半減期24時間の成分")
CATALOG = {**SUBSTANCES, "halflife24h": SLOW}

PAIRS = {
    "caffeine-theanine": ("caffeine", "theanine"),  # どちらも体内動態あり（半減期5時間と約1時間）
    "caffeine-magnesium": ("caffeine", "magnesium"),  # 片方は体内動態なし（飲んだ日=1）
    "theanine-magnesium": ("theanine", "magnesium"),
    "caffeine-halflife24h": ("caffeine", "halflife24h"),  # 片方は翌日にも残る（持ち越しが重なる）
}

# (Aだけ, Bだけ, 一緒のときの上乗せ)。単位は0〜10の点。ばらつき(sigma)は1点、前日の引きずりは0.5。
SCENARIOS = {
    "null": (0.0, 0.0, 0.0),
    "main": (2.0, -1.5, 0.0),
    "synergy": (1.5, 1.5, 2.0),
    "antagonism": (2.0, 2.0, -2.5),
}

RHO, SIGMA = 0.5, 1.0


def make_record(pair: str, scenario: str, seed: int) -> tuple[dict, list[Factor]]:
    ka, kb = PAIRS[pair]
    sa, sb = CATALOG[ka], CATALOG[kb]
    ea, eb, ei = SCENARIOS[scenario]
    rng = np.random.default_rng(seed)
    days = make_factorial_schedule(seed=seed)
    day = np.array([d.day for d in days])
    ta = np.array([d.levels[0] for d in days])
    tb = np.array([d.levels[1] for d in days])
    w = window_for("day", 23.0, 7.0)
    ex = []
    for s, t in ((sa, ta), (sb, tb)):
        ex.append(t.astype(float) if s.pk is None else daily_exposure(day, t, s.pk, 8.0, w))
    y = 5 + ea * ex[0] + eb * ex[1] + ei * ex[0] * ex[1] + ar1_noise(len(day), RHO, SIGMA, rng)
    d = {"day": day, "treat": ta, "treat_" + kb: tb, "outcome": np.clip(y, 0, 10)}
    return d, [Factor(kb, sb.name, sb, 8.0)]


def run_one(args: tuple) -> dict:
    pair, scenario, seed = args
    if os.environ.get("N1_INTERACTION_SD"):  # 事前分布の比較用（本番の既定値は model.DEFAULT_PRIORS）
        from n1engine import model

        model.DEFAULT_PRIORS["interaction_sd"] = float(os.environ["N1_INTERACTION_SD"])
    ka, _ = PAIRS[pair]
    d, extras = make_record(pair, scenario, seed)
    r = analyze(d, primary="outcome", substance=CATALOG[ka], dose_hour=8.0, extras=extras, seed=seed,
                n_draws=500, null_sims=50, secondary=False)
    m = r.primary.multi
    truth = dict(zip(("A", "B", "X"), SCENARIOS[scenario]))
    est = {"A": m["factors"][0]["v"], "B": m["factors"][1]["v"], "X": m["interactions"][0]["v"]}
    out = {"seed": seed}
    for k, v in est.items():
        out[k] = {"mean": v.effect_mean, "low": v.effect_low, "high": v.effect_high, "p": v.p_better,
                  "cover": bool(v.effect_low <= truth[k] <= v.effect_high)}
    terms = r.primary.fit.diag["terms"]
    out["converged"] = bool(all(t["ok"] for t in terms.values()))
    out["fit_ok"] = bool(r.primary.fitcheck["ok"])
    out["vif"] = max(m["vif"].values())
    return out


def summarize(pair: str, scenario: str, rows: list[dict]) -> dict:
    n = len(rows)
    truth = dict(zip(("A", "B", "X"), SCENARIOS[scenario]))
    s = {"pair": pair, "scenario": scenario, "n": n, "terms": {}}
    for k in ("A", "B", "X"):
        p = np.array([r[k]["p"] for r in rows])
        t = truth[k]
        item = {
            "truth": t,
            "mean_estimate": float(np.mean([r[k]["mean"] for r in rows])),
            "coverage": float(np.mean([r[k]["cover"] for r in rows])),
        }
        if t == 0:
            item["false_alarm"] = float(np.mean((p >= 0.95) | (p <= 0.05)))  # 両側（どちら向きでも「はっきり差がある」）
        else:
            item["found_right_way"] = float(np.mean(p >= 0.95 if t > 0 else p <= 0.05))
            item["found_wrong_way"] = float(np.mean(p <= 0.05 if t > 0 else p >= 0.95))
        s["terms"][k] = item
    s["converged"] = float(np.mean([r["converged"] for r in rows]))
    s["fit_ok"] = float(np.mean([r["fit_ok"] for r in rows]))
    s["max_vif"] = float(max(r["vif"] for r in rows))
    return s


# しきい値。value は (下限 or 上限, 向き)。「≥」は下限、「≤」は上限。
THRESHOLDS = {
    "coverage": ("≥", 0.70),  # 90%の幅が正解を含む割合（名目90%、v0.4.0 の1成分では87%）
    "false_alarm": ("≤", 0.25),  # 差が無い項目で、どちら向きでも「はっきり差がある」と言った割合
    "found_wrong_way": ("≤", 0.05),  # 差があるのに、逆向きに「はっきり差がある」と言った割合
    "converged": ("≥", 0.85),  # R̂<1.01 かつ ESS≥400 を満たした割合（測った値は90〜98%）
    "fit_ok": ("≥", 0.85),  # 当てはまりの確認を通った割合（式が合っているときの誤報は約3%）
    "max_vif": ("≤", 5.0),  # 56日の並びで、どの項目も見分けられる
}
# 本当に差がある項目を見つける割合の下限（シナリオ・項目ごと）。測った値に余裕を持たせた値。
FOUND_MIN = {("main", "A"): 0.70, ("main", "B"): 0.40, ("synergy", "X"): 0.35, ("antagonism", "X"): 0.35}


def check(s: dict) -> list[str]:
    bad = []

    def need(name, val, op, thr, label):
        if (op == "≥" and val < thr) or (op == "≤" and val > thr):
            bad.append(f"{s['pair']}/{s['scenario']} {label}: {val:.2f}（基準 {op}{thr}）")

    for k, t in s["terms"].items():
        need("coverage", t["coverage"], *THRESHOLDS["coverage"], f"{k}の幅の正しさ")
        if "false_alarm" in t:
            need("false_alarm", t["false_alarm"], *THRESHOLDS["false_alarm"], f"{k}の誤報")
        else:
            need("found_wrong_way", t["found_wrong_way"], *THRESHOLDS["found_wrong_way"], f"{k}の逆向きの判定")
            if (s["scenario"], k) in FOUND_MIN:
                need("found", t["found_right_way"], "≥", FOUND_MIN[(s["scenario"], k)], f"{k}を見つけた割合")
    for key in ("converged", "fit_ok", "max_vif"):
        need(key, s[key], *THRESHOLDS[key], {"converged": "計算が落ち着いた割合", "fit_ok": "当てはまり", "max_vif": "並びの重なり"}[key])
    return bad


def fmt(s: dict) -> str:
    lines = [f"{s['pair']} / {s['scenario']}（n={s['n']}）  落ち着いた {s['converged']:.0%}  当てはまり {s['fit_ok']:.0%}  VIF最大 {s['max_vif']:.1f}"]
    for k, t in s["terms"].items():
        extra = f"誤報 {t['false_alarm']:.0%}" if "false_alarm" in t else f"見つけた {t['found_right_way']:.0%}・逆向き {t['found_wrong_way']:.0%}"
        lines.append(f"  {k}: 正解 {t['truth']:+.1f} 推定平均 {t['mean_estimate']:+.2f}  幅の正しさ {t['coverage']:.0%}  {extra}")
    return "\n".join(lines)


def run_cell(pair: str, scenario: str, n: int, jobs: int, seed0: int) -> dict:
    tasks = [(pair, scenario, seed0 + i) for i in range(n)]
    if jobs > 1:
        with ProcessPoolExecutor(jobs) as ex:
            rows = list(ex.map(run_one, tasks))
    else:
        rows = [run_one(t) for t in tasks]
    return summarize(pair, scenario, rows)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pair", choices=list(PAIRS))
    ap.add_argument("--scenario", choices=list(SCENARIOS))
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--n", type=int, default=30)
    ap.add_argument("--jobs", type=int, default=1)
    ap.add_argument("--seed0", type=int, default=100)
    ap.add_argument("--out")
    ap.add_argument("--no-check", action="store_true", help="しきい値で落とさず、数字だけ出す")
    a = ap.parse_args(argv)
    if a.list:
        print(json.dumps({"pair": list(PAIRS), "scenario": list(SCENARIOS)}, ensure_ascii=False))
        return 0
    cells = [(p, s) for p in PAIRS for s in SCENARIOS] if a.all else [(a.pair, a.scenario)]
    if not a.all and not (a.pair and a.scenario):
        ap.error("--pair と --scenario、または --all を指定する")
    results, failures = [], []
    for p, sc in cells:
        s = run_cell(p, sc, a.n, a.jobs, a.seed0)
        print(fmt(s), flush=True)
        results.append(s)
        failures += check(s)
    if a.out:
        pathlib.Path(a.out).write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    if failures and not a.no_check:
        print("\nしきい値を満たしていません：")
        for f in failures:
            print("  -", f)
        return 1
    if a.no_check:
        print("\n（--no-check：しきい値の判定はしていません）")
    else:
        print("\nすべてのしきい値を満たしました。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
