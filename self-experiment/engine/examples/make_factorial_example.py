"""2つの成分を掛け合わせた見本の記録（偽データ。答えが分かっている）。

  python examples/make_factorial_example.py

設定：カフェイン（15時）とテアニン（15時）を、単独でも一緒でも7日ずつ試した56日（design.make_factorial_schedule）。
主要項目は「寝つくまでの時間（分）」（その夜、低いほど良い）。本当の差（体内量が安定したとき）：
  カフェインだけ  +9分
  テアニンだけ    −3分
  一緒に取ったとき 単独の合計（+6分）から さらに −4分（上乗せ）→ 一緒だと +2分
外部要因：飲酒（1杯で寝つき+2分）、休日（寝つき−3分）。
examples/factorial.csv と examples/example_report_factorial.md を書き出す。
"""

import csv
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from n1engine.design import make_factorial_schedule  # noqa: E402
from n1engine.domain.pk import daily_exposure, window_for  # noqa: E402
from n1engine.domain.substances import SUBSTANCES  # noqa: E402
from n1engine.pipeline import Factor, analyze  # noqa: E402
from n1engine.report import render  # noqa: E402
from n1engine.run import load  # noqa: E402
from n1engine.simulate import ar1_noise  # noqa: E402

SEED = 11
rng = np.random.default_rng(SEED)
days = make_factorial_schedule(seed=SEED)
n = len(days)
day = np.array([d.day for d in days])
ta = np.array([d.levels[0] for d in days])
tb = np.array([d.levels[1] for d in days])
w = window_for("night", 23.0, 7.0)
cf, th = SUBSTANCES["caffeine"], SUBSTANCES["theanine"]
dose_a = np.where(ta == 1, np.round(rng.normal(15, 0.6, n) * 4) / 4, np.nan)
dose_b = np.where(tb == 1, np.round(rng.normal(15, 0.4, n) * 4) / 4, np.nan)
xa = daily_exposure(day, ta, cf.pk, 15.0, w, dose_a)
xb = daily_exposure(day, tb, th.pk, 15.0, w, dose_b)
alcohol = (rng.random(n) < 0.2).astype(float)
offday = ((day - 1) % 7 >= 5).astype(float)
sol = 22 + 9 * xa - 3 * xb - 4 * xa * xb + 2 * alcohol - 3 * offday + ar1_noise(n, 0.5, 4.0, rng)

out = pathlib.Path(__file__).with_name("factorial.csv")
with out.open("w", newline="", encoding="utf-8") as f:
    wr = csv.writer(f)
    wr.writerow(["day", "phase", "phase_theanine", "sol", "alcohol", "offday", "dose_hour", "dose_hour_theanine"])
    for i, d in enumerate(days):
        wr.writerow([d.day, "B" if ta[i] else "A", "B" if tb[i] else "A", round(max(sol[i], 1)),
                     int(alcohol[i]), int(offday[i]),
                     "" if np.isnan(dose_a[i]) else dose_a[i], "" if np.isnan(dose_b[i]) else dose_b[i]])
print(f"書き出しました: {out}")

res = analyze(load(str(out)), primary="sol", timing="night", substance=cf, dose_hour=15.0, extras=[Factor("theanine", th.name, th, 15.0)], n_draws=1000, null_sims=2000, secondary=False)
md = render(item="カフェイン（15時）× テアニン（15時）", outcome_label=None, res=res, blinded=False)
rp = pathlib.Path(__file__).with_name("example_report_factorial.md")
rp.write_text(md, encoding="utf-8")
print(f"書き出しました: {rp}")
