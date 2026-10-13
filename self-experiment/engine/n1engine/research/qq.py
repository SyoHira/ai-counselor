"""研究層：量子確率モデルの予測（QQ等式）が、体調の記録でも成り立つかを検証する。

背景
  質問の順番で回答が変わる現象について、量子確率モデルは事前に
  「2つの質問の答えが食い違う確率は、どちらを先に聞いても同じ」という
  等式（QQ等式）を予測した。これは全米規模の調査70件と実験2件で支持された
  （Wang, Solloway, Shiffrin, Busemeyer 2014, PNAS）。
  一方、同じモデルから導かれる別の等式は多くのデータで成り立たなかった
  （Boyer-Kassem 他 2016）。体調の自己評価で検証した例は見つかっていない。

ここでやること
  毎日「はい／いいえ」の質問の組（qa, qb）を、順番をランダムにして聞いている。
  順番 AB の日と BA の日で「答えが食い違った割合」を比べ、差がゼロと
  見なせるかを検証する。1人の28日では足りないので、同意を得た複数人の記録を
  まとめて使う。同じ人の記録は似るので、人単位で再標本化して幅を出す。

結果の扱い
  成り立っても成り立たなくても、それ自体が新しい知見になる。
  どちらの結果でも公開する。顧客のレポートには使わない。
"""

from __future__ import annotations

import numpy as np


def qq_statistic(qa: np.ndarray, qb: np.ndarray, order: np.ndarray) -> float:
    """q = P(食い違い | AB順) - P(食い違い | BA順)。QQ等式が成り立てば 0。"""
    differ = qa != qb
    ab = order == "AB"
    ba = order == "BA"
    if ab.sum() == 0 or ba.sum() == 0:
        return float("nan")
    return float(differ[ab].mean() - differ[ba].mean())


def qq_test(
    person: np.ndarray,
    qa: np.ndarray,
    qb: np.ndarray,
    order: np.ndarray,
    n_boot: int = 2000,
    seed: int = 0,
) -> dict:
    """人単位の再標本化（クラスター・ブートストラップ）で q の95%幅を出す。"""
    rng = np.random.default_rng(seed)
    people = np.unique(person)
    q_obs = qq_statistic(qa, qb, order)
    idx_by_person = {p: np.where(person == p)[0] for p in people}
    boots = []
    for _ in range(n_boot):
        pick = rng.choice(people, size=len(people), replace=True)
        idx = np.concatenate([idx_by_person[p] for p in pick])
        boots.append(qq_statistic(qa[idx], qb[idx], order[idx]))
    boots = np.array([b for b in boots if not np.isnan(b)])
    low, high = np.quantile(boots, [0.025, 0.975])
    return {
        "q": q_obs,
        "low": float(low),
        "high": float(high),
        "people": int(len(people)),
        "observations": int(len(qa)),
        "consistent_with_qq": bool(low <= 0 <= high),
    }
