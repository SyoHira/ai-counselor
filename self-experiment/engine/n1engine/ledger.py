"""受注の台帳（CSV）と集計。売り出してからの「測る」を、記憶でなく数字でやるための道具。

  python -m n1engine.run ledger add     --file ledger.csv --date 2026-12-01 --platform coconala --product standard --monitor
  python -m n1engine.run ledger update  --file ledger.csv --id C001 --delivered 2027-01-12 --minutes 35 --extended
  python -m n1engine.run ledger summary --file ledger.csv --target 50000

台帳には、お客様の名前・連絡先・記録の中身を入れない（案件番号と、日付・金額・作業時間だけ）。
お預かりした記録は納品の90日後に削除する約束なので、削除の期限も台帳から出す。
集計で分かること：件数・売上・手取り、納品までの日数、1件の作業時間（見込みの30分が合っているか）、延長の選択率、削除の期限。
"""

from __future__ import annotations

import csv
import datetime as dt
import pathlib

from .channels.content import PRODUCTS
from .channels.profiles import PLATFORMS
from .channels.render import LABEL, take_home

FIELDS = ["id", "date", "platform", "product", "price", "monitor", "delivered", "minutes", "extended", "extension_price", "note"]
EXTENSION_PRICE = 4000  # 56日への延長の差額（content.py のご案内と同じ）
KEEP_DAYS = 90  # 記録の保管（納品から）


def _d(s: str) -> dt.date:
    return dt.date.fromisoformat(s)


def load(path: str) -> list[dict]:
    p = pathlib.Path(path)
    if not p.exists():
        return []
    with p.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def save(path: str, rows: list[dict]) -> None:
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in FIELDS})


def add(path: str, date: str, platform: str, product: str, monitor: bool = False, price: int | None = None, note: str = "") -> str:
    if platform not in PLATFORMS:
        raise SystemExit(f"販売先は {', '.join(PLATFORMS)} のどれか")
    if product not in PRODUCTS:
        raise SystemExit(f"商品は {', '.join(PRODUCTS)} のどれか")
    _d(date)
    prod = PRODUCTS[product]
    if price is None:
        price = prod.monitor_price if (monitor and prod.monitor_price) else prod.price
        if monitor and not prod.monitor_price:
            raise SystemExit(f"{product} にモニター価格はありません")
    rows = load(path)
    n = 1 + max((int(r["id"][1:]) for r in rows), default=0)
    cid = f"C{n:03d}"
    rows.append({"id": cid, "date": date, "platform": platform, "product": product, "price": price, "monitor": int(monitor), "note": note})
    save(path, rows)
    return cid


def update(path: str, cid: str, delivered: str | None = None, minutes: int | None = None, extended: bool = False, note: str | None = None) -> None:
    rows = load(path)
    for r in rows:
        if r["id"] == cid:
            if delivered:
                if _d(delivered) < _d(r["date"]):
                    raise SystemExit("納品日が受付日より前です")
                r["delivered"] = delivered
            if minutes is not None:
                r["minutes"] = minutes
            if extended:
                r["extended"], r["extension_price"] = 1, EXTENSION_PRICE
            if note is not None:
                r["note"] = note
            save(path, rows)
            return
    raise SystemExit(f"{cid} が台帳にありません")


def _net(r: dict) -> int:
    p = PLATFORMS[r["platform"]]
    total = take_home(p, int(r["price"]))
    if r.get("extended") in ("1", 1):
        total += take_home(p, int(r.get("extension_price") or EXTENSION_PRICE))
    return total


def summary(rows: list[dict], today: dt.date | None = None, target: int = 50000) -> str:
    today = today or dt.date.today()
    if not rows:
        return "台帳が空です（ledger add で受注を入れる）"
    L = [f"# 受注の集計（{today.isoformat()}）", "", f"受注 {len(rows)} 件"]
    by = {}
    for r in rows:
        by.setdefault(r["product"], []).append(r)
    L += [f"- {LABEL.get(k, k)}：{len(v)} 件" for k, v in by.items()]
    gross = sum(int(r["price"]) + (int(r.get("extension_price") or 0) if r.get("extended") in ("1", 1) else 0) for r in rows)
    net = sum(_net(r) for r in rows)
    L += ["", f"売上（延長を含む）{gross:,}円　手数料を引いた手取り {net:,}円（確定の時期は販売先による。納品前の分も含む）"]
    months = {}
    for r in rows:
        months[r["date"][:7]] = months.get(r["date"][:7], 0) + _net(r)
    L += ["受付月ごとの手取り：" + "、".join(f"{m} {v:,}円" for m, v in sorted(months.items())), f"月の目標 {target:,}円に対して、直近の受付月 {months[max(months)]:,}円"]
    done = [r for r in rows if r.get("delivered")]
    if done:
        days = [(_d(r["delivered"]) - _d(r["date"])).days for r in done]
        L += ["", f"納品済み {len(done)} 件。受付から納品までの日数：平均 {sum(days) / len(days):.0f}日（最長 {max(days)}日）"]
    mins = [int(r["minutes"]) for r in rows if r.get("minutes")]
    if mins:
        L += [f"1件の作業時間：平均 {sum(mins) / len(mins):.0f}分（記録のある {len(mins)} 件。見込みは30分）"]
    std = [r for r in rows if r["product"] == "standard"]
    if std:
        ext = sum(1 for r in std if r.get("extended") in ("1", 1))
        L += [f"標準のうち56日に延長した人：{ext} / {len(std)} 件"]
    due = []
    for r in done:
        limit = _d(r["delivered"]) + dt.timedelta(days=KEEP_DAYS)
        left = (limit - today).days
        if left <= 14:
            due.append((limit, r["id"], left))
    if due:
        L += ["", "お預かりした記録の削除（納品の90日後）。期限が近い・過ぎているもの："]
        L += [f"- {cid}：{limit.isoformat()}（{'あと' + str(left) + '日' if left >= 0 else str(-left) + '日過ぎている'}）" for limit, cid, left in sorted(due)]
    open_ = [r["id"] for r in rows if not r.get("delivered")]
    if open_:
        L += ["", "未納品：" + "、".join(open_)]
    return "\n".join(L) + "\n"
