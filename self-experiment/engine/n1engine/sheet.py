"""お客さんの記録用の Excel（.xlsx）。作る（make_workbook）と読む（read_workbook）。

なぜ Excel か
  ココナラでは、外部のフォームやWebページへの誘導、外部の連絡先の交換が禁止されていて、
  データのやり取りはトークルームのファイル添付で行う。添付できる形式に Excel・PDF・txt はあるが、
  CSV は一覧にない（docs/04-compliance.md）。そこで、お客さんごとの日程を入れた Excel を渡し、
  毎日書いてもらって、週に1回と最後にトークルームへ添付してもらう。

シートの中身
  はじめに      書き方・送り方・やめる条件・記録の扱い
  毎日の記録    1行=1日。日付・今日すること（飲む／飲まない）は記入済み。記入欄だけ編集できる（シートを保護）
  設定          エンジンが読む設定（成分・主要項目・並び・開始日など）。非表示
  分析エンジンは read_workbook でこのファイルを直接読む（run analyze 記録.xlsx）。設定もファイルから読むので、
  担当者がコマンドに成分や主要項目を打ち直す必要がない。
"""

from __future__ import annotations

import datetime as dt
import random
from dataclasses import asdict, dataclass, field

import numpy as np

from . import VERSION
from .design import BALANCED_SEQUENCES, CYCLE_SEQUENCES, DOSE_OF_PHASE, DOSE_SEQUENCES, FACTORIAL_SEQUENCES
from .domain.substances import SUBSTANCES
from .domain.variables import VARIABLES

BASELINE_DAYS = 7
BLOCK = 7


@dataclass
class SheetConfig:
    item: str
    substance: str = "none"  # 成分の一覧の名前（none = 指定しない、custom = 半減期を指定）
    outcome: str = "sol"  # 主要項目（variables.py の名前、または outcome）
    outcome_label: str = ""  # outcome のときの呼び名（0〜10）
    outcome_timing: str = "day"  # outcome のときの時間帯
    lower_is_better: bool = False  # outcome のとき、低いほど良いか
    dose_time: str = "21:00"
    start_date: str = ""  # 普段どおりの記録を始める日（YYYY-MM-DD）
    half_life: float | None = None  # custom のとき（時間）
    tmax: float | None = None
    combo: bool = False  # 2つの成分を掛け合わせる（56日）
    item2: str = ""
    substance2: str = "none"
    half_life2: float | None = None
    tmax2: float | None = None
    dose_time2: str = "21:00"
    dose: bool = False  # 半分の量の期間を入れる（42日）
    cycle: bool = False  # 月経周期を記録する（56日）
    cycle_length: float = 28.0
    last_period: str = ""
    wear: bool = False  # 睡眠中の心拍を機器で測っている
    bedtime: str = "23:00"
    waketime: str = "07:00"
    sequence: str = ""  # 空なら乱数で決める
    client_id: str = ""
    version: str = VERSION
    extra: dict = field(default_factory=dict)

    def key2(self) -> str:
        return self.substance2 if self.substance2 not in ("none", "custom", "") else "factor2"


def choose_sequence(cfg: SheetConfig, seed: int | None = None) -> str:
    rng = random.Random(seed)
    if cfg.combo:
        seq = rng.choice(FACTORIAL_SEQUENCES)
        s = "".join(str(c) for c in seq)
        if rng.random() < 0.5:  # A と B の役を入れ替える
            s = s.translate(str.maketrans("12", "21"))
        return s
    if cfg.cycle:
        return rng.choice(CYCLE_SEQUENCES)
    if cfg.dose:
        return rng.choice(DOSE_SEQUENCES)
    return rng.choice(BALANCED_SEQUENCES)


def levels(cfg: SheetConfig, phase: str) -> tuple[float, float]:
    """期間の記号 → （1つ目の量, 2つ目の量）。0=飲まない・1=飲む・0.5=半分。"""
    if cfg.combo:
        c = int(phase)
        return float(c & 1), float((c >> 1) & 1)
    return DOSE_OF_PHASE.get(phase, 1.0 if phase == "B" else 0.0), 0.0


def _todo(cfg: SheetConfig, phase: str | None) -> str:
    if phase is None:
        return "飲まない（普段どおり）"
    a, b = levels(cfg, phase)
    if cfg.combo:
        if a and b:
            return f"両方飲む：{cfg.item}（{cfg.dose_time}）と {cfg.item2}（{cfg.dose_time2}）"
        if a:
            return f"{cfg.item}だけ飲む（{cfg.dose_time}）"
        if b:
            return f"{cfg.item2}だけ飲む（{cfg.dose_time2}）"
        return "どちらも飲まない"
    if a == 0.5:
        return f"半分の量を飲む（{cfg.dose_time}）"
    return f"飲む（{cfg.dose_time}）" if a else "飲まない"


