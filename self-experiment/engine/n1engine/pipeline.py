"""分析の流れ。記録から、曝露量・補正する外部要因・主要項目と参考項目の判定までを1か所で組み立てる。

  1. 記録項目の役割を一覧（domain/variables.py）から引く
  2. 主要項目の時間帯（日中／その夜）に合わせて、成分の曝露量を計算する（domain/pk.py）
  3. 補正には外部要因だけを使う。体の反応（気分・睡眠・心拍など）は補正に使わない
  4. 主要項目を判定し、偶然との比較・収束診断を付ける
  5. それ以外の体の反応は「参考」として同じ方法で推定する（判定の言葉は付けない）

  v0.3.0：曝露量に「記録に現れるまでの遅れ」（domain/pd.py）をかけ、その長さも推定する。
  揺れは t 分布にして、外れた日の重みを下げる。
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .domain import pd as pdm
from .domain.pk import Window, daily_exposure, fill_phases, residual_share, suitability, washout_days, window_for
from .domain.substances import Substance
from .domain.variables import VARIABLES, confounders_in, derive, responses_in, transformed
from .model import Fit, Verdict, build_design, fit_chains, verdict
from .simulate import null_check

RATING_UNIT = "0〜10"


@dataclass
class OutcomeResult:
    key: str
    label: str
    unit: str
    timing: str
    window: Window
    direction: int  # 0 = 良し悪しを決めない
    log: bool
    v: Verdict
    fit: Fit
    scale: float
    n_days: int
    pd_table: list | None = None  # 記録に現れるまでの遅れ（半減期・日, 事後確率）
    pd_mode: float | None = None
    outlier_days: list | None = None  # 重みを大きく下げた日


@dataclass
class Analysis:
    mid: float | None
    primary: OutcomeResult
    secondary: list[OutcomeResult]
    confounders: list[str]
    missing: dict[str, int]
    null: dict
    substance: Substance | None
    dose_hour: float
    suit: dict | None
    residual: float | None
    washout: int | None
    cycle_overlap: float | None
    notes: list[str] = field(default_factory=list)


def _scale(y: np.ndarray, treat: np.ndarray, unit: str) -> tuple[np.ndarray, float, float]:
    """0〜10 以外の項目（分・拍/分など）を、事前の前提が同じ意味になる尺度にそろえる。

    飲まない期間の平均を5、ばらつき1にする。結果は元の単位に戻して出す。
    """
    if unit == RATING_UNIT:
        return y, 1.0, 0.0
    a = y[(treat == 0) & ~np.isnan(y)]
    if len(a) < 3 or np.std(a) == 0:
        a = y[~np.isnan(y)]
    sd = float(np.std(a)) or 1.0
    center = float(np.mean(a))
    return 5 + (y - center) / sd, sd, center


def full_exposure(d, substance, dose_hour, w) -> np.ndarray:
    """1日目から最終日まで、記録の無い日も含めた毎日の体内量（定常状態=1.0）。"""
    day = np.asarray(d["day"], dtype=int)
    full, t = fill_phases(day, d["treat"])
    def spread(key):
        if key not in d:
            return None
        a = np.full(len(full), np.nan)
        a[day - 1] = np.asarray(d[key], dtype=float)
        return a
    dh, tk = spread("dose_hour"), spread("taken")
    if substance is not None and substance.pk is not None:
        return daily_exposure(full, t, substance.pk, dose_hour, w, dh, tk)
    x = t.astype(float)
    if tk is not None:
        x[(t == 1) & (tk == 0)] = 0.0
    return x


def _fit_outcome(d, key, timing, direction, mid, X_conf, names_conf, substance, dose_hour, bedtime, waketime, seed, n_draws, pd=True, robust=True):
    var = VARIABLES.get(key)
    unit = var.unit if var else RATING_UNIT
    timing = (var.timing if var and var.timing else None) or timing
    w = window_for(timing, bedtime, waketime)
    x_full = full_exposure(d, substance, dose_hour, w)
    rows = np.asarray(d["day"], dtype=int) - 1
    opts = pdm.options(x_full)[:, rows] if pd else None
    exposure = x_full[rows]
    y_raw = transformed(key, d[key])
    y, sc, _ = _scale(y_raw, d["treat"], unit)
    X, names = build_design(d["day"], exposure, X_conf)
    kw = {"robust": robust}
    if pd:
        kw.update(treat_options=opts, option_logprior=pdm.log_prior())
    f = fit_chains(y, X, d["day"], names, n_draws=n_draws, seed=seed, **kw)
    j = names.index("treatment")
    f.beta_draws[:, j] *= sc
    f.sigma_draws *= sc
    v = verdict(f, direction=direction if direction else 1, mid=mid if mid is not None else 0.0)
    pd_table = pd_mode = None
    if pd:
        pd_table = pdm.posterior_table(f.lag_draws)
        mode = int(np.bincount(f.lag_draws, minlength=len(pdm.PD_HALF_DAYS)).argmax())
        pd_mode = pdm.PD_HALF_DAYS[mode]
        X[:, j] = opts[mode]  # 偶然との比較は、最もありそうな遅れの列で行う
    outliers = None
    if robust and f.weight_mean is not None:
        outliers = [int(dd) for dd, wv in zip(f.weight_day, f.weight_mean) if wv < 0.5]
    res = OutcomeResult(
        key=key,
        label=var.label if var else key,
        unit=unit,
        timing=timing,
        window=w,
        direction=direction,
        log=bool(var and var.transform == "log"),
        v=v,
        fit=f,
        scale=sc,
        n_days=int(np.sum(~np.isnan(y_raw))),
        pd_table=pd_table,
        pd_mode=pd_mode,
        outlier_days=outliers,
    )
    return res, (y, X, names)


def analyze(
    d: dict[str, np.ndarray],
    *,
    primary: str = "outcome",
    timing: str = "day",
    direction: int | None = None,
    substance: Substance | None = None,
    dose_hour: float = 8.0,
    bedtime: float = 23.0,
    waketime: float = 7.0,
    cycle_length: float = 28.0,
    mid: float | None = None,
    seed: int = 0,
    n_draws: int = 1000,
    null_sims: int = 2000,
    secondary: bool = True,
    pd: bool = True,
    robust: bool = True,
) -> Analysis:
    d = derive(d)
    if primary not in d:
        raise ValueError(f"主要項目 {primary} が記録にありません")
    exclude = ("coffee",) if substance is not None and substance.key == "caffeine" else ()
    conf = confounders_in(d, cycle_length, exclude=exclude)
    missing = {k: int(np.sum(np.isnan(np.asarray(v, dtype=float)))) for k, v in conf.items()}

    pvar = VARIABLES.get(primary)
    if mid is None and (pvar is None or pvar.unit == RATING_UNIT):
        mid = 1.0
    pdir = direction if direction is not None else (pvar.better if pvar else 1)
    prim, (y, X, names) = _fit_outcome(d, primary, timing, pdir, mid, conf, None, substance, dose_hour, bedtime, waketime, seed, n_draws, pd, robust)

    sig = float(prim.fit.sigma_draws.mean()) / prim.scale
    null = null_check(y, X, d["day"], names, prim.v.rho_mean, sig, direction=pdir or 1, n_sims=null_sims, seed=seed)
    null["observed_diff"] *= prim.scale

    secs = []
    if secondary:
        for k in responses_in(d, primary):
            if np.sum(~np.isnan(np.asarray(d[k], dtype=float))) < 10:
                continue
            r, _ = _fit_outcome(d, k, timing, VARIABLES[k].better, 0.0, conf, None, substance, dose_hour, bedtime, waketime, seed + 1, n_draws, pd, robust)
            secs.append(r)

    suit = residual = washout = None
    if substance is not None:
        suit = suitability(substance.pk, dose_hour, prim.window, steady_days=substance.steady_days)
        if substance.pk is not None:
            residual = residual_share(substance.pk, dose_hour, prim.window)
            washout = washout_days(substance.pk)

    overlap = None
    if "cycle_sin" in conf:
        ex = X[:, names.index("treatment")]
        Z = np.column_stack([np.ones(len(ex)), X[:, names.index("cycle_sin")], X[:, names.index("cycle_cos")]])
        fitted = Z @ np.linalg.lstsq(Z, ex, rcond=None)[0]
        ss = np.sum((ex - ex.mean()) ** 2)
        overlap = float(np.sqrt(max(0.0, 1 - np.sum((ex - fitted) ** 2) / ss))) if ss > 0 else None

    return Analysis(
        mid=mid,
        primary=prim,
        secondary=secs,
        confounders=list(conf),
        missing=missing,
        null=null,
        substance=substance,
        dose_hour=dose_hour,
        suit=suit,
        residual=residual,
        washout=washout,
        cycle_overlap=overlap,
    )
