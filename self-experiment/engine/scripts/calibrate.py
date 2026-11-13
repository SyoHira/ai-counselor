"""検証：答えの分かっている偽データで、判定の誤りの割合と幅の正しさを測る。

  python scripts/calibrate.py   （10分前後）

結果は CALIBRATION.md に記録する。分析方法を変えたら必ず再実行する。
"""
import sys, time
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import numpy as np
from scipy import stats
from n1engine.simulate import fake_experiment
from n1engine.model import build_design, fit_chains, verdict
from n1engine.domain import pd as pdm

def run(label, effect, rho, drift, n=200):
    ours_pos = naive_pos = cover = 0
    for s in range(n):
        day, treat, y, _ = fake_experiment(effect, rho=rho, sigma=1.0, drift=drift, seed=s)
        X, names = build_design(day, treat)
        v = verdict(fit_chains(y, X, day, names, n_draws=250, n_burn=300, seed=s, robust=True,
                                treat_options=pdm.options(treat.astype(float))[:, day - 1],
                                option_logprior=np.where(pdm.identifiable(pdm.options(treat.astype(float))[:, day - 1], day), pdm.log_prior(), -np.inf)))  # 本番と同じ（4本並行・遅れの推定・t 分布）
        ours_pos += v.p_better >= 0.95
        cover += v.effect_low <= effect <= v.effect_high
        t = stats.ttest_ind(y[treat == 1], y[treat == 0], equal_var=False, alternative='greater')
        naive_pos += t.pvalue < 0.05
    print(f"{label}: 「はっきり差がある」と判定した割合  このエンジン={ours_pos/n:.1%}  普通の比較={naive_pos/n:.1%}  正解が90%幅に入った割合={cover/n:.1%}", flush=True)

t0 = time.time()
run("A 差ゼロ・引きずり0.6", 0.0, 0.6, 0.0)
run("B 差ゼロ・引きずり0.6・体調が徐々に変化", 0.0, 0.6, 3.0)
run("C 差ゼロ・引きずり0.8", 0.0, 0.8, 0.0)


run("D 差1点・引きずり0.5", 1.0, 0.5, 0.0)
run("E 差1点・引きずり0.8", 1.0, 0.8, 0.0)
print(f"所要 {time.time()-t0:.0f}s")
