"""実際の記録（nof1kit のメラトニン70日）にエンジンを当て、当てはまりを確かめる。

  python scripts/realdata.py

日ごとの気分の平均（0〜100 を 10 で割って 0〜10）を主要項目にし、その日の割り付け（その夜に飲むか）と、
前の夜の割り付けの2通りで分析する。記録した順番は study_day（事前登録の日番号）を使う。
"""

import collections
import csv
import json
import pathlib
import sys

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from n1engine.pipeline import analyze  # noqa: E402

D = ROOT / "examples" / "realdata"
rows = list(csv.DictReader(open(D / "melatonin_ema.csv", encoding="utf-8")))
sched = {int(k): v for k, v in json.load(open(D / "melatonin_schedule.json")).items()}
mood = collections.defaultdict(list)
for r in rows:
    mood[int(float(r["study_day"]))].append(float(r["mood"]))
days = sorted(mood)
y = np.array([np.mean(mood[d]) / 10 for d in days])
day = np.array(days)

for label, treat in (("その夜に飲むか（同じ日）", np.array([sched[d] for d in days])),
                     ("前の夜に飲んだか", np.array([sched.get(d - 1, 0) for d in days]))):
    for pd in (True, False):
        r = analyze({"day": day, "treat": treat, "outcome": y}, null_sims=1000, secondary=False, pd=pd)
        p = r.primary
        fc = p.fitcheck
        print(f"{label}｜遅れ{'あり' if pd else 'なし'}：{p.v.label} 差 {p.v.effect_mean:+.2f}（90%の幅 {p.v.effect_low:+.2f}〜{p.v.effect_high:+.2f}）"
              f" 良かった確率 {p.v.p_better:.0%}｜当てはまり：予測幅に入った日 {fc['coverage90']:.0%}（{fc['n']}日）"
              f" 規則性 p={fc['ljung_box_p']:.2f} 期間のずれ p={fc['block_p']:.2f} → {'合っている' if fc['ok'] else '合っていない'}"
              + (f"｜外した遅れ {p.excluded_lags}" if pd else ""))
