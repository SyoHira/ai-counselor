"""複数人の記録を前提にした、その人だけの分析（v0.4.0）。

考え方
  1人の28〜56日の記録だけでは、「記録に現れるまでの遅れ」「量と反応の形」「期待の分」は
  見分けにくい。同じ成分・同じ主要項目で実験した他の人の結果を、その人の推定の土台に使う。
  ただしレポートに出すのは、その人の差（θ_i）と、その人の遅れ・形の見込みだけ。
  他の人の平均や「この成分は◯点」という結果は出さない。

3つの段階
  1. 他の人の要約から、遅れと形の事前の重みを作る（その人自身は除く）。
       各人の「候補ごとの当てはまり（尤度）」を掛け合わせ、全体の遅れの分布 π を EM 法で推定する
       （離散の候補に対する経験ベイズ。π に基本の重みを強さ2人分だけ混ぜる）。
       v0.4.0 の最初の版は各人の見込み（事後確率）を足し合わせていたが、1人ずつの見込みは事前の重みに
       近いので全体の分布がほとんど動かず、遅れのある人の差を小さく見積もっていた（CALIBRATION.md）。
  2. その人の記録を、その重みで分析する（pipeline の1人分の分析）。推定値と幅を要約にする。
  3. 全員の要約を階層モデル（research/population.py）にかけ、その人の θ_i の分布を取り出す。
     中身を隠して飲んだ人がいれば、中身を知って飲んだ人に共通の上乗せ（期待の分）δ も同時に推定し、
     θ_i はその分を差し引いた値になる。

保存するもの
  同意を得た人の要約だけ（成分・主要項目・中身を隠したか・量・推定値・幅・遅れと形の見込み・記録日数）。
  日々の記録そのものは保存しない。
"""

from __future__ import annotations

import json
import pathlib
from dataclasses import asdict, dataclass, field

import numpy as np

from .domain import pd as pdm
from .research.population import pool

PRIOR_STRENGTH = 2.0  # 基本の重みを、他の人何人分として扱うか
MIN_OTHERS = 2  # 階層モデルを使うのに必要な他の人の数


@dataclass
class Summary:
    client_id: str
    substance: str
    outcome: str
    blinded: bool
    est: float  # 元の単位、増える向きを＋
    se: float
    n_days: int
    lag_probs: list = field(default_factory=list)
    shape_probs: list = field(default_factory=list)
    lag_lik: list = field(default_factory=list)  # 遅れの候補ごとの当てはまり（事後 ÷ 事前、合計1にそろえる）
    shape_lik: list = field(default_factory=list)
    amount: float = 1.0
    consent: bool = True
    qtable: list = field(default_factory=list)  # 研究層：はい／いいえ2問の [順番, A, B] の件数（8個）


class CohortStore:
    def __init__(self, path: str | pathlib.Path):
        self.path = pathlib.Path(path)
        self.items: list[Summary] = []
        if self.path.exists():
            self.items = [Summary(**d) for d in json.loads(self.path.read_text(encoding="utf-8"))]

    def save(self) -> None:
        self.path.write_text(json.dumps([asdict(s) for s in self.items], ensure_ascii=False, indent=1), encoding="utf-8")

    def upsert(self, s: Summary) -> None:
        self.items = [x for x in self.items if x.client_id != s.client_id] + [s]

    def others(self, substance: str, outcome: str, client_id: str) -> list[Summary]:
        return [x for x in self.items if x.consent and x.substance == substance and x.outcome == outcome and x.client_id != client_id]


def _em(liks: list[np.ndarray], base: np.ndarray, strength: float = PRIOR_STRENGTH, iters: int = 200) -> np.ndarray:
    pi = base.copy()
    if not liks:
        return pi
    L = np.array(liks)
    for _ in range(iters):
        r = pi * L
        r /= r.sum(axis=1, keepdims=True)
        pi = (strength * base + r.sum(axis=0)) / (strength + len(L))
    return pi


def priors_from(others: list[Summary]) -> tuple[np.ndarray, np.ndarray]:
    """他の人の当てはまりから、その人の遅れ・形の事前の重みを作る。"""
    lag = _em([np.asarray(o.lag_lik) for o in others if o.lag_lik], pdm.lag_probs_default())
    shp = _em([np.asarray(o.shape_lik) for o in others if o.shape_lik], np.array(pdm.SHAPE_PRIOR))
    return lag, shp


def individual(own: Summary, others: list[Summary], seed: int = 0) -> dict | None:
    """全員の要約から、その人の差 θ_i の分布を出す。他の人が足りなければ None。"""
    if len(others) < MIN_OTHERS:
        return None
    people = others + [own]
    est = np.array([p.est for p in people])
    se = np.array([p.se for p in people])
    op = np.array([0.0 if p.blinded else 1.0 for p in people])
    r = pool(est, se, seed=seed, open_label=op)
    th = r["theta_draws"][:, -1]
    observed = th + (r["delta_mean"] if (r["delta_estimated"] and not own.blinded) else 0.0)
    return {
        "theta_draws": th,
        "observed_like": observed,
        "people": len(people),
        "blinded_people": int(np.sum(op == 0)),
        "delta_estimated": r["delta_estimated"],
        "delta_mean": r["delta_mean"],
        "delta_low": r["delta_low"],
        "delta_high": r["delta_high"],
        "tau_mean": r["tau_mean"],
    }


MIN_QUANTUM_PEOPLE = 10  # 5人では各人の θ の90%幅が正解を含むのが72%、10人で87%（CALIBRATION.md v0.4.0）


def quantum_individual(own: Summary, all_items: list[Summary]) -> dict | None:
    """研究層：全員の「はい／いいえ」2問の答えから階層の量子モデルを当て、その人の答え方を出す。"""
    from .research.quantum import compare_hier

    people = [x for x in all_items if x.consent and len(x.qtable) == 8 and x.client_id != own.client_id]
    if len(own.qtable) != 8 or len(people) + 1 < MIN_QUANTUM_PEOPLE:
        return None
    tables = [np.array(x.qtable, dtype=float).reshape(2, 2, 2) for x in people] + [np.array(own.qtable, dtype=float).reshape(2, 2, 2)]
    r = compare_hier(tables)
    me = r["quantum"]["people"][-1]
    t = tables[-1]
    obs_first = t[0, 0].sum() / max(t[0].sum(), 1)
    obs_second = t[1, 0].sum() / max(t[1].sum(), 1)
    return {
        "people": r["people"],
        "better": r["better"],
        "aic_quantum": r["aic_quantum"],
        "aic_classical": r["aic_classical"],
        "phi": r["quantum"]["phi"],
        "theta": me["theta"],
        "theta_low": me["theta_low"],
        "theta_high": me["theta_high"],
        "pred_first": float(me["pred"][0, 0].sum()),
        "pred_second": float(me["pred"][1, 0].sum()),
        "obs_first": float(obs_first),
        "obs_second": float(obs_second),
        "answers": int(t.sum()),
    }