# 記入欄：（キー, 見出し, 種類, 出す条件）。種類：rating=0〜10、min=分、count=杯、time=時刻、yesno=はい/いいえ、num=数
def columns(cfg: SheetConfig) -> list[tuple[str, str, str]]:
    cols = [("taken", f"{'1つ目を' if cfg.combo else ''}飲んだか", "yesno"), ("dose", f"{'1つ目を' if cfg.combo else ''}飲んだ時刻", "time")]
    if cfg.combo:
        cols += [("taken2", "2つ目を飲んだか", "yesno"), ("dose2", "2つ目を飲んだ時刻", "time")]
    cols += [("mood", "今日の気分（0〜10）", "rating"), ("stress", "今日のストレス（0〜10）", "rating")]
    if cfg.outcome == "outcome" and cfg.outcome_timing == "day":
        cols.append(("outcome", f"{cfg.outcome_label}（0〜10）", "rating"))
    cols.append(("alcohol", "飲酒（杯）", "count"))
    if "caffeine" not in (cfg.substance, cfg.substance2 if cfg.combo else ""):
        cols.append(("coffee", "カフェイン飲料（杯）", "count"))
    cols += [("offday", "休日だった", "yesno"), ("sick", "体調を崩していた", "yesno")]
    if cfg.cycle:
        cols.append(("period_start", "今日が月経の初日", "yesno"))
    cols += [
        ("bed", "【翌朝】寝床に入った時刻", "time"),
        ("try_", "【翌朝】眠ろうとした時刻", "time"),
        ("sol", "【翌朝】寝つくまで（分）", "min"),
        ("waso", "【翌朝】途中で起きていた合計（分）", "min"),
        ("wake", "【翌朝】最後に目が覚めた時刻", "time"),
        ("up", "【翌朝】寝床から出た時刻", "time"),
        ("sleep", "【翌朝】睡眠の質（0〜10）", "rating"),
    ]
    if cfg.outcome == "outcome" and cfg.outcome_timing == "night":
        cols.append(("outcome", f"【翌朝】{cfg.outcome_label}（0〜10）", "rating"))
    if cfg.wear:
        cols += [("rhr", "【翌朝】睡眠中の心拍数（機器）", "num"), ("rmssd", "【翌朝】心拍変動 RMSSD（機器）", "num")]
    cols.append(("note", "メモ（分析には使いません）", "text"))
    return cols


FIXED = [("date", "日付"), ("day_no", "日目"), ("kind", "区分"), ("todo", "今日すること")]


