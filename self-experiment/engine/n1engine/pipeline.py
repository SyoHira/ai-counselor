"""分析の流れ。記録から、曝露量・補正する外部要因・主要項目と参考項目の判定までを1か所で組み立てる。

  1. 記録項目の役割を一覧（domain/variables.py）から引く
  2. 主要項目の時間帯（日中／その夜）に合わせて、成分の曝露量を計算する（domain/pk.py）
  3. 補正には外部要因だけを使う。体の反応（気分・睡眠・心拍など）は補正に使わない
  4. 主要項目を判定し、偶然との比較・収束診断を付ける
  5. それ以外の体の反応は「参考」として同じ方法で推定する（判定の言葉は付けない）

  v0.3.0：曝露量に「記録に現れるまでの遅れ」（domain/pd.py）をかけ、その長さも推定する。
  揺れは t 分布にして、外れた日の重みを下げる。

  v0.5.0：複数の成分・要因を掛け合わせる。追加の要因（Factor）ごとに、曝露量・遅れ・形を持たせ、
  すべての組について「同時に取ったときの上乗せ」（曝露量どうしの積）を足して推定する。
  結果は、単独（他を取らないとき）・同時・上乗せの3つで出す。
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
from .model import Fit, Verdict, build_design, fit_chains, interaction_parts, is_term, verdict, verdict_draws
from .simulate import null_check

RATING_UNIT = "0〜10"


@dataclass
class Factor:
    """掛け合わせる追加の成分・要因。記録には 'phase_<key>'（A/B）の列を使う。"""

    key: str
    label: str
    substance: Substance | None = None
    dose_hour: float = 8.0


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
    multi: dict | None = None  # 複数の要因を掛け合わせたときの、要因ごとの結果・上乗せ・同時の結果


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
    extras: list = field(default_factory=list)  # 掛け合わせた追加の要因（Factor）
    primary_label: str = ""


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


def full_exposure(d, substance, dose_hour, w, key: str | None = None) -> np.ndarray:
    """1日目から最終日まで、記録の無い日も含めた毎日の体内量（定常状態=1.0）。

    key を与えると、追加の要因の列（treat_<key>・dose_hour_<key>・taken_<key>・amount_<key>）を使う。
    """
    sfx = f"_{key}" if key else ""
    day = np.asarray(d["day"], dtype=int)
    full, t = fill_phases(day, d["treat" + sfx])
    def spread(name):
        name = name + sfx
        if name not in d:
            return None
        a = np.full(len(full), np.nan)
        a[day - 1] = np.asarray(d[name], dtype=float)
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


def _refresh_interactions(X, names):
    for i, n_ in enumerate(names):
        if n_.startswith("x:"):
            ca, cb = interaction_parts(n_)
            X[:, i] = X[:, names.index(ca)] * X[:, names.index(cb)]


def _factor_tables(f, i, opts, excluded, lag_probs, shape_probs):
    """要因 i の、遅れ・形の事後確率と、次の人のための当てはまり（尤度）。"""
    lag_m, shape_m = pdm.marginals(f.option_draws[:, i])
    prior_lag = np.asarray(lag_probs if lag_probs is not None else pdm.lag_probs_default())
    prior_shape = np.asarray(shape_probs if shape_probs is not None else pdm.SHAPE_PRIOR)
    keep_lag = np.array([h not in excluded for h in pdm.PD_HALF_DAYS])
    with np.errstate(divide="ignore", invalid="ignore"):
        ll = np.where(keep_lag, lag_m / np.where(prior_lag > 0, prior_lag, 1), 0.0)
        lag_lik = ll / ll.sum() if ll.sum() > 0 else None
        sl = shape_m / prior_shape
        shape_lik = sl / sl.sum()
    mode = int(np.bincount(f.option_draws[:, i], minlength=opts.shape[0]).argmax())
    return {
        "lag_m": lag_m, "shape_m": shape_m, "lag_lik": lag_lik, "shape_lik": shape_lik, "mode": mode,
        "pd_table": [(h, float(pp)) for h, pp in zip(pdm.PD_HALF_DAYS, lag_m)],
        "shape_table": [(lab, float(pp)) for lab, pp in zip(pdm.SHAPE_LABELS, shape_m)],
        "pd_mode": pdm.PD_HALF_DAYS[mode // len(pdm.SHAPES)],
    }


def _vif(X, names):
    """飲んだ影響の各列が、ほかの列（時間の流れ・外部要因・ほかの要因）でどれだけ言い表せるか。5を超えると見分けにくい。"""
    out = {}
    for i, n_ in enumerate(names):
        if not is_term(n_):
            continue
        rest = np.delete(X, i, axis=1)
        resid = X[:, i] - rest @ np.linalg.lstsq(rest, X[:, i], rcond=None)[0]
        ss = np.sum((X[:, i] - X[:, i].mean()) ** 2)
        r2 = 1 - np.sum(resid**2) / ss if ss > 0 else 0.0
        out[n_] = float(1 / max(1 - r2, 1e-6))
    return out


def _fit_outcome(d, key, timing, direction, mid, X_conf, names_conf, substance, dose_hour, bedtime, waketime, seed, n_draws, pd=True, robust=True, lag_probs=None, shape_probs=None, extras=(), primary_label="成分A"):
    var = VARIABLES.get(key)
    unit = var.unit if var else RATING_UNIT
    timing = (var.timing if var and var.timing else None) or timing
    w = window_for(timing, bedtime, waketime)
    specs = [(None, substance, dose_hour)] + [(e.key, e.substance, e.dose_hour) for e in extras]
    x_fulls = [full_exposure(d, sub, dh, w, key=k) for k, sub, dh in specs]
    rows = np.asarray(d["day"], dtype=int) - 1
    opts_l = [pdm.options(x)[:, rows] if pd else None for x in x_fulls]
    exposures = [x[rows] for x in x_fulls]
    y_raw = transformed(key, d[key])
    any_on = np.zeros(len(d["day"]), dtype=int)
    for k, _, _ in specs:
        any_on = any_on | np.asarray(d["treat" + (f"_{k}" if k else "")], dtype=int)
    y, sc, _ = _scale(y_raw, any_on, unit)
    X, names = build_design(d["day"], exposures[0], X_conf, extras={e.key: exposures[i + 1] for i, e in enumerate(extras)}, interactions=bool(extras))
    fnames = ["treatment"] + [f"factor:{e.key}" for e in extras]
    js = [names.index(n_) for n_ in fnames]
    vif = _vif(X, names) if extras else None  # 並びそのものの見分けやすさ（遅れ・形を選ぶ前の曝露量で測る）
    kw = {"robust": robust}
    excluded_l = [[] for _ in fnames]
    if pd:
        ns = len(pdm.SHAPES)
        specs_f = []
        for i, (o, n_) in enumerate(zip(opts_l, fnames)):
            lp = pdm.log_prior(lag_probs=lag_probs if i == 0 else None, shape_probs=shape_probs if i == 0 else None)
            keep = pdm.identifiable(o, d["day"])
            lp = np.where(keep, lp, -np.inf)
            excluded_l[i] = [h for q, h in enumerate(pdm.PD_HALF_DAYS) if not keep[q * ns]]
            specs_f.append({"name": n_, "options": o, "logprior": lp})
        kw["factors"] = specs_f
    f = fit_chains(y, X, d["day"], names, n_draws=n_draws, seed=seed, **kw)
    j = js[0]
    tabs = [None] * len(fnames)
    if pd:
        for i in range(len(fnames)):
            tabs[i] = _factor_tables(f, i, opts_l[i], excluded_l[i], lag_probs if i == 0 else None, shape_probs if i == 0 else None)
            X[:, js[i]] = opts_l[i][tabs[i]["mode"]]  # 偶然との比較は、最もありそうな遅れ・形の列で行う
        _refresh_interactions(X, names)
    fitcheck = checks.check(f, y, X, d["day"], seed=seed)  # 元の尺度に戻す前に、その人の記録で当てはまりを確かめる
    for i_, n_ in enumerate(names):
        if is_term(n_):
            f.beta_draws[:, i_] *= sc
    f.sigma_draws *= sc
    v = verdict(f, direction=direction if direction else 1, mid=mid if mid is not None else 0.0)
    t0 = tabs[0] or {}
    outliers = None
    if robust and f.weight_mean is not None:
        outliers = [int(dd) for dd, wv in zip(f.weight_day, f.weight_mean) if wv < 0.5]
    multi = None
    if extras:
        dr_ = direction if direction else 1
        mid_ = mid if mid is not None else 0.0
        labels = [primary_label] + [e.label for e in extras]
        facs = []
        for i, n_ in enumerate(fnames):
            t = tabs[i] or {}
            facs.append({"name": n_, "label": labels[i], "v": verdict_draws(f.draws(n_), dr_, mid_, float(f.rho_draws.mean())),
                         "pd_table": t.get("pd_table"), "shape_table": t.get("shape_table"), "pd_mode": t.get("pd_mode"),
                         "excluded_lags": excluded_l[i], "lag_probs": None if not t else t["lag_m"].tolist(),
                         "shape_probs": None if not t else t["shape_m"].tolist()})
        ints = []
        total = sum(f.draws(n_) for n_ in fnames)
        for n_ in names:
            if n_.startswith("x:"):
                ca, cb = interaction_parts(n_)
                la, lb = labels[fnames.index(ca)], labels[fnames.index(cb)]
                ints.append({"name": n_, "label": f"{la}と{lb}の組み合わせの上乗せ", "pair": (la, lb),
                             "v": verdict_draws(f.draws(n_), dr_, mid_, float(f.rho_draws.mean()))})
                total = total + f.draws(n_)
        multi = {"factors": facs, "interactions": ints,
                 "both": verdict_draws(total, dr_, mid_, float(f.rho_draws.mean())),
                 "both_label": "・".join(labels) + "を一緒に",
                 "vif": vif}
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
        pd_table=t0.get("pd_table"),
        pd_mode=t0.get("pd_mode"),
        outlier_days=outliers,
        shape_table=t0.get("shape_table"),
        lag_probs=None if not t0 else t0["lag_m"].tolist(),
        shape_probs=None if not t0 else t0["shape_m"].tolist(),
        fitcheck=fitcheck,
        excluded_lags=excluded_l[0],
        lag_lik=None if not t0 or t0["lag_lik"] is None else t0["lag_lik"].tolist(),
        shape_lik=None if not t0 else t0["shape_lik"].tolist(),
        multi=multi,
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
    extras: list[Factor] | tuple = (),
    primary_label: str | None = None,
) -> Analysis:
    d = derive(d)
    extras = list(extras)
    for e in extras:
        if "treat_" + e.key not in d:
            raise ValueError(f"追加の要因 {e.key} の列 phase_{e.key} が記録にありません")
    primary_label = primary_label or (substance.name if substance is not None else "成分A")
    if primary not in d:
        raise ValueError(f"主要項目 {primary} が記録にありません")
    has_caffeine = any(x is not None and x.key == "caffeine" for x in [substance] + [e.substance for e in extras])
    exclude = ("coffee",) if has_caffeine else ()
    conf = confounders_in(d, cycle_length, exclude=exclude)
    missing = {k: int(np.sum(np.isnan(np.asarray(v, dtype=float)))) for k, v in conf.items()}

    pvar = VARIABLES.get(primary)
    if mid is None and (pvar is None or pvar.unit == RATING_UNIT):
        mid = 1.0
    pdir = direction if direction is not None else (pvar.better if pvar else 1)
    sub_key = substance.key if substance is not None else "none"
    if extras:  # 同じ組み合わせで試した人だけを土台にする（単独の差と、他を取っているときの差は別の量）
        sub_key = sub_key + "×" + "×".join(sorted(e.substance.key if e.substance is not None else e.key for e in extras))
    others = cohort.others(sub_key, primary, client_id or "") if cohort is not None else []
    lag_p = shape_p = None
    if others:
        lag_p, shape_p = coh.priors_from(others)
    prim, (y, X, names) = _fit_outcome(d, primary, timing, pdir, mid, conf, None, substance, dose_hour, bedtime, waketime, seed, n_draws, pd, robust, lag_p, shape_p, extras, primary_label)

    sig = float(prim.fit.sigma_draws.mean()) / prim.scale
    null = null_check(y, X, d["day"], names, prim.v.rho_mean, sig, direction=pdir or 1, n_sims=null_sims, seed=seed)
    null["observed_diff"] *= prim.scale
    if prim.multi is not None:  # 追加の要因・上乗せも、同じ方法で偶然と比べる
        for t in prim.multi["factors"][1:] + prim.multi["interactions"]:
            t["null"] = null_check(y, X, d["day"], names, prim.v.rho_mean, sig, direction=pdir or 1, n_sims=null_sims, seed=seed, column=t["name"])
            t["null"]["observed_diff"] *= prim.scale
        prim.multi["factors"][0]["null"] = null

    secs = []
    if secondary:
        for k in responses_in(d, primary):
            if np.sum(~np.isnan(np.asarray(d[k], dtype=float))) < 10:
                continue
            r, _ = _fit_outcome(d, k, timing, VARIABLES[k].better, 0.0, conf, None, substance, dose_hour, bedtime, waketime, seed + 1, n_draws, pd, robust, None, None, extras, primary_label)
            secs.append(r)

    suit = residual = washout = None
    if substance is not None:
        suit = suitability(substance.pk, dose_hour, prim.window, steady_days=substance.steady_days)
        if substance.pk is not None:
            residual = residual_share(substance.pk, dose_hour, prim.window)
            washout = washout_days(substance.pk)
    if prim.multi is not None:  # 追加の要因それぞれの、体内での動き
        for e, t in zip(extras, prim.multi["factors"][1:]):
            t["substance"], t["dose_hour"] = e.substance, e.dose_hour
            if e.substance is not None:
                t["suit"] = suitability(e.substance.pk, e.dose_hour, prim.window, steady_days=e.substance.steady_days)
                if e.substance.pk is not None:
                    t["residual"] = residual_share(e.substance.pk, e.dose_hour, prim.window)
                    t["washout"] = washout_days(e.substance.pk)

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
        extras=extras,
        primary_label=primary_label,
    )
