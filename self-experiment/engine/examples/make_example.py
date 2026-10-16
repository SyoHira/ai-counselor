"""見本の記録を作る（偽データ。答えが分かっている）。

  python examples/make_example.py

設定：15時にカフェインを摂る期間（B）と摂らない期間（A）を7日ずつ8期間（56日、ABABBABA／BABAABAB）。
月経周期を記録する人なので、周期の時期と重ならない56日の並びを使う（design.py）。
主要項目は「寝つくまでの時間（分）」。本当の差は、体内のカフェイン量が安定したときに +8分。
体内量はカフェインの代表値（半減期5時間・最高濃度まで1時間）で計算し、実際に飲んだ時刻は
15時の前後にばらつく。

ほかの記録の答え（体内量が安定したとき）
  睡眠の質（0〜10）        −0.6点
  眠っていた時間（分）      −12分
  睡眠中の心拍数（拍/分）    +1.5拍/分、さらに月経周期で ±1.9拍/分の波（周期29日）
  心拍変動 RMSSD（ミリ秒）   −6%
  気分（0〜10）            差なし
外部要因：飲酒（1杯で寝つき−2分・心拍+1.5拍/分）、休日（寝つき−3分）
記録し忘れ：12日目・20日目・41日目は行ごと無い。飲酒の空欄が2日。
"""

import csv
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from n1engine.design import make_schedule  # noqa: E402
from n1engine.domain.pk import daily_exposure, window_for  # noqa: E402
from n1engine.domain.substances import SUBSTANCES  # noqa: E402
from n1engine.simulate import ar1_noise  # noqa: E402

rng = np.random.default_rng(7)
days = make_schedule(seed=7, cycle=True)
n = len(days)
day = np.array([d.day for d in days])
treat = np.array([1 if d.phase == "B" else 0 for d in days])
dose_hour = np.where(treat == 1, np.round(15 + rng.normal(0, 0.7, n), 1), np.nan)
ex = daily_exposure(day, treat, SUBSTANCES["caffeine"].pk, 15.0, window_for("night"), dose_hour)

offday = np.isin((day - 1) % 7, (5, 6)).astype(int)
alcohol = rng.choice([0, 0, 0, 1, 2], n).astype(float)
cycle_day = (np.arange(n) + 11) % 29 + 1
cyc = np.sin(2 * np.pi * (cycle_day - 1) / 29)

sol = 18 + 8 * ex - 2 * alcohol - 3 * offday + ar1_noise(n, 0.4, 5.0, rng)
sleep = 6 - 0.6 * ex + ar1_noise(n, 0.4, 0.9, rng)
tst = 420 - 12 * ex + ar1_noise(n, 0.3, 25, rng)
rhr = 58 + 1.5 * ex + 1.5 * alcohol + 1.9 * cyc + ar1_noise(n, 0.5, 1.2, rng)
rmssd = np.exp(np.log(45) + np.log(0.94) * ex + ar1_noise(n, 0.5, 0.12, rng))
mood = 6 + ar1_noise(n, 0.5, 1.0, rng)

alcohol_rec = alcohol.copy()
alcohol_rec[[4, 17]] = np.nan  # 書き忘れ

out = pathlib.Path(__file__).with_name("example.csv")
with out.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["day", "phase", "sol", "sleep", "tst", "rhr", "rmssd", "mood", "alcohol", "offday", "cycle_day", "dose_hour"])
    for i, d in enumerate(days):
        if d.day in (12, 20, 41):  # 記録し忘れた日
            continue
        w.writerow([
            d.day, d.phase,
            round(max(sol[i], 1)), round(float(np.clip(sleep[i], 0, 10)), 1), round(tst[i]),
            round(rhr[i], 1), round(rmssd[i], 1), round(float(np.clip(mood[i], 0, 10)), 1),
            "" if np.isnan(alcohol_rec[i]) else int(alcohol_rec[i]), offday[i], cycle_day[i],
            "" if np.isnan(dose_hour[i]) else dose_hour[i],
        ])
print(f"書き出しました: {out}")
