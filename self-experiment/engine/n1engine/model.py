"""判定の本体：前日の引きずりを考慮したベイズ回帰。

何をしているか
  その日の記録 = 基準値
               + 差 × その日の曝露量（これを知りたい）
               + 時間の流れによる変化
               + 外部要因（飲酒・休日・体調不良・月経周期の時期など）の影響
               + 揺れ

  曝露量は、成分の体内動態から計算した「記録の時間帯に体に残っている量」
  （飲み続けて安定した状態=1.0、domain/pk.py）。体内動態の分からない成分は
  飲んだ日=1・飲まない日=0。どちらでも「差」は飲み続けて安定したときの差になる。

  気分・ストレス・睡眠など飲んだことで動きうる記録は、補正に使わない（v0.2.0）。
  補正に入れると、それを通じて生じた差まで消してしまうため（CALIBRATION.md の検証）。

  v0.3.0 で加えた2つ
  - 記録に現れるまでの遅れ（薬力学の持ち越し）：体内量がそのまま記録に効くのではなく、
    一次の遅れを通って現れると考え、その遅れの長さもデータから推定する（domain/pd.py）。
    候補の遅れごとに曝露量の列を用意し、ギブスサンプリングの1段として選び直す。
  - 外れた日に強い推定（Student-t の揺れ、Geweke 1993）：揺れを正規分布ではなく
    裾の重い t 分布とし、「ふだんの揺れより大きく外れた日」の重みを自動で下げる。
    t 分布を「日ごとに大きさの違う正規分布の混合」として表し、日ごとの重みも推定する。

  揺れは「前日の揺れを一部引きずる」と考える（自己相関）。
  毎日の体調は前日の状態を持ち越すので、普通の比較（t検定）をそのまま使うと
  偶然の差を「差がある」と判定しすぎる。ここでは引きずりの強さ（rho）も
  データから同時に推定する。

計算方法
  ギブスサンプリング（Chib 1993 の自己相関つき回帰）。
  「上乗せ」「揺れの大きさ」「引きずりの強さ」を順番に、他を仮に固定しながら
  何千回も推定し直し、そのばらつきから「上乗せが0より大きい確率」を出す。
  初日は前日がないので、前日がそろっている日のペアだけで推定する。
  記録が抜けた日があっても、その日と翌日のペアが使えなくなるだけで止まらない。
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from scipy.special import gammaln

# 事前の前提（事前分布）。実験の前に決めて固定し、レポートに書く。途中で変えない。
DEFAULT_PRIORS = {
    # 差（飲み続けて安定したときの差）：「たぶん差はない、あっても±2点程度」という控えめな前提。
    # 0〜10 の自己評価を想定した値。分や拍/分の項目では、その項目のばらつきに合わせて広げる（run.py）
    "treatment_sd": 2.0,
    # 組み合わせの上乗せ（2つ以上を同時に取ったときに、単独の合計からずれる分）。
    # 単独の差と同じ幅（±2点程度）。±1点にすると上乗せを小さく見積もりすぎ、90%の幅の正しさが
    # 42〜55%まで落ちた（偽データ、CALIBRATION.md v0.5.0）。±2点で87〜97%
    "interaction_sd": 2.0,
    # 基準値：0〜10の記録の真ん中あたり、幅広く
    "intercept_mean": 5.0,
    "intercept_sd": 5.0,
    # 時間の流れ・気分などの影響（標準化した1単位あたり）
    "other_sd": 2.0,
    # 揺れの大きさ（逆ガンマ分布）
    "sigma2_shape": 2.0,
    "sigma2_scale": 2.0,
    # 引きずりの強さ：0中心、-1〜1に制限
    "rho_mean": 0.0,
    "rho_sd": 0.5,
}


@dataclass
class Fit:
    """推定結果。draws は推定を繰り返した結果の列（多いほど安定する）。"""

    names: list[str]
    beta_draws: np.ndarray  # (回数, 係数の数)
    rho_draws: np.ndarray
    sigma_draws: np.ndarray
    n_used: int  # 推定に使えた日のペア数
    priors: dict = field(default_factory=dict)
    diag: dict | None = None  # fit_chains のときの収束診断
    lag_draws: np.ndarray | None = None  # 遅れの候補の番号（最初の要因の候補の行）
    option_draws: np.ndarray | None = None  # 要因ごとの候補の番号（回数, 要因の数）。要因が1つなら lag_draws と同じ
    factor_names: list[str] | None = None  # option_draws の列がどの列名の要因か
    nu_draws: np.ndarray | None = None  # t 分布の自由度（小さいほど裾が重い）
    weight_mean: np.ndarray | None = None  # 推定に使った日ごとの重みの平均（1=ふつう、小さいほど外れた日）
    weight_day: np.ndarray | None = None  # weight_mean がどの日のものか

    def draws(self, name: str) -> np.ndarray:
        return self.beta_draws[:, self.names.index(name)]


def _standardize(x: np.ndarray) -> np.ndarray:
    """平均0・ばらつき1にそろえる。空欄は平均（=0）で埋める。

    v0.1.0 では外部要因が1つ空欄なだけでその日を丸ごと捨て、前後の日のペアも失っていた。
    """
    x = np.asarray(x, dtype=float)
    sd = np.nanstd(x)
    if sd == 0 or np.isnan(sd):
        return np.zeros_like(x)
    return np.nan_to_num((x - np.nanmean(x)) / sd, nan=0.0)


def is_term(name: str) -> bool:
    """飲んだ影響を表す列か（主要な成分・追加の要因・組み合わせの上乗せ）。"""
    return name == "treatment" or name.startswith("factor:") or name.startswith("x:")


def interaction_parts(name: str) -> tuple[str, str]:
    """組み合わせの列名 'x:A×B' から、もとの2つの列名を取り出す。"""
    a, b = name[2:].split("×")
    return a, b


def build_design(
    day: np.ndarray,
    exposure: np.ndarray,
    covariates: dict[str, np.ndarray] | None = None,
    extras: dict[str, np.ndarray] | None = None,
    interactions: bool = False,
) -> tuple[np.ndarray, list[str]]:
    """説明に使う変数の表（設計行列）を作る。

    exposure は曝露量（0〜1程度）または 0/1。外部要因は標準化してそろえる。
    extras（v0.5.0）：追加の成分・要因の曝露量。列名は 'factor:<名前>'。
    interactions：True なら、すべての2つの組について「同時に取ったときの上乗せ」の列
    （曝露量どうしの積、列名 'x:<列名>×<列名>'）を足す。
    """
    cols = [np.ones_like(day, dtype=float), np.asarray(exposure, dtype=float), _standardize(day.astype(float))]
    names = ["intercept", "treatment", "trend"]
    for key, values in (extras or {}).items():
        cols.append(np.asarray(values, dtype=float))
        names.append(f"factor:{key}")
    if interactions:
        mains = [n for n in names if n == "treatment" or n.startswith("factor:")]
        for i in range(len(mains)):
            for j in range(i + 1, len(mains)):
                cols.append(cols[names.index(mains[i])] * cols[names.index(mains[j])])
                names.append(f"x:{mains[i]}×{mains[j]}")
    for name, values in (covariates or {}).items():
        cols.append(_standardize(np.asarray(values, dtype=float)))
        names.append(name)
    return np.column_stack(cols), names


def prepare(y, X, day, return_index: bool = False):
    """記録の無い日を除いて日付順に並べ、前日がそろっている日のペアを作る。"""
    y = np.asarray(y, dtype=float)
    X = np.asarray(X, dtype=float)
    day = np.asarray(day)
    ok = ~np.isnan(y) & ~np.isnan(X).any(axis=1)
    idx = np.where(ok)[0]
    idx = idx[np.argsort(day[idx], kind="stable")]
    y, X, day = y[idx], X[idx], day[idx]
    pair = np.where(np.diff(day) == 1)[0]
    if len(pair) < X.shape[1] + 2:
        raise ValueError(f"連続した記録が足りません（{len(pair)}組）")
    if return_index:
        return y, X, day, pair + 1, pair, idx
    return y, X, day, pair + 1, pair


NU_GRID = np.array([3.0, 5.0, 10.0, 30.0, 100.0])


_NU_CONST = gammaln((NU_GRID + 1) / 2) - gammaln(NU_GRID / 2) - 0.5 * np.log(NU_GRID * np.pi)


def _t_loglik(z: np.ndarray) -> np.ndarray:
    """自由度の候補ごとの、t 分布の対数尤度の合計（日ごとの重みを消した形）。"""
    return _NU_CONST * len(z) - (NU_GRID + 1) / 2 * np.log1p(z[None, :] ** 2 / NU_GRID[:, None]).sum(axis=1)


def fit(
    y: np.ndarray,
    X: np.ndarray,
    day: np.ndarray,
    names: list[str],
    priors: dict | None = None,
    n_draws: int = 3000,
    n_burn: int = 1000,
    seed: int | None = None,
    jitter: bool = False,
    treat_options: np.ndarray | None = None,
    option_logprior: np.ndarray | None = None,
    robust: bool = False,
    factors: list[dict] | None = None,
) -> Fit:
    """自己相関つきベイズ回帰をギブスサンプリングで推定する（1本）。

    treat_options：「treatment」列の候補（遅れの長さごとの曝露量、行=候補、列=日）。
        与えると、どの候補がデータに合うかも推定する（option_logprior はその事前の重み）。
    factors（v0.5.0）：複数の成分・要因それぞれの候補。{"name": 列名, "options": 行=候補・列=日, "logprior": 事前の重み}
        のリスト。要因ごとに候補を順番に選び直す。'x:A×B' の列（組み合わせの上乗せ）は、
        そのときの A 列と B 列の積として毎回作り直す。treat_options は factors=[treatment 1つ] の略記。
    robust：揺れを t 分布にし、外れた日の重みを下げる。
    """
    pr = {**DEFAULT_PRIORS, **(priors or {})}
    rng = np.random.default_rng(seed)
    X = np.array(X, dtype=float)
    if factors is None and treat_options is not None:
        factors = [{"name": "treatment", "options": treat_options,
                    "logprior": np.zeros(len(treat_options)) if option_logprior is None else option_logprior}]
    ints = []  # (組み合わせの列, 元の列a, 元の列b)
    for n_ in names:
        if n_.startswith("x:"):
            ca, cb = interaction_parts(n_)
            ints.append((names.index(n_), names.index(ca), names.index(cb)))
    facs = []
    for fc in factors or []:
        o = np.asarray(fc["options"], dtype=float)
        lp_ = np.asarray(fc["logprior"], dtype=float)
        facs.append({"name": fc["name"], "j": names.index(fc["name"]), "all": o, "lp": lp_, "g": int(np.argmax(lp_))})
        X[:, facs[-1]["j"]] = o[facs[-1]["g"]]
    for ji, ja, jb in ints:
        X[:, ji] = X[:, ja] * X[:, jb]
    y, X, day, cur, prev, idx = prepare(y, X, day, return_index=True)
    for fk in facs:
        fk["opts"] = fk["all"][:, idx]
    w = np.ones(len(cur))
    nu = float(NU_GRID[-1])

    k = X.shape[1]
    b0 = np.zeros(k)
    b0[0] = pr["intercept_mean"]
    prior_sd = np.full(k, pr["other_sd"])
    prior_sd[names.index("intercept")] = pr["intercept_sd"]
    for i_, n_ in enumerate(names):
        if n_ == "treatment" or n_.startswith("factor:"):
            prior_sd[i_] = pr["treatment_sd"]
        elif n_.startswith("x:"):
            prior_sd[i_] = pr["interaction_sd"]
    B0_inv = np.diag(1.0 / prior_sd**2)

    beta = np.linalg.lstsq(X, y, rcond=None)[0]
    sigma2 = float(np.var(y - X @ beta)) or 1.0
    rho = 0.0
    if jitter:  # 出発点をばらして、複数本が同じ答えに落ち着くかを見る（収束診断）
        beta = beta + rng.normal(0, 1, k)
        sigma2 *= float(np.exp(rng.normal(0, 0.5)))
        rho = float(rng.uniform(-0.5, 0.9))

    total = n_draws + n_burn
    beta_out = np.empty((n_draws, k))
    rho_out = np.empty(n_draws)
    sig_out = np.empty(n_draws)
    opt_out = np.empty((n_draws, len(facs)), dtype=int) if facs else None
    nu_out = np.empty(n_draws) if robust else None
    w_sum = np.zeros(len(cur))

    for it in range(total):
        # 1) 引きずりを取り除いた形に変換して、係数を推定し直す（外れた日は重みを下げる）
        ys = y[cur] - rho * y[prev]
        Xs = X[cur] - rho * X[prev]
        Xw = Xs * w[:, None]
        V = np.linalg.inv(B0_inv + Xw.T @ Xs / sigma2)
        V = (V + V.T) / 2
        m = V @ (B0_inv @ b0 + Xw.T @ ys / sigma2)
        beta = rng.multivariate_normal(m, V)

        # 2) 揺れの大きさを推定し直す
        resid = ys - Xs @ beta
        shape = pr["sigma2_shape"] + len(cur) / 2
        scale = pr["sigma2_scale"] + (w * resid) @ resid / 2
        sigma2 = scale / rng.gamma(shape)

        # 3) 引きずりの強さを推定し直す（-1〜1の範囲に制限）
        u = y - X @ beta
        prec = 1 / pr["rho_sd"] ** 2 + (w * u[prev]) @ u[prev] / sigma2
        mean = (pr["rho_mean"] / pr["rho_sd"] ** 2 + (w * u[prev]) @ u[cur] / sigma2) / prec
        for _ in range(100):
            cand = rng.normal(mean, 1 / np.sqrt(prec))
            if -1 < cand < 1:
                rho = cand
                break

        # 4) 記録に現れるまでの遅れ・形を、要因ごとに選び直す（候補ごとの当てはまり × 事前の重み）
        for fk in facs:
            j = fk["j"]
            own_ints = [(ji, ja, jb) for ji, ja, jb in ints if j in (ja, jb)]
            ys = y[cur] - rho * y[prev]
            Xs = X[cur] - rho * X[prev]
            base = Xs @ beta - beta[j] * Xs[:, j]
            for ji, _, _ in own_ints:
                base = base - beta[ji] * Xs[:, ji]
            opts = fk["opts"]
            contrib = beta[j] * (opts[:, cur] - rho * opts[:, prev])
            for ji, ja, jb in own_ints:
                other = X[:, jb if ja == j else ja]
                prod = opts * other[None, :]
                contrib = contrib + beta[ji] * (prod[:, cur] - rho * prod[:, prev])
            e = ys[None, :] - base[None, :] - contrib
            ll = -0.5 * (e**2 @ w) / sigma2 + fk["lp"]
            pg = np.exp(ll - ll.max())
            fk["g"] = int(rng.choice(len(pg), p=pg / pg.sum()))
            X[:, j] = opts[fk["g"]]
            for ji, ja, jb in own_ints:
                X[:, ji] = X[:, ja] * X[:, jb]

        # 5) 外れた日の重みと、裾の重さ（自由度）を推定し直す
        if robust:
            # 自由度は、日ごとの重みを消した（周辺化した）t 分布の尤度から先に選び、そのあと重みを選ぶ。
            # 重みを残したまま自由度を選ぶと、自由度と重みが連動して動きにくく、
            # 組み合わせの上乗せのように幅の広い項目で有効な推定回数が足りなくなった（v0.5.0）
            e = (y[cur] - rho * y[prev]) - (X[cur] - rho * X[prev]) @ beta
            z = e / np.sqrt(sigma2)
            lnu = _t_loglik(z)
            pn = np.exp(lnu - lnu.max())
            nu = float(rng.choice(NU_GRID, p=pn / pn.sum()))
            w = rng.gamma((nu + 1) / 2, 2 / (nu + e**2 / sigma2))
            w = np.maximum(w, 1e-6)

        if it >= n_burn:
            j_ = it - n_burn
            beta_out[j_] = beta
            rho_out[j_] = rho
            sig_out[j_] = np.sqrt(sigma2)
            if opt_out is not None:
                opt_out[j_] = [fk["g"] for fk in facs]
            if nu_out is not None:
                nu_out[j_] = nu
            w_sum += w

    f = Fit(names, beta_out, rho_out, sig_out, len(cur), pr)
    if opt_out is not None:
        f.lag_draws = opt_out[:, 0]
        f.option_draws = opt_out
        f.factor_names = [fk["name"] for fk in facs]
    f.nu_draws = nu_out
    if robust:
        f.weight_mean = w_sum / n_draws
        f.weight_day = day[cur]
    return f


N_CHAINS = 4


def fit_chains(
    y: np.ndarray,
    X: np.ndarray,
    day: np.ndarray,
    names: list[str],
    priors: dict | None = None,
    n_chains: int = N_CHAINS,
    n_draws: int = 1000,
    n_burn: int = 1000,
    seed: int = 0,
    **kw,
) -> Fit:
    """出発点を変えた複数本を走らせてまとめる。diag に収束診断（R̂・ESS）が入る。"""
    from .diagnostics import check

    fits = [fit(y, X, day, names, priors, n_draws, n_burn, seed=seed * 100 + c, jitter=True, **kw) for c in range(n_chains)]
    f = Fit(
        names,
        np.vstack([g.beta_draws for g in fits]),
        np.concatenate([g.rho_draws for g in fits]),
        np.concatenate([g.sigma_draws for g in fits]),
        fits[0].n_used,
        fits[0].priors,
    )
    if fits[0].lag_draws is not None:
        f.lag_draws = np.concatenate([g.lag_draws for g in fits])
        f.option_draws = np.vstack([g.option_draws for g in fits])
        f.factor_names = fits[0].factor_names
    if fits[0].nu_draws is not None:
        f.nu_draws = np.concatenate([g.nu_draws for g in fits])
        f.weight_mean = np.mean([g.weight_mean for g in fits], axis=0)
        f.weight_day = fits[0].weight_day
    j = names.index("treatment")
    f.diag = {
        "treatment": check(np.array([g.beta_draws[:, j] for g in fits])),
        "rho": check(np.array([g.rho_draws for g in fits])),
        "terms": {n_: check(np.array([g.beta_draws[:, i_] for g in fits])) for i_, n_ in enumerate(names) if is_term(n_)},
        "n_chains": n_chains,
        "n_draws": n_draws,
    }
    return f


def gls_estimate(y, X, day, rho: float, j: int) -> float:
    """引きずりの強さを rho に固定したときの、j 番目の係数の最小二乗推定（偶然との比較に使う）。"""
    y, X, day, cur, prev = prepare(y, X, day)
    ys = y[cur] - rho * y[prev]
    Xs = X[cur] - rho * X[prev]
    return float(np.linalg.lstsq(Xs, ys, rcond=None)[0][j])


@dataclass
class Verdict:
    """判定。direction は「良くなる向き」を +1、「下がるほど良い記録」なら -1。"""

    p_better: float  # 飲んだ期間の方が良かった確率
    p_meaningful: float  # 意味のある大きさ（mid 点）以上良かった確率
    effect_mean: float  # 良くなる向きにそろえた差（点）
    effect_low: float  # 幅の下限
    effect_high: float  # 幅の上限
    rho_mean: float
    label: str


LABELS = (
    (0.95, "はっきり差がある"),
    (0.80, "差がありそう"),
)
WORSE_LABELS = (
    (0.95, "悪い方向にはっきり差がある"),
    (0.80, "悪い方向に差がありそう"),
)


# レポートに出す幅。名目の値ではなく、偽データで実際に何%正解を含むかを測って決める。
# 0.1.0 の検証（CALIBRATION.md）：名目90%の幅は実際85%しか正解を含まなかったため、
# 名目95%の幅を「90%の幅」として出していた。
# 0.3.0：遅れの推定と t 分布を入れると幅が広がり、名目95%の幅が実際95〜98%を含むようになったため、
# 名目90%の幅に戻す（再検証の結果は CALIBRATION.md）。
INTERVAL_QUANTILES = (0.05, 0.95)


def verdict(f: Fit, direction: int = 1, mid: float = 1.0) -> Verdict:
    return verdict_draws(f.draws("treatment"), direction, mid, float(f.rho_draws.mean()))


def verdict_draws(draws: np.ndarray, direction: int = 1, mid: float = 1.0, rho_mean: float = float("nan")) -> Verdict:
    """差の抽出から判定を作る（1人分の推定にも、複数人を使った推定にも使う）。"""
    eff = np.asarray(draws) * direction
    p_better = float(np.mean(eff > 0))
    label = "はっきりしない"
    for threshold, text in LABELS:
        if p_better >= threshold:
            label = text
            break
    else:
        for threshold, text in WORSE_LABELS:
            if 1 - p_better >= threshold:
                label = text
                break
    return Verdict(
        p_better=p_better,
        p_meaningful=float(np.mean(eff >= mid)),
        effect_mean=float(eff.mean()),
        effect_low=float(np.quantile(eff, INTERVAL_QUANTILES[0])),
        effect_high=float(np.quantile(eff, INTERVAL_QUANTILES[1])),
        rho_mean=rho_mean,
        label=label,
    )
