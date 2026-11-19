# 実際の記録：メラトニンの1人実験（70日）

R パッケージ [nof1kit](https://github.com/cran/nof1kit)（MIT ライセンス、Copyright 2026 Miura Meng）に同梱されている、
実際に行われた70日の1人実験の記録。メラトニンを飲む夜・飲まない夜を毎晩ランダムに決め（同じ条件は2日まで）、
1日3回、気分（0〜100）などを記録している。

- `melatonin_ema.csv`：記録（`inst/extdata/melatonin_ema.csv`、MD5 3ddda182ffaf1a21bdfcc5348fffc644）
- `melatonin_schedule.json`：割り付け（`inst/extdata/melatonin_schedule.json`、MD5 8c8b9c26e97d96f009157d2946c33666）

このエンジンでは、偽データでは分からない「実際の人の記録にモデルが合うか」を確かめるのに使う（`scripts/realdata.py`）。

## ライセンス（nof1kit の LICENSE：MIT、YEAR 2026、COPYRIGHT HOLDER Miura Meng）

MIT License

Copyright (c) 2026 Miura Meng

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
