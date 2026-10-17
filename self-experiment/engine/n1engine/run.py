"""実行の入口。

  記録の分析：
    python -m n1engine.run analyze 記録.csv --item "カフェイン（15時）" \\
        --outcome sol --substance caffeine --dose-hour 15

  複数の成分を掛け合わせる（例：カフェイン15時 と テアニン15時 の56日）：
    python -m n1engine.run analyze 記録.csv --item "カフェイン×テアニン" --outcome sol \
        --substance caffeine --dose-hour 15 --extra theanine:theanine:15

  実験前の日数の見積もり（普段通りの記録が7日以上あるとき）：
    python -m n1engine.run plan 普段の記録.csv --substance caffeine --dose-hour 15 --timing night

  成分の一覧と、7日ずつの入れ替えに向いているか：
    python -m n1engine.run substances

CSVの列（項目の意味・役割は n1engine/domain/variables.py）
  day        1始まりの日番号（抜けた日は行ごと無くてよい）
  phase      A=普段通り / B=飲む
  phase_<名前>  掛け合わせる追加の成分・要因があるとき、その分の A/B（--extra で名前を指定）。
             dose_hour_<名前>・taken_<名前>・amount_<名前> も同じ名前の接尾辞で読む
  主要項目    実験前に決めた1つ（--outcome で指定。既定は outcome）
  体の反応    mood, stress, sleep, sol, waso, tst, tib, se, rhr, rmssd（あれば参考として出す）
  外部要因    alcohol, coffee, offday, sick, cycle_day（あれば補正に使う）
  dose_hour  実際に飲んだ時刻（21.5 = 21時30分）
  taken      飲む日に実際に飲んだか（1/0）。0 の日は体内量に入れない
  記録フォーム（self-experiment/form/）の書き出しはこの形式になっている
  belief     中身を隠す上級版のみ。今日は本物を飲んだと思う=1 / 思わない=0
  夜の項目（睡眠・睡眠中の心拍など）は翌朝に書くが、その日の行に入れる。
"""

from __future__ import annotations

import argparse
import csv
import sys

import numpy as np

from .blinding import belief_association, blind_integrity
from .domain.pk import window_for
from .domain.substances import SUBSTANCES, custom
from .domain.pk import suitability
from .domain.variables import VARIABLES, transformed
from .pipeline import _scale, analyze
from .report import render
from .simulate import plan_length

TEXT_COLUMNS = ("phase", "pair_order", "rating_order", "date")


def _is_phase(name: str) -> bool:
    return name == "phase" or name.startswith("phase_")


def load(path: str) -> dict[str, np.ndarray]:
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise SystemExit("CSVが空です")
    data: dict[str, np.ndarray] = {}
    for name in rows[0]:
        if name in TEXT_COLUMNS or name.startswith("phase_"):
            if name in ("pair_order", "rating_order"):
                data[name] = np.array([(r.get(name) or "").strip() for r in rows], dtype=object)
            continue
        vals = []
        for r in rows:
            v = (r.get(name) or "").strip()
            vals.append(float(v) if v != "" else np.nan)
        arr = np.array(vals, dtype=float)
        if not np.all(np.isnan(arr)):
            data[name] = arr
    data["day"] = data["day"].astype(int)
    for col in rows[0]:
        if not _is_phase(col):
            continue
        sfx = col[len("phase"):]  # "" または "_<名前>"
        ph = [r[col].strip().upper() for r in rows]
        data["treat" + sfx] = np.array([1 if p_ in ("B", "H") else 0 for p_ in ph])
        if "H" in ph and "amount" + sfx not in data:
            data["amount" + sfx] = np.array([0.5 if p_ == "H" else 1.0 for p_ in ph])
    return data


def parse_extra(spec: str):
    """--extra の値 '名前[:成分[:時刻]]' から、追加の要因を作る。成分は一覧の名前（なければ名前自体を成分名として探す）。"""
    from .pipeline import Factor

    parts = spec.split(":")
    key = parts[0]
    sub_key = parts[1] if len(parts) > 1 and parts[1] else None
    hour = float(parts[2]) if len(parts) > 2 and parts[2] else 8.0
    sub = None
    if sub_key:
        if sub_key not in SUBSTANCES:
            raise SystemExit(f"成分の一覧にありません: {sub_key}（{', '.join(SUBSTANCES)}）")
        sub = SUBSTANCES[sub_key]
    return Factor(key=key, label=sub.name if sub else key, substance=sub, dose_hour=hour)


def _substance(a):
    if a.half_life:
        return custom(a.half_life, a.tmax, a.item if hasattr(a, "item") else "指定の成分")
    if a.substance:
        if a.substance not in SUBSTANCES:
            raise SystemExit(f"成分の一覧にありません: {a.substance}（{', '.join(SUBSTANCES)}）")
        return SUBSTANCES[a.substance]
    return None


