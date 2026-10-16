"""複数人を前提にした分析の見本（偽データ。答えが分かっている）。

  python examples/make_cohort_example.py

設定：マグネシウム（就寝前）を試した12人。主要項目は「朝のだるさの少なさ」（0〜10、高いほど良い）。
  - 各人の本当の差は 正規(0.6, 0.3²) から出る
  - 記録に現れるまでの遅れは全員 2日
  - 4人は中身を隠して飲み、8人は中身を知って飲んだ。中身を知った人は期待で +0.5点 上乗せされる
最後の1人（中身を知って飲んだ人、本当の差 {theta_last}）のレポートを examples/example_report_cohort.md に書き出す。
"""

import pathlib
import sys
import tempfile

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from n1engine.cohort import CohortStore  # noqa: E402
from n1engine.design import make_schedule  # noqa: E402
from n1engine.domain import pd as pdm  # noqa: E402
from n1engine.domain.substances import SUBSTANCES  # noqa: E402
from n1engine.pipeline import analyze  # noqa: E402
from n1engine.report import render  # noqa: E402
from n1engine.simulate import ar1_noise  # noqa: E402

rng = np.random.default_rng(11)
K = 12
theta = rng.normal(0.6, 0.3, K)
blinded = [True] * 4 + [False] * (K - 4)
store = CohortStore(pathlib.Path(tempfile.mkdtemp()) / "cohort.json")
for i in range(K):
    days = make_schedule(seed=500 + i)
    treat = np.array([1 if d.phase == "B" else 0 for d in days])
    day = np.array([d.day for d in days])
    z = pdm.lag_filter(treat.astype(float), 2.0)
    y = 5 + (theta[i] + (0 if blinded[i] else 0.5)) * z + ar1_noise(len(day), 0.5, 0.9, rng)
    res = analyze({"day": day, "treat": treat, "outcome": y}, substance=SUBSTANCES["magnesium"], cohort=store,
                  client_id=f"client{i + 1:02d}", blinded=blinded[i], null_sims=1000, seed=i, secondary=False)
md = render(item="マグネシウム（就寝前）", outcome_label="朝のだるさの少なさ", res=res, blinded=False)
out = ROOT / "examples" / "example_report_cohort.md"
out.write_text(f"<!-- 偽データ。この人の本当の差 {theta[-1]:+.2f}点（期待の上乗せ +0.5点は含まない）、遅れ2日 -->\n" + md, encoding="utf-8")
print(f"書き出しました: {out}（本当の差 {theta[-1]:+.2f}）")
