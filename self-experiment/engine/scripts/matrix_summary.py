"""verify_matrix.py が書いた result.json を集めて、1枚の表（Markdown）にする。CI の実行結果のページ用。

  python scripts/matrix_summary.py results   （results/<名前>/result.json を読む）
"""

from __future__ import annotations

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from verify_matrix import PAIRS, SCENARIOS, check  # noqa: E402


def main(root: str) -> None:
    cells = {}
    for f in sorted(pathlib.Path(root).glob("*/result.json")):
        for s in json.loads(f.read_text(encoding="utf-8")):
            cells[(s["pair"], s["scenario"])] = s
    print("## 複数の成分を掛け合わせた検証\n")
    print("答えの分かっている偽の記録（56日）を本番と同じ分析にかけた結果です。")
    print("幅の正しさは名目90%。誤報は、差が無い項目で「はっきり差がある」と言った割合。\n")
    print("| 成分の組 | 本当の差 | n | Aの幅 | Bの幅 | 上乗せの幅 | 誤報 / 見つけた（A・B・上乗せ） | 落ち着いた | 当てはまり | 判定 |")
    print("|---|---|---|---|---|---|---|---|---|---|")
    bad_all = []
    for pair in PAIRS:
        for sc in SCENARIOS:
            s = cells.get((pair, sc))
            if s is None:
                print(f"| {pair} | {sc} | - | - | - | - | 結果なし | - | - | ❌ |")
                bad_all.append(f"{pair}/{sc}: 結果なし")
                continue
            t = s["terms"]
            tail = " / ".join(
                f"{x['false_alarm']:.0%}" if "false_alarm" in x else f"{x['found_right_way']:.0%}" for x in (t["A"], t["B"], t["X"])
            )
            bad = check(s)
            bad_all += bad
            print(f"| {pair} | {sc} | {s['n']} | {t['A']['coverage']:.0%} | {t['B']['coverage']:.0%} | {t['X']['coverage']:.0%} | {tail} | {s['converged']:.0%} | {s['fit_ok']:.0%} | {'✅' if not bad else '❌'} |")
    if bad_all:
        print("\n### しきい値を満たしていない項目\n")
        for b in bad_all:
            print(f"- {b}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "results")