def cmd_analyze(a: argparse.Namespace) -> None:
    from .cohort import CohortStore

    d = load(a.csv)
    store = CohortStore(a.cohort) if a.cohort else None
    direction = -1 if a.lower_is_better else None
    res = analyze(
        d,
        primary=a.outcome,
        timing=a.timing,
        direction=direction,
        substance=_substance(a),
        dose_hour=a.dose_hour,
        bedtime=a.bedtime,
        waketime=a.waketime,
        cycle_length=a.cycle_length,
        mid=a.mid,
        seed=a.seed,
        pd=not a.no_pd,
        cohort=store,
        client_id=a.client_id,
        blinded=a.blinded,
        consent=not a.no_consent,
        extras=[parse_extra(x) for x in a.extra],
        primary_label=a.name,
    )
    if store is not None:
        store.save()
    blind = belief = None
    if a.blinded and "belief" in d:
        blind = blind_integrity(d["belief"], d["treat"])
        belief = belief_association(d[a.outcome] * (res.primary.direction or 1), d["treat"], d["belief"])
    md = render(item=a.item, outcome_label=a.outcome_label, res=res, blinded=a.blinded, blind=blind, belief=belief)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            fh.write(md)
        print(f"レポートを書き出しました: {a.out}")
    else:
        print(md)


def cmd_plan(a: argparse.Namespace) -> None:
    d = load(a.csv)
    sub = _substance(a)
    w = window_for(a.timing, a.bedtime, a.waketime)
    pk = sub.pk if sub else None
    var = VARIABLES.get(a.outcome)
    unit = var.unit if var else "0〜10"
    y, sd, _ = _scale(transformed(a.outcome, d[a.outcome]), np.zeros(len(d["day"]), dtype=int), unit)
    res = plan_length(y, effect=a.effect / sd, n_sims=a.sims, seed=a.seed, pk=pk, dose_hour=a.dose_hour, window=w)
    if sub:
        s = suitability(pk, a.dose_hour, w, steady_days=sub.steady_days)
        print(f"{sub.name}：{s['level']}。{s['text']}")
    print(f"{a.effect:g}（{unit}）の差が本当にあるとき、「はっきり差がある」と判定できる確率")
    for r in res:
        print(f"  {r['days']:>3}日：{round(r['power'] * 100)}%")


def cmd_substances(a: argparse.Namespace) -> None:
    w = window_for(a.timing, a.bedtime, a.waketime)
    for s in SUBSTANCES.values():
        r = suitability(s.pk, a.dose_hour, w, steady_days=s.steady_days)
        th = (f"半減期 {s.pk.t_half_h:.3g}時間" if s.pk.t_half_h < 48 else f"半減期 {s.pk.t_half_h / 24:.3g}日") if s.pk else "半減期 なし"
        print(f"{s.key:10s} {s.name}｜{th}｜{r['level']}：{r['text']}")


