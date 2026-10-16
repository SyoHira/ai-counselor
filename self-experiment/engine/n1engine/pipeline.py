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
from . import checks
from . import cohort as coh
from .model import Fit, Verdict, build_design, fit_chains, verdict, verdict_draws
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
    shape_table: list | None = None  # 量と反応の形（ラベル, 事後確率）
    lag_probs: list | None = None
    shape_probs: list | None = None
    fitcheck: dict | None = None  # その人の記録での当てはまり（checks.py）
    excluded_lags: list | None = None  # その人の並びでは見分けられないため外した遅れの候補
    lag_lik: list | None = None
    shape_lik: list | None = None


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
    pooled: dict | None = None  # 複数人を使ったその人の推定（cohort.individual の結果）
    pooled_v: Verdict | None = None
    own_v: Verdict | None = None  # その人の記録だけの推定（比べるため）
    blinded: bool = False
    priors_from_others: int = 0
    quantum: dict | None = None  # 研究層：質問の順番とその人の答え方


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
    dh, tk, am = spread("dose_hour"), spread("taken"), spread("amount")
    if substance is not None and substance.pk is not None:
        return daily_exposure(full, t, substance.pk, dose_hour, w, dh, tk, am)
    x = t.astype(float)
    if am is not None:
        x = x * np.where(np.isnan(am), 1.0, am)
    if tk is not None:
        x[(t == 1) & (tk == 0)] = 0.0
    return x


def _fit_outcome(d, key, timing, direction, mid, X_conf, names_conf, substance, dose_hour, bedtime, waketime, seed, n_draws, pd=True, robust=True, lag_probs=None, shape_probs=None):
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
    excluded_lags = []
    if pd:
        lp = pdm.log_prior(lag_probs=lag_probs, shape_probs=shape_probs)
        keep = pdm.identifiable(opts, d["day"])
        lp = np.where(keep, lp, -np.inf)
        ns = len(pdm.SHAPES)
        excluded_lags = [h for i, h in enumerate(pdm.PD_HALF_DAYS) if not keep[i * ns]]
        kw.update(treat_options=opts, option_logprior=lp)
    f = fit_chains(y, X, d["day"], names, n_draws=n_draws, seed=seed, **kw)
    j = names.index("treatment")
    if pd:
        mode0 = int(np.bincount(f.lag_draws, minlength=opts.shape[0]).argmax())
        X[:, j] = opts[mode0]
    fitcheck = checks.check(f, y, X, d["day"], seed=seed)  # 元の尺度に戻す前に、その人の記録で当てはまりを確かめる
    f.beta_draws[:, j] *= sc
    f.sigma_draws *= sc
    v = verdict(f, direction=direction if direction else 1, mid=mid if mid is not None else 0.0)
    pd_table = pd_mode = shape_table = None
    lag_m = shape_m = lag_lik = shape_lik = None
    if pd:
        lag_m, shape_m = pdm.marginals(f.lag_draws)
        prior_lag = np.asarray(lag_probs if lag_probs is not None else pdm.lag_probs_default())
        prior_shape = np.asarray(shape_probs if shape_probs is not None else pdm.SHAPE_PRIOR)
        keep_lag = np.array([h not in excluded_lags for h in pdm.PD_HALF_DAYS])
        with np.errstate(divide="ignore", invalid="ignore"):
            ll = np.where(keep_lag, lag_m / np.where(prior_lag > 0, prior_lag, 1), 0.0)
            lag_lik = ll / ll.sum() if ll.sum() > 0 else None
            sl = shape_m / prior_shape
            shape_lik = sl / sl.sum()
        pd_table = [(h, float(pp)) for h, pp in zip(pdm.PD_HALF_DAYS, lag_m)]
        shape_table = [(lab, float(pp)) for lab, pp in zip(pdm.SHAPE_LABELS, shape_m)]
        mode = int(np.bincount(f.lag_draws, minlength=opts.shape[0]).argmax())
        pd_mode = pdm.PD_HALF_DAYS[mode // len(pdm.SHAPES)]
        X[:, j] = opts[mode]  # 偶然との比較は、最もありそうな遅れ・形の列で行う
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
        shape_table=shape_table,
        lag_probs=None if lag_m is None else lag_m.tolist(),
        shape_probs=None if shape_m is None else shape_m.tolist(),
        fitcheck=fitcheck,
        excluded_lags=excluded_lags,
        lag_lik=None if lag_lik is None else lag_lik.tolist(),
        shape_lik=None if shape_lik is None else shape_lik.tolist(),
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
    cohort: "coh.CohortStore | None" = None,
    client_id: str | None = None,
    blinded: bool = False,
    consent: bool = True,
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
    sub_key = substance.key if substance is not None else "none"
    others = cohort.others(sub_key, primary, client_id or "") if cohort is not None else []
    lag_p = shape_p = None
    if others:
        lag_p, shape_p = coh.priors_from(others)
    prim, (y, X, names) = _fit_outcome(d, primary, timing, pdir, mid, conf, None, substance, dose_hour, bedtime, waketime, seed, n_draws, pd, robust, lag_p, shape_p)

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

    pooled = pooled_v = quantum = None
    own_v = prim.v
    if cohort is not None:
        dr = prim.fit.draws("treatment")
        qt = []
        if all(k in d for k in ("qa", "qb", "pair_order")):
            from .research.quantum import table_from_records

            qt = table_from_records(d["qa"], d["qb"], d["pair_order"]).ravel().tolist()
        own = coh.Summary(client_id=client_id or "self", substance=sub_key, outcome=primary, blinded=blinded,
                          est=float(dr.mean()), se=float(dr.std()), n_days=prim.n_days,
                          lag_probs=prim.lag_probs or [], shape_probs=prim.shape_probs or [], consent=consent, qtable=qt,
                          lag_lik=prim.lag_lik or [], shape_lik=prim.shape_lik or [])
        pooled = coh.individual(own, others, seed=seed)
        quantum = coh.quantum_individual(own, cohort.items)
        if pooled is not None:
            pooled_v = verdict_draws(pooled["theta_draws"], pdir or 1, mid if mid is not None else 0.0, prim.v.rho_mean)
        if consent:
            cohort.upsert(own)

    return Analysis(
        pooled=pooled,
        pooled_v=pooled_v,
        quantum=quantum,
        own_v=own_v,
        blinded=blinded,
        priors_from_others=len(others),
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
