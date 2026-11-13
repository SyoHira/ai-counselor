// 記録フォーム（index.html）のスクリプトの構文確認と、2成分の並び・期間の記号の整合の確認。CI で実行する。
//   node check.js
const fs = require("fs");
const html = fs.readFileSync(__dirname + "/index.html", "utf8");
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) throw new Error("script が見つかりません");
new Function(m[1]); // 構文だけ確認する（実行はしない）

// 2成分の並び：どの条件も2期間、A と B が無相関、平均位置がそろう（engine の design.make_factorial_schedule と同じ性質）
const seqs = m[1].match(/combo:\[([^\]]*)\]/)[1].split(",").map(x => x.replace(/"/g, "").trim());
if (seqs.length !== 4) throw new Error("combo の並びは4通り");
for (const s of seqs) {
  if (s.length !== 8) throw new Error("8期間: " + s);
  const pos = {0: [], 1: [], 2: [], 3: []};
  [...s].forEach((c, i) => pos[+c].push(i));
  for (const c of [0, 1, 2, 3]) {
    if (pos[c].length !== 2) throw new Error(`条件${c}は2期間: ${s}`);
    if (pos[c][0] + pos[c][1] !== 7) throw new Error(`条件${c}の平均位置がそろっていません: ${s}`);
  }
}
console.log("form: 構文と並びの確認に成功");