def cmd_quantum(a: argparse.Namespace) -> None:
    """研究層：複数人の記録の「はい／いいえ」の2問から、質問の順番のモデルを比べる。"""
    from .research.qq import qq_test
    from .research.quantum import compare_models, table_from_records

    person, qa, qb, order = [], [], [], []
    for i, path in enumerate(a.csv):
        with open(path, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if (r.get("qa") or "") == "" or (r.get("qb") or "") == "" or r.get("pair_order") not in ("AB", "BA"):
                    continue
                person.append(i); qa.append(float(r["qa"])); qb.append(float(r["qb"])); order.append(r["pair_order"])
    if not qa:
        raise SystemExit("qa・qb・pair_order の記録がありません")
    person, qa, qb, order = map(np.array, (person, qa, qb, order))
    r = compare_models(table_from_records(qa, qb, order))
    print(f"答え {r['answers']}件・{len(a.csv)}人（研究層。顧客のレポートには使わない）")
    for m, v in r["models"].items():
        print(f"  {m:13s} 対数尤度 {v['ll']:9.2f}  パラメータ {v['k']}  BIC {v['bic']:8.2f}")
    print(f"  BIC で最も良いモデル：{r['best_bic']}")
    print(f"  QQ等式の検定 p={r['qq_lr_p']:.3f}（食い違いの差 {r['qq_q']:+.3f}）／2次元量子モデルの当てはまり p={r['quantum2d_lr_p']:.3f}")
    if len(a.csv) >= 2:
        t = qq_test(person, qa, qb, order)
        print(f"  人単位の再標本化：q={t['q']:+.3f}（95%の幅 {t['low']:+.3f}〜{t['high']:+.3f}）")


def cmd_pool(a: argparse.Namespace) -> None:
    """研究層：同じ成分・同じ主要項目の複数人の1人実験を、階層モデルでまとめる。"""
    from .research.population import pool

    sub = _substance(a)
    est, se = [], []
    for path in a.csv:
        res = analyze(load(path), primary=a.outcome, timing=a.timing, substance=sub, dose_hour=a.dose_hour,
                      bedtime=a.bedtime, waketime=a.waketime, n_draws=500, null_sims=50, secondary=False)
        dr = res.primary.fit.draws("treatment")
        est.append(float(dr.mean())); se.append(float(dr.std()))
    r = pool(np.array(est), np.array(se))
    print(f"{len(est)}人（研究層。成分の働きの話になるため、顧客のレポートや宣伝には使わない）")
    print(f"  全体の平均 {r['mu_mean']:+.2f}（95%の幅 {r['mu_low']:+.2f}〜{r['mu_high']:+.2f}）／人による違い τ={r['tau_mean']:.2f}")
    print(f"  次の1人の差の見込み {r['new_person_low']:+.2f}〜{r['new_person_high']:+.2f}")
    for path, e, m in zip(a.csv, est, r["individual_mean"]):
        print(f"  {path}: 1人の推定 {e:+.2f} → まとめた推定 {m:+.2f}")


def _common(p):
    p.add_argument("--substance", help=f"成分（{', '.join(SUBSTANCES)}）")
    p.add_argument("--half-life", type=float, help="一覧に無い成分の半減期（時間）")
    p.add_argument("--tmax", type=float, help="一覧に無い成分の最高濃度までの時間（時間）")
    p.add_argument("--dose-hour", type=float, default=8.0, help="飲む予定の時刻（既定 8時）")
    p.add_argument("--timing", choices=("day", "night"), default="day", help="主要項目の時間帯（日中／その夜）")
    p.add_argument("--bedtime", type=float, default=23.0)
    p.add_argument("--waketime", type=float, default=7.0)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="n1engine")
    sub = p.add_subparsers(dest="cmd", required=True)

    an = sub.add_parser("analyze", help="記録を分析してレポートを作る")
    an.add_argument("csv")
    an.add_argument("--item", required=True, help="試したもの（例：カフェイン（15時））")
    an.add_argument("--outcome", default="outcome", help="主要項目の列名（実験前に決めた1つ）")
    an.add_argument("--outcome-label", help="主要項目の呼び名（一覧にない列のとき）")
    an.add_argument("--lower-is-better", action="store_true", help="数字が低いほど良い項目（だるさ等）")
    an.add_argument("--mid", type=float, help="意味のある差の大きさ（主要項目の単位。0〜10の項目は既定1点）")
    an.add_argument("--cycle-length", type=float, default=28.0, help="月経周期の長さ（日）")
    an.add_argument("--blinded", action="store_true", help="中身を隠す上級版")
    an.add_argument("--cohort", help="複数人の要約を保存するファイル（例：cohort.json）。指定すると他の人の傾向を土台にする")
    an.add_argument("--client-id", help="お客さんの番号（cohort の中で人を区別する）")
    an.add_argument("--no-consent", action="store_true", help="この人の要約を cohort に保存しない")
    an.add_argument("--no-pd", action="store_true", help="記録に現れるまでの遅れを推定しない（遅れが無いと分かっている場合。検出力が上がる）")
    an.add_argument("--extra", action="append", default=[], metavar="名前[:成分[:時刻]]",
                    help="掛け合わせる追加の成分・要因（記録の列 phase_<名前>）。複数回指定できる")
    an.add_argument("--name", help="最初の成分・要因の呼び名（既定は成分名）")
    an.add_argument("--out")
    an.add_argument("--seed", type=int, default=0)
    _common(an)
    an.set_defaults(func=cmd_analyze)

    pl = sub.add_parser("plan", help="何日必要かを見積もる")
    pl.add_argument("csv")
    pl.add_argument("--outcome", default="outcome")
    pl.add_argument("--effect", type=float, default=1.0)
    pl.add_argument("--sims", type=int, default=100)
    pl.add_argument("--seed", type=int, default=0)
    _common(pl)
    pl.set_defaults(func=cmd_plan)

    qu = sub.add_parser("quantum", help="研究層：質問の順番の量子モデルを比べる（複数人のCSV）")
    qu.add_argument("csv", nargs="+")
    qu.set_defaults(func=cmd_quantum)

    po = sub.add_parser("pool", help="研究層：複数人の1人実験を階層モデルでまとめる")
    po.add_argument("csv", nargs="+")
    po.add_argument("--outcome", default="outcome")
    _common(po)
    po.set_defaults(func=cmd_pool)

    su = sub.add_parser("substances", help="成分の一覧と、7日ずつの入れ替えに向いているか")
    _common(su)
    su.set_defaults(func=cmd_substances)

    a = p.parse_args(argv)
    a.func(a)


if __name__ == "__main__":
    main(sys.argv[1:])
