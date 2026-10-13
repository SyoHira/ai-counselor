"""見本の記録を作る。答え（本当の差）は 1.2点。

  python examples/make_example.py
"""

import csv
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from n1engine.design import make_schedule  # noqa: E402
from n1engine.simulate import ar1_noise  # noqa: E402

rng = np.random.default_rng(7)
days = make_schedule(seed=7)
n = len(days)
mood = np.clip(rng.normal(6, 1.5, n), 0, 10)
stress = np.clip(rng.normal(4, 1.5, n), 0, 10)
sleep = np.clip(rng.normal(6, 1.2, n), 0, 10)
treat = np.array([1 if d.phase == "B" else 0 for d in days])
y = 5 + 1.2 * treat + 0.3 * (mood - 6) - 0.2 * (stress - 4) + ar1_noise(n, 0.5, 0.9, rng)
y = np.clip(np.round(y, 1), 0, 10)
qa = rng.integers(0, 2, n)
qb = np.where(rng.random(n) < 0.7, qa, 1 - qa)

out = pathlib.Path(__file__).with_name("example.csv")
with out.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["day", "phase", "outcome", "mood", "stress", "sleep", "qa", "qb", "pair_order"])
    for i, d in enumerate(days):
        if d.day in (12, 20):  # 記録し忘れた日
            continue
        w.writerow([d.day, d.phase, y[i], round(mood[i], 1), round(stress[i], 1), round(sleep[i], 1), qa[i], qb[i], d.pair_order])
print(f"書き出しました: {out}")
