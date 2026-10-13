"""実行の入口。

  記録の分析：
    python -m n1engine.run analyze 記録.csv --item "マグネシウム（就寝前）" --outcome-label "寝つきの良さ"

  実験前の日数の見積もり（普段通りの記録が数日〜1週間あるとき）：
    python -m n1engine.run plan 普段の記録.csv

CSVの列
  day       1始まりの日番号（抜けた日は行ごと無くてよい）
  phase     A=普段通り / B=飲む
  outcome   知りたい項目（0〜10）
  mood, stress, sleep   その日の気分・ストレス・前夜の睡眠の質（0〜10、任意）
  belief    中身を隠す上級版のみ。今日は本物を飲んだと思う=1 / 思わない=0
"""

from __future__ import annotations

import argparse
import csv
import sys

import numpy as np

from .blinding import belief_association, blind_integrity
from .model import build_design, fit, verdict
from .report import render
from .simulate import null_check, plan_length

KNOWN_COVARIATES = ("mood", "stress", "sleep")


def load(path: str) -> dict[str, np.ndarray]:
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise SystemExit("CSVが空です")

    def col(name, cast=float):
        if name not in rows[0]:
            return None
        out = []
        for r in rows:
            v = (r.get(name) or "").strip()
            out.append(cast(v) if v != "" else np.nan)
        return np.array(out, dtype=float if cast is float else object)

    data = {"day": col("day").astype(int), "outcome": col("outcome")}
    if "phase" in rows[0]:
        data["treat"] = np.array([1 if r["phase"].strip().upper() == "B" else 0 for r in rows])
    for c in (*KNOWN_COVARIATES, "belief"):
        v = col(c)
        if v is not None and not np.all(np.isnan(v)):
            data[c] = v
    return data


def cmd_analyze(a: argparse.Namespace) -> None:
    d = load(a.csv)
    direction = -1 if a.lower_is_better else 1
    covs = [c for c in KNOWN_COVARIATES if c in d]
    X, names = build_design(d["day"], d["treat"], {c: d[c] for c in covs})
    f = fit(d["outcome"], X, d["day"], names, seed=a.seed)
    v = verdict(f, direction=direction, mid=a.mid)

    sigma = float(f.sigma_draws.mean())
    null = null_check(d["outcome"], d["treat"], v.rho_mean, sigma, direction=direction, seed=a.seed)

    blind = belief = None
    if a.blinded and "belief" in d:
        blind = blind_integrity(d["belief"], d["treat"])
        belief = belief_association(d["outcome"] * direction, d["treat"], d["belief"])

    md = render(
        item=a.item,
        outcome_label=a.outcome_label,
        v=v,
        n_days=int(np.sum(~np.isnan(d["outcome"]))),
        n_pairs=f.n_used,
        covariates=covs,
        null=null,
        mid=a.mid,
        priors=f.priors,
        blinded=a.blinded,
        blind=blind,
        belief=belief,
    )
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            fh.write(md)
        print(f"レポートを書き出しました: {a.out}")
    else:
        print(md)


def cmd_plan(a: argparse.Namespace) -> None:
    d = load(a.csv)
    res = plan_length(d["outcome"], effect=a.effect, n_sims=a.sims, seed=a.seed)
    print(f"{a.effect:g}点の差が本当にあるとき、「はっきり差がある」と判定できる確率")
    for r in res:
        print(f"  {r['days']:>3}日：{round(r['power'] * 100)}%")


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="n1engine")
    sub = p.add_subparsers(dest="cmd", required=True)

    an = sub.add_parser("analyze", help="記録を分析してレポートを作る")
    an.add_argument("csv")
    an.add_argument("--item", required=True, help="試したもの（例：マグネシウム（就寝前））")
    an.add_argument("--outcome-label", required=True, help="記録した項目（例：寝つきの良さ）")
    an.add_argument("--lower-is-better", action="store_true", help="数字が低いほど良い項目（だるさ等）")
    an.add_argument("--mid", type=float, default=1.0, help="意味のある差の大きさ（点）")
    an.add_argument("--blinded", action="store_true", help="中身を隠す上級版")
    an.add_argument("--out")
    an.add_argument("--seed", type=int, default=0)
    an.set_defaults(func=cmd_analyze)

    pl = sub.add_parser("plan", help="何日必要かを見積もる")
    pl.add_argument("csv")
    pl.add_argument("--effect", type=float, default=1.0)
    pl.add_argument("--sims", type=int, default=100)
    pl.add_argument("--seed", type=int, default=0)
    pl.set_defaults(func=cmd_plan)

    a = p.parse_args(argv)
    a.func(a)


if __name__ == "__main__":
    main(sys.argv[1:])
