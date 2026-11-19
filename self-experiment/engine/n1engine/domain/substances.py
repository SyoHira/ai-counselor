"""成分の一覧。出典を確認できた数値だけを載せる。

載せる条件
  - 半減期・最高濃度に達する時間・安定するまでの日数は、確認した出典の値だけ。
    確認できないものは None にして、推測で埋めない。
  - 数値には個人差の幅も書く。代表値で計算し、幅の端でどれだけ結果が動くかを示す。
  - ここに無い成分は、利用者が数値と出典を指定して使う（レポートには「未確認の数値」と出る）。

「何に効くか」は載せない（薬機法）。載せるのは体内での動き方だけ。
"""

from __future__ import annotations

from dataclasses import dataclass

from .pk import PK


@dataclass(frozen=True)
class Substance:
    key: str
    name: str
    pk: PK | None
    t_half_range_h: tuple[float, float] | None
    tmax_range_h: tuple[float, float] | None
    steady_days: tuple[float, float] | None  # 出典に「安定するまで◯日」とある場合
    note: str
    sources: tuple[tuple[str, str], ...]
    checked: str = "2026-10-16"


SUBSTANCES: dict[str, Substance] = {
    s.key: s
    for s in (
        Substance(
            key="caffeine",
            name="カフェイン",
            pk=PK(t_half_h=5.0, tmax_h=1.0),
            t_half_range_h=(1.5, 9.5),
            tmax_range_h=(0.5, 1.6),
            steady_days=None,
            note="95%以上が肝臓の酵素 CYP1A2 で分解され、半減期の個人差が大きい。"
            "就寝6時間前の400mgでも睡眠が乱れたという報告がある（12人の研究）。",
            sources=(
                ("半減期 平均約5時間・幅1.5〜9.5時間、CYP1A2（ISSN 2024）", "https://www.tandfonline.com/doi/full/10.1080/15502783.2024.2323919"),
                ("最高濃度まで 約30分（5mg/kg、10人）", "https://link.springer.com/doi/10.1007/BF00613933"),
                ("最高濃度まで コーヒー約1.0時間・カプセル約1.6時間", "https://pmc.ncbi.nlm.nih.gov/articles/PMC9202019/table/tbl1"),
                ("就寝0・3・6時間前の摂取と睡眠（Drake 2013）", "https://www.semanticscholar.org/paper/Caffeine-effects-on-sleep-taken-0,-3,-or-6-hours-to-Drake-Roehrs/d5fac59f050a5a07efc47f58abcdbaf1d880c0c3"),
            ),
        ),
        Substance(
            key="theanine",
            name="L-テアニン",
            pk=PK(t_half_h=65 / 60, tmax_h=0.8),
            t_half_range_h=None,
            tmax_range_h=None,
            steady_days=None,
            note="血中からは数時間でほぼ消える。翌日への持ち越しはほぼ無い計算になる。",
            sources=(
                ("最高濃度まで約0.8時間・半減期約65分（茶と水溶液の比較）", "https://www.researchgate.net/publication/228460064_Human_disposition_of_L-theanine_in_tea_or_aqueous_solution"),
            ),
        ),
        Substance(
            key="vitamin_d",
            name="ビタミンD（血中の25(OH)D）",
            pk=PK(t_half_h=17.5 * 24, tmax_h=None),  # 2〜3週間の中央
            t_half_range_h=(14 * 24, 21 * 24),
            tmax_range_h=None,
            steady_days=(60, 90),
            note="記録に関係する体内の量（25(OH)D）は2〜3週間かけて半分になり、安定まで2〜3か月かかる。",
            sources=(
                ("25(OH)D の半減期 約2〜3週間", "https://ajcn.nutrition.org/article/S0002-9165(22)04376-3/fulltext"),
            ),
        ),
        Substance(
            key="omega3",
            name="オメガ3脂肪酸（EPA・DHA）",
            pk=None,
            t_half_range_h=None,
            tmax_range_h=None,
            steady_days=(120, 180),
            note="赤血球膜の割合（オメガ3指数）は8〜12週で上がり、安定まで4〜6か月かかる。",
            sources=(
                ("オメガ3指数 上昇8〜12週・安定4〜6か月（Frontiers 2023）", "https://www.frontiersin.org/journals/nutrition/articles/10.3389/fnut.2023.1072653/full"),
            ),
        ),
        Substance(
            key="magnesium",
            name="マグネシウム",
            pk=None,
            t_half_range_h=None,
            tmax_range_h=None,
            steady_days=None,
            note="体内の量は腸と腎臓で一定に保たれ、単純な半減期で表せない。吸収率は形（クエン酸塩・酸化物など）で違う。",
            sources=(
                ("形による吸収の違い（2016）", "https://link.springer.com/article/10.1186/s40795-016-0121-3"),
                ("クエン酸塩と酸化物の比較", "https://pubmed.ncbi.nlm.nih.gov/1468087/"),
            ),
        ),
    )
}


def custom(t_half_h: float, tmax_h: float | None, name: str) -> Substance:
    """一覧に無い成分。数値は利用者の指定で、エンジン側では確認していない。"""
    return Substance(
        key="custom",
        name=name,
        pk=PK(t_half_h=t_half_h, tmax_h=tmax_h),
        t_half_range_h=None,
        tmax_range_h=None,
        steady_days=None,
        note="半減期・最高濃度までの時間は利用者の指定（エンジン側で出典を確認していない数値）。",
        sources=(),
    )
