"""実行の入口。

  記録の分析：
    python -m n1engine.run analyze 記録.csv --item "カフェイン（15時）" \\
        --outcome sol --substance caffeine --dose-hour 15

  実験前の日数の見積もり（普段通りの記録が7日以上あるとき）：
    python -m n1engine.run plan 普段の記録.csv --substance caffeine --dose-hour 15 --timing night

  成分の一覧と、7日ずつの入れ替えに向いているか：
    python -m n1engine.run substances

CSVの列（項目の意味・役割は n1engine/domain/variables.py）
  day        1始まりの日番号（抜けた日は行ごと無くてよい）
  phase      A=普段通り / B=飲む
  主要項目    実験前に決めた1つ（--outcome で指定。既定は outcome）
  体の反応    mood, stress, sleep, sol, waso, tst, tib, se, rhr, rmssd（あれば参考として出す）
  外部要因    alcohol, coffee, offday, sick, cycle_day（あれば補正に使う）
  dose_hour  実際に飲んだ時刻（21.5 = 21時30分）
  belief     中身を隠す上級版のみ。今日は本物を飲んだと思う=1 / 思わない=0
  夜の項目（睡眠・睡眠中の心拍など）は翌朝に書くが、その日の行に入れる。
"""

from __future__ import annotations

import argparse
import csv
import sys

import numpy as np

from .blinding import belief_association, blind_integrity
from .domain.pk import window_for
from .domain.substances import SUBSTANCES, custom
from .domain.pk import suitability
from .domain.variables import VARIABLES, transformed
from .pipeline import _scale, analyze
from .report import render
from .simulate import plan_length

TEXT_COLUMNS = ("phase", "pair_order")


def load(path: str) -> dict[str, np.ndarray]:
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise SystemExit("CSVが空です")
    data: dict[str, np.ndarray] = {}
    for name in rows[0]:
        if name in TEXT_COLUMNS:
            continue
        vals = []
        for r in rows:
            v = (r.get(name) or "").strip()
            vals.append(float(v) if v != "" else np.nan)
        arr = np.array(vals, dtype=float)
        if not np.all(np.isnan(arr)):
            data[name] = arr
    data["day"] = data["day"].astype(int)
    if "phase" in rows[0]:
        data["treat"] = np.array([1 if r["phase"].strip().upper() == "B" else 0 for r in rows])
    return data


def _substance(a):
    if a.half_life:
        return custom(a.half_life, a.tmax, a.item if hasattr(a, "item") else "指定の成分")
    if a.substance:
        if a.substance not in SUBSTANCES:
            raise SystemExit(f"成分の一覧にありません: {a.substance}（{', '.join(SUBSTANCES)}）")
        return SUBSTANCES[a.substance]
    return None


def cmd_analyze(a: argparse.Namespace) -> None:
    d = load(a.csv)
    direction = -1 if a.lower_is_better else None
    res = analyze(
        d,
        primary=a.outcome,
        timing=a.timing,
        direction=direction,
        substance=_substance(a),
        dose_hour=a.dose_hour,
        bedtime=a.bedtime,
        waketime=a.waketime,
        cycle_length=a.cycle_length,
        mid=a.mid,
        seed=a.seed,
    )
    blind = belief = None
    if a.blinded and "belief" in d:
        blind = blind_integrity(d["belief"], d["treat"])
        belief = belief_association(d[a.outcome] * (res.primary.direction or 1), d["treat"], d["belief"])
    md = render(item=a.item, outcome_label=a.outcome_label, res=res, blinded=a.blinded, blind=blind, belief=belief)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            fh.write(md)
        print(f"レポートを書き出しました: {a.out}")
    else:
        print(md)


def cmd_plan(a: argparse.Namespace) -> None:
    d = load(a.csv)
    sub = _substance(a)
    w = window_for(a.timing, a.bedtime, a.waketime)
    pk = sub.pk if sub else None
    var = VARIABLES.get(a.outcome)
    unit = var.unit if var else "0〜10"
    y, sd, _ = _scale(transformed(a.outcome, d[a.outcome]), np.zeros(len(d["day"]), dtype=int), unit)
    res = plan_length(y, effect=a.effect / sd, n_sims=a.sims, seed=a.seed, pk=pk, dose_hour=a.dose_hour, window=w)
    if sub:
        s = suitability(pk, a.dose_hour, w, steady_days=sub.steady_days)
        print(f"{sub.name}：{s['level']}。{s['text']}")
    print(f"{a.effect:g}（{unit}）の差が本当にあるとき、「はっきり差がある」と判定できる確率")
    for r in res:
        print(f"  {r['days']:>3}日：{round(r['power'] * 100)}%")


def cmd_substances(a: argparse.Namespace) -> None:
    w = window_for(a.timing, a.bedtime, a.waketime)
    for s in SUBSTANCES.values():
        r = suitability(s.pk, a.dose_hour, w, steady_days=s.steady_days)
        th = (f"半減期 {s.pk.t_half_h:.3g}時間" if s.pk.t_half_h < 48 else f"半減期 {s.pk.t_half_h / 24:.3g}日") if s.pk else "半減期 なし"
        print(f"{s.key:10s} {s.name}｜{th}｜{r['level']}：{r['text']}")


def _common(p):
    p.add_argument("--substance", help=f"成分（{', '.join(SUBSTANCES)}）")
    p.add_argument("--half-life", type=float, help="一覧に無い成分の半減期（時間）")
    p.add_argument("--tmax", type=float, help="一覧に無い成分の最高濃度までの時間（時間）")
    p.add_argument("--dose-hour", type=float, default=8.0, help="飲む予定の時刻（既定 8時）")
    p.add_argument("--timing", choices=("day", "night"), default="day", help="主要項目の時間帯（日中／その夜）")
    p.add_argument("--bedtime", type=float, default=23.0)
    p.add_argument("--waketime", type=float, default=7.0)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="n1engine")
    sub = p.add_subparsers(dest="cmd", required=True)

    an = sub.add_parser("analyze", help="記録を分析してレポートを作る")
    an.add_argument("csv")
    an.add_argument("--item", required=True, help="試したもの（例：カフェイン（15時））")
    an.add_argument("--outcome", default="outcome", help="主要項目の列名（実験前に決めた1つ）")
    an.add_argument("--outcome-label", help="主要項目の呼び名（一覧にない列のとき）")
    an.add_argument("--lower-is-better", action="store_true", help="数字が低いほど良い項目（だるさ等）")
    an.add_argument("--mid", type=float, help="意味のある差の大きさ（主要項目の単位。0〜10の項目は既定1点）")
    an.add_argument("--cycle-length", type=float, default=28.0, help="月経周期の長さ（日）")
    an.add_argument("--blinded", action="store_true", help="中身を隠す上級版")
    an.add_argument("--out")
    an.add_argument("--seed", type=int, default=0)
    _common(an)
    an.set_defaults(func=cmd_analyze)

    pl = sub.add_parser("plan", help="何日必要かを見積もる")
    pl.add_argument("csv")
    pl.add_argument("--outcome", default="outcome")
    pl.add_argument("--effect", type=float, default=1.0)
    pl.add_argument("--sims", type=int, default=100)
    pl.add_argument("--seed", type=int, default=0)
    _common(pl)
    pl.set_defaults(func=cmd_plan)

    su = sub.add_parser("substances", help="成分の一覧と、7日ずつの入れ替えに向いているか")
    _common(su)
    su.set_defaults(func=cmd_substances)

    a = p.parse_args(argv)
    a.func(a)


if __name__ == "__main__":
    main(sys.argv[1:])
