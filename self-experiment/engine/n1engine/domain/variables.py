"""記録項目の一覧。各項目が「何の領域の、何を、いつの時間帯について測るか」と、分析での役割を持つ。

役割（v0.1.0 の「補正しすぎ」を直すための区別）
  response    体の反応。飲んだことで動きうる。分析の対象にはするが、補正には使わない。
              主要項目は実験前に1つだけ決める。それ以外は「参考」として出す。
  confounder  外部要因。飲んだことでは動かない前提のもの。補正に使う。
  cycle       月経周期の日。周期に沿った波（sin・cos）に変換して補正に使う。
  modifier    体内量を変えるもの（実際に飲んだ時刻）。曝露量の計算に使う。

時間帯
  night  その日の夜〜翌朝（睡眠日誌・睡眠中の心拍など）。翌朝に書くが、その日の行に入れる。
  day    その日の日中（気分・ストレスなど、寝る前に1日を振り返って書く）。
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

RESPONSE, CONFOUNDER, CYCLE, MODIFIER = "response", "confounder", "cycle", "modifier"


@dataclass(frozen=True)
class Variable:
    key: str
    label: str
    field: str  # 専門領域
    unit: str
    role: str
    timing: str | None
    better: int  # +1 高いほど良い / -1 低いほど良い / 0 良し悪しを決めない
    transform: str | None = None  # "log"
    note: str = ""
    sources: tuple[tuple[str, str], ...] = ()


CSD = ("Consensus Sleep Diary の項目（寝床に入った時刻・寝つくまで・途中で起きていた時間・最終的に起きた時刻・質）", "https://cdn.clinicaltrials.gov/large-docs/29/NCT04533529/SAP_001.pdf")
SE_DEF = ("睡眠効率 = 眠っていた時間 ÷ 寝床にいた時間（試験での定義）", "https://clinicaltrials.gov/study/NCT02356575")
SHILAIH = ("Shilaih 他 2017 Sci Rep：274周期・91人、睡眠中の脈拍が黄体期中期に月経期より +3.8拍/分", "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5431053/")
HRV_CV = ("lnRMSSD の日ごとの変動 7日CV 平均5.4%（3〜13%の範囲の報告と同程度）", "https://acuresearchbank.acu.edu.au/item/8z658/evaluating-the-typical-day-to-day-variability-of-whoop-derived-heart-rate-variability-in-olympic-water-polo-athletes")
CENT = ("主要・副次項目を事前に定める（CONSORT 2010 項目6a、N-of-1 版 CENT 2015）", "https://www.bmj.com/content/350/bmj.h1793")

VARIABLES: dict[str, Variable] = {
    v.key: v
    for v in (
        # ---- 体の反応（補正に使わない） ----
        Variable("outcome", "知りたい項目（自己評価）", "自己評価", "0〜10", RESPONSE, None, +1,
                 note="実験前に、何をいつ評価するかを決める。"),
        Variable("mood", "気分", "自己評価（心理）", "0〜10", RESPONSE, "day", +1,
                 note="飲んだことで動きうるので、v0.2.0 から補正に使わない。"),
        Variable("stress", "ストレス", "自己評価（心理）", "0〜10", RESPONSE, "day", -1,
                 note="同上。"),
        Variable("sleep", "睡眠の質（自己評価）", "睡眠日誌", "0〜10", RESPONSE, "night", +1,
                 note="同上。", sources=(CSD,)),
        Variable("sol", "寝つくまでの時間", "睡眠日誌", "分", RESPONSE, "night", -1, sources=(CSD,)),
        Variable("waso", "途中で目が覚めていた時間", "睡眠日誌", "分", RESPONSE, "night", -1, sources=(CSD,)),
        Variable("tst", "眠っていた時間", "睡眠日誌／装着型機器", "分", RESPONSE, "night", 0,
                 note="長いほど良いとは限らないので、良し悪しを決めずに出す。", sources=(CSD,)),
        Variable("se", "睡眠効率", "睡眠日誌", "%", RESPONSE, "night", +1,
                 note="日誌の値は脳波より平均7%高く出るという報告がある。同じ人の中での比較なので、ずれ自体は差に影響しにくい。",
                 sources=(SE_DEF, ("日誌の睡眠効率は脳波より7%高い（2021）", "https://pmc.ncbi.nlm.nih.gov/articles/PMC8314633"))),
        Variable("rhr", "睡眠中の心拍数", "自律神経・循環（装着型機器）", "拍/分", RESPONSE, "night", 0,
                 note="月経周期で数拍/分動く。周期の記録があれば補正に入る。", sources=(SHILAIH,)),
        Variable("rmssd", "心拍変動（RMSSD）", "自律神経（装着型機器）", "ミリ秒", RESPONSE, "night", 0,
                 transform="log",
                 note="右に裾の長い分布なので対数（lnRMSSD）にして分析し、結果は「何%高かったか」で出す。",
                 sources=(HRV_CV,)),
        # ---- 外部要因（補正に使う） ----
        Variable("alcohol", "飲酒（杯）", "生活記録", "杯", CONFOUNDER, None, 0,
                 note="飲んだことで飲酒量が変わらない前提。変わる可能性があるなら補正から外す。"),
        Variable("coffee", "カフェイン飲料（杯）", "生活記録", "杯", CONFOUNDER, None, 0,
                 note="カフェイン自体を調べるときは使わない。"),
        Variable("offday", "休日", "生活記録", "0/1", CONFOUNDER, None, 0,
                 note="7日ずつの期間で曜日はそろうが、揺れを減らすために入れる。"),
        Variable("sick", "体調不良（風邪など）", "生活記録", "0/1", CONFOUNDER, None, 0),
        Variable("cycle_day", "月経周期の日（1=月経初日）", "内分泌・時間生物学", "日", CYCLE, None, 0,
                 note="周期の長さで1周する波（sin・cos）に変換して補正する。28日の実験と周期が重なると、"
                 "飲む期間と周期の時期がそろってしまうことがあるので、重なり具合をレポートに出す。",
                 sources=(SHILAIH,)),
        # ---- 体内量を変えるもの ----
        Variable("dose_hour", "実際に飲んだ時刻", "薬物動態", "時（21.5=21時30分）", MODIFIER, None, 0,
                 note="無い日は予定の時刻で計算する。"),
        Variable("taken", "飲む日に飲んだか", "薬物動態", "1/0", MODIFIER, None, 0,
                 note="0（飲み忘れ）の日はその日の分を体内量に入れない。割り付け（飲む日・飲まない日）は変えない。"),
    )
}


def derive(data: dict[str, np.ndarray]) -> dict[str, np.ndarray]:
    """記録から計算で出せる項目を足す。寝床にいた時間（tib）があれば睡眠効率を出す。"""
    out = dict(data)
    if "se" not in out and "tst" in out and "tib" in out:
        with np.errstate(divide="ignore", invalid="ignore"):
            out["se"] = np.where(out["tib"] > 0, out["tst"] / out["tib"] * 100, np.nan)
    return out


def transformed(key: str, values: np.ndarray) -> np.ndarray:
    v = VARIABLES.get(key)
    x = np.asarray(values, dtype=float)
    if v and v.transform == "log":
        with np.errstate(divide="ignore", invalid="ignore"):
            return np.where(x > 0, np.log(x), np.nan)
    return x


def cycle_terms(cycle_day: np.ndarray, length: float) -> dict[str, np.ndarray]:
    """月経周期の日を、周期で1周する2本の波にする。時期の区切りを決め打ちせずに周期の形をデータから推定する。"""
    cd = np.asarray(cycle_day, dtype=float)
    a = 2 * np.pi * (cd - 1) / length
    return {"cycle_sin": np.sin(a), "cycle_cos": np.cos(a)}


def confounders_in(data: dict[str, np.ndarray], cycle_length: float, exclude: tuple[str, ...] = ()) -> dict[str, np.ndarray]:
    """補正に使う外部要因を集める。記録に無い項目は使わない。"""
    out = {}
    for k, v in VARIABLES.items():
        if k not in data or k in exclude:
            continue
        if v.role == CONFOUNDER and np.nanstd(data[k]) > 0:
            out[k] = data[k]
        elif v.role == CYCLE:
            out.update(cycle_terms(data[k], cycle_length))
    return out


def responses_in(data: dict[str, np.ndarray], primary: str) -> list[str]:
    return [k for k, v in VARIABLES.items() if v.role == RESPONSE and k in data and k != primary]


LABELS_EXTRA = {
    "trend": "時間の流れ（季節や生活の変化）",
    "cycle_sin": "月経周期の時期",
    "cycle_cos": "月経周期の時期",
}


def label(key: str) -> str:
    if key in VARIABLES:
        return VARIABLES[key].label
    return LABELS_EXTRA.get(key, key)