def schedule_rows(cfg: SheetConfig) -> list[dict]:
    start = dt.date.fromisoformat(cfg.start_date)
    rows = []
    for i in range(BASELINE_DAYS):
        rows.append({"date": start + dt.timedelta(days=i), "day_no": i + 1, "kind": "普段", "phase": None})
    for k in range(len(cfg.sequence) * BLOCK):
        rows.append({"date": start + dt.timedelta(days=BASELINE_DAYS + k), "day_no": k + 1, "kind": "実験", "phase": cfg.sequence[k // BLOCK]})
    return rows


def make_workbook(cfg: SheetConfig, path: str, seed: int | None = None) -> SheetConfig:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill, Protection
    from openpyxl.utils import get_column_letter
    from openpyxl.worksheet.datavalidation import DataValidation

    if not cfg.start_date:
        raise ValueError("開始日（start_date）を決めてください")
    if cfg.combo and (cfg.cycle or cfg.dose):
        raise ValueError("2成分の掛け合わせは、月経周期の記録・量の違いと同時にできません")
    if not cfg.sequence:
        cfg.sequence = choose_sequence(cfg, seed)
    wb = Workbook()

    # --- はじめに
    intro = wb.active
    intro.title = "はじめに"
    rows = schedule_rows(cfg)
    end = rows[-1]["date"]
    lines = [
        f"1人実験の記録：{cfg.item}" + (f" × {cfg.item2}" if cfg.combo else ""),
        "",
        f"期間：{rows[0]['date']:%Y年%m月%d日} 〜 {end:%Y年%m月%d日}（最初の{BASELINE_DAYS}日は普段どおり、そのあと実験{len(cfg.sequence) * BLOCK}日）",
        f"主要項目：{_outcome_label(cfg)}（判定に使う1つ。途中で変えません）",
        "",
        "書き方",
        "・「毎日の記録」シートの、その日の行に書きます。色の付いていない欄だけ書けます。",
        "・「今日すること」に、その日に飲むか飲まないかが書いてあります。そのとおりにしてください。",
        "・寝る前に：飲んだか・飲んだ時刻・気分・ストレス・飲酒・休日などを書きます。",
        "・【翌朝】の欄は、起きてから1時間以内に、前の日の行に書きます（その夜の睡眠はその日の行）。",
        "・書き忘れた日は空欄のままで大丈夫です。分からない欄も空欄にしてください。思い出して埋めるより、空欄の方が正確です。",
        "",
        "送り方",
        "・毎週日曜の夜と、最終日の翌朝に、このファイルをトークルームに添付して送ってください。",
        "・途中経過を見て、記録の付け方で気になる点があればお知らせします。判定は最後にだけ出します（途中で見ると結果がぶれるため）。",
        "",
        "次のときは実験をやめて、トークルームで知らせてください",
        "・体調が明らかに悪くなったとき。気になる症状があるときは医療機関に相談してください。",
        "・薬を飲み始めることになったとき、妊娠が分かったとき。",
        "",
        "記録の扱い",
        "・この記録は、あなたのレポートを作るためだけに使います。分析は担当者がAIの補助を使って行い、担当者が確認してから納品します。",
        "・病名や飲んでいる薬の名前は書かないでください（この実験には使いません）。",
        f"・納品の後、{RETENTION_DAYS}日でファイルを削除します。早く削除してほしいときはトークルームで知らせてください。",
    ]
    for i, t in enumerate(lines, 1):
        c = intro.cell(row=i, column=1, value=t)
        c.alignment = Alignment(wrap_text=True, vertical="top")
        if i == 1 or t in ("書き方", "送り方", "記録の扱い") or t.startswith("次のときは"):
            c.font = Font(bold=True, size=13 if i == 1 else 11)
    intro.column_dimensions["A"].width = 100

    # --- 毎日の記録
    ws = wb.create_sheet("毎日の記録")
    cols = columns(cfg)
    heads = [h for _, h in FIXED] + [h for _, h, _ in cols]
    for j, h in enumerate(heads, 1):
        c = ws.cell(row=1, column=j, value=h)
        c.font = Font(bold=True)
        c.alignment = Alignment(wrap_text=True, vertical="center")
        c.fill = PatternFill("solid", fgColor="E8EEEB")
        c.protection = Protection(locked=True)
        ws.column_dimensions[get_column_letter(j)].width = 22 if j == 4 else 12 if j > len(FIXED) else 11
    ws.column_dimensions["D"].width = 34
    ws.row_dimensions[1].height = 48
    ws.freeze_panes = "E2"
    fill_take = PatternFill("solid", fgColor="F6E7D3")
    fill_rest = PatternFill("solid", fgColor="E1E8EE")
    fill_base = PatternFill("solid", fgColor="F2F2F0")
    dvs = {
        "rating": DataValidation(type="whole", operator="between", formula1="0", formula2="10", allow_blank=True,
                                 error="0〜10の整数で書いてください", errorTitle="0〜10", showErrorMessage=True),
        "yesno": DataValidation(type="list", formula1='"はい,いいえ"', allow_blank=True),
        "min": DataValidation(type="whole", operator="between", formula1="0", formula2="600", allow_blank=True,
                              error="分を整数で書いてください（0〜600）", showErrorMessage=True),
        "count": DataValidation(type="whole", operator="between", formula1="0", formula2="30", allow_blank=True,
                                error="杯数を整数で書いてください", showErrorMessage=True),
        "time": DataValidation(type="time", operator="between", formula1="0", formula2="0.999988", allow_blank=True,
                               error="時刻を 23:10 の形で書いてください", showErrorMessage=True),
        "num": DataValidation(type="decimal", operator="between", formula1="0", formula2="300", allow_blank=True),
    }
    for v in dvs.values():
        ws.add_data_validation(v)
    for i, r in enumerate(rows, 2):
        a = levels(cfg, r["phase"])[0] if r["phase"] else 0.0
        b = levels(cfg, r["phase"])[1] if r["phase"] else 0.0
        fill = fill_base if r["kind"] == "普段" else fill_take if (a or b) else fill_rest
        vals = [r["date"], r["day_no"], r["kind"], _todo(cfg, r["phase"])]
        for j, v in enumerate(vals, 1):
            c = ws.cell(row=i, column=j, value=v)
            c.fill = fill
            if j == 1:
                c.number_format = "m/d（aaa）"
        for j, (key, _, kind) in enumerate(cols, len(FIXED) + 1):
            c = ws.cell(row=i, column=j)
            dosing_col = key in ("taken", "dose") and not a or key in ("taken2", "dose2") and not b
            if dosing_col:
                c.fill = fill_base  # 飲まない日は書かない
                c.protection = Protection(locked=True)
                continue
            c.protection = Protection(locked=False)
            if kind == "time":
                c.number_format = "h:mm"
            if kind in dvs:
                dvs[kind].add(c)
    ws.protection.sheet = True  # 見出し・日付・今日することを守る（パスワードなし。解除はできる）
    ws.protection.formatColumns = False

    # --- 設定（エンジン用、非表示）
    st = wb.create_sheet("設定")
    for i, (k, v) in enumerate(asdict(cfg).items(), 1):
        st.cell(row=i, column=1, value=k)
        st.cell(row=i, column=2, value=str(v) if isinstance(v, dict) else v)
    st.sheet_state = "hidden"
    wb.active = 1
    wb.save(path)
    return cfg


RETENTION_DAYS = 90


def _outcome_label(cfg: SheetConfig) -> str:
    if cfg.outcome == "outcome":
        return cfg.outcome_label or "自分で決めた項目"
    v = VARIABLES.get(cfg.outcome)
    return v.label if v else cfg.outcome


# ---------------------------------------------------------------- 読む


def _bool(v) -> bool | None:
    if v is None or v == "":
        return None
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    s = str(v).strip()
    if s in ("はい", "○", "◯", "1", "yes", "y", "true", "TRUE"):
        return True
    if s in ("いいえ", "×", "0", "no", "n", "false", "FALSE"):
        return False
    return None


def _hours(v) -> float | None:
    """時刻 → 時（21.5 = 21時30分）。Excel の時刻・文字の 23:10・1日の割合のどれでも読む。"""
    if v is None or v == "":
        return None
    if isinstance(v, dt.datetime):
        return v.hour + v.minute / 60
    if isinstance(v, dt.time):
        return v.hour + v.minute / 60
    if isinstance(v, dt.timedelta):
        return (v.total_seconds() / 3600) % 24
    if isinstance(v, (int, float)):
        return float(v) * 24 if 0 <= v < 1 else float(v) % 24
    s = str(v).strip().replace("：", ":").replace("時", ":").replace("分", "")
    if ":" in s:
        h, m = s.split(":")[:2]
        return int(h) + (int(m or 0)) / 60
    return None


def _num(v) -> float:
    if v is None or v == "":
        return np.nan
    try:
        return float(v)
    except (TypeError, ValueError):
        return np.nan


def _config(wb) -> SheetConfig:
    if "設定" not in wb.sheetnames:
        raise ValueError("「設定」シートがありません（このエンジンで作った記録用のファイルを使ってください）")
    raw = {r[0]: r[1] for r in wb["設定"].iter_rows(values_only=True) if r[0]}
    fields = SheetConfig.__dataclass_fields__
    kw = {}
    for k, v in raw.items():
        if k not in fields or k == "extra":
            continue
        t = fields[k].type
        if v is None:
            v = "" if "str" in str(t) and "None" not in str(t) else None
        elif "bool" in str(t):
            v = v if isinstance(v, bool) else str(v).lower() in ("true", "1")
        elif "float" in str(t):
            v = float(v)
        else:
            v = str(v)
        kw[k] = v
    return SheetConfig(**kw)


def read_workbook(path: str) -> tuple[dict[str, np.ndarray], dict[str, np.ndarray], SheetConfig]:
    """（実験の記録, 普段の記録, 設定）。記録は run.load() と同じ形（day・treat・主要項目…）。"""
    from openpyxl import load_workbook

    wb = load_workbook(path, data_only=True)
    cfg = _config(wb)
    ws = wb["毎日の記録"]
    head = [c.value for c in ws[1]]
    cols = columns(cfg)
    key_of = {h: k for k, h in FIXED}
    key_of.update({h: k for k, h, _ in cols})
    kind_of = {k: kind for k, _, kind in cols}
    idx = {key_of[h]: j for j, h in enumerate(head) if h in key_of}
    phases = {r["day_no"] if r["kind"] == "実験" else -r["day_no"]: r["phase"] for r in schedule_rows(cfg)}
    exp, base = [], []
    period_dates = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if row[idx["day_no"]] is None:
            continue
        rec = {k: row[j] for k, j in idx.items()}
        filled = [k for k in kind_of if rec.get(k) not in (None, "") and k != "note"]
        if _bool(rec.get("period_start")):
            date = rec["date"].date() if isinstance(rec["date"], dt.datetime) else rec["date"]
            period_dates.append(date)
        if not filled:
            continue  # 書かれていない日は、行ごと無い扱い
        (base if rec["kind"] == "普段" else exp).append(rec)
    if cfg.last_period:
        period_dates.append(dt.date.fromisoformat(cfg.last_period))
    period_dates.sort()

    def to_data(recs: list[dict], is_exp: bool) -> dict[str, np.ndarray]:
        out: dict[str, list] = {}
        for rec in recs:
            day_no = int(rec["day_no"])
            phase = phases.get(day_no if is_exp else -day_no)
            a, b = levels(cfg, phase) if phase else (0.0, 0.0)
            vals = {"day": day_no, "treat": 1 if a else 0, "amount": a if a else np.nan}
            if cfg.combo:
                vals["treat_" + cfg.key2()] = 1 if b else 0
            tk = _bool(rec.get("taken"))
            vals["taken"] = (1.0 if tk else 0.0) if (a and tk is not None) else np.nan
            dh = _hours(rec.get("dose")) if a and tk else None
            vals["dose_hour"] = dh if dh is not None else np.nan
            if cfg.combo:
                tk2 = _bool(rec.get("taken2"))
                vals["taken_" + cfg.key2()] = (1.0 if tk2 else 0.0) if (b and tk2 is not None) else np.nan
                dh2 = _hours(rec.get("dose2")) if b and tk2 else None
                vals["dose_hour_" + cfg.key2()] = dh2 if dh2 is not None else np.nan
            for k in ("mood", "stress", "sleep", "sol", "waso", "rhr", "rmssd", "outcome", "alcohol", "coffee"):
                if k in kind_of:
                    vals[k] = _num(rec.get(k))
            for k in ("offday", "sick"):
                bv = _bool(rec.get(k))
                vals[k] = np.nan if bv is None else float(bv)
            # 睡眠日誌から計算する値（Consensus Sleep Diary：TST = 眠ろうとしてから目覚めるまで − 寝つき − 途中覚醒）
            bed, tr, wk, up = (_hours(rec.get(k)) for k in ("bed", "try_", "wake", "up"))
            span = lambda x, y: ((y - x) % 24) * 60  # noqa: E731
            tib = span(bed, up) if bed is not None and up is not None else np.nan
            sol, waso = vals.get("sol", np.nan), vals.get("waso", np.nan)
            tst = span(tr, wk) - sol - waso if tr is not None and wk is not None and not np.isnan(sol) and not np.isnan(waso) else np.nan
            vals["tib"], vals["tst"] = tib, tst
            if cfg.cycle and period_dates:
                date = rec["date"].date() if isinstance(rec["date"], dt.datetime) else rec["date"]
                past = [p for p in period_dates if p <= date]
                vals["cycle_day"] = (date - past[-1]).days + 1 if past else np.nan
            for k, v in vals.items():
                out.setdefault(k, []).append(v)
        data = {k: np.array(v, dtype=float) for k, v in out.items()}
        if "day" in data:
            data["day"] = data["day"].astype(int)
            for k in [k for k in data if k == "treat" or k.startswith("treat_")]:
                data[k] = data[k].astype(int)
        for k in [k for k, v in data.items() if k not in ("day", "treat") and not k.startswith("treat_") and np.all(np.isnan(v))]:
            del data[k]  # 1日も書かれていない項目は無いものとして扱う
        return data

    return to_data(exp, True), to_data(base, False), cfg


def analyze_kwargs(cfg: SheetConfig) -> dict:
    """設定から、pipeline.analyze に渡す引数を作る。"""
    from .domain.substances import custom
    from .pipeline import Factor

    def sub(key, half, tmax, name):
        if key == "custom" and half:
            return custom(float(half), float(tmax) if tmax else None, name)
        return SUBSTANCES.get(key)

    kw = {
        "primary": cfg.outcome,
        "substance": sub(cfg.substance, cfg.half_life, cfg.tmax, cfg.item),
        "dose_hour": _hours(cfg.dose_time) or 8.0,
        "bedtime": _hours(cfg.bedtime) or 23.0,
        "waketime": _hours(cfg.waketime) or 7.0,
        "cycle_length": cfg.cycle_length,
        "primary_label": cfg.item if cfg.combo else None,
    }
    if cfg.outcome == "outcome":
        kw["timing"] = cfg.outcome_timing
        kw["direction"] = -1 if cfg.lower_is_better else 1
    if cfg.combo:
        kw["extras"] = [Factor(cfg.key2(), cfg.item2, sub(cfg.substance2, cfg.half_life2, cfg.tmax2, cfg.item2), _hours(cfg.dose_time2) or 8.0)]
    return kw
