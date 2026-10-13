# 05. 研究層と最新研究の取り込み方

## 研究層とは

顧客のレポートには使わず、自社の記録データで仮説を検証する場所。実装は [engine/n1engine/research/](../engine/n1engine/research/)。

## 量子認知の検証

| 状態 | 内容 |
|---|---|
| 実証された | 質問の順番で回答が変わる現象について、量子確率モデルが事前に数値まで予測した等式（QQ等式）が、全米規模の調査70件と実験2件で支持された（[Wang 他 2014, PNAS](https://www.semanticscholar.org/paper/Context-effects-produced-by-question-orders-reveal-Wang-Solloway/aaa6959e5761209f6caba7af9e2c6d916dcefb15)） |
| 反証された | 同じモデルの別の予測は多くのデータで成り立たず、最も単純な量子モデルは多くの場合使えない（[Boyer-Kassem 他 2016](https://thomasboyerkassem.yolasite.com/resources/Boyer-Kassem-et-al-(2016)-Quantum-models-question-order-effect.pdf)） |
| 未解決 | 同じ質問を繰り返すと同じ答えが返る現象との両立（[Khrennikov 他](https://arxiv.org/pdf/1508.03686)）。毎日同じ質問に答えてもらうこのサービスは、まさにこの状況にあたる |
| 未確定 | 従来の手法より予測が当たるか（[2025年の論文でも研究中](https://royalsocietypublishing.org/rsos/article/13/2/251534/480053/Quantum-cognition-and-the-contextual-dynamics-of-moral-judgement)） |
| 例がない | 体調や気分の自己評価に使った研究 |

毎日「はい／いいえ」の質問の組を、順番を入れ替えて聞いている。同意を得た複数人の記録が溜まれば、QQ等式が体調の記録でも成り立つかを検証できる。1人の28日では足りない。

成り立っても成り立たなくても、それ自体が新しい知見になる。どちらの結果も公開する。

## 本番への昇格基準

すべて満たすまで、顧客のレポートには使わない。

1. 査読付きの論文で発表されている
2. 当てはめではなく、事前に数値を予測し、それが外部で確かめられている
3. 自社データで、分析方法を事前に決めて固定した上で、従来の方法より予測が当たることを、学習に使っていないデータで示した
4. 結果の言い方が「効力」の表現にならない

## 量子コンピュータを使わない理由

量子計算でベイズ推定が速くなる研究は、データが巨大な場合の話で、[データが小さいほど優位は縮む](https://arxiv.org/html/2004.00026.pdf)。1人の記録は28〜56個程度の数字で、普通のパソコンで一瞬で計算できる。

## 最新研究の取り込み方

1. 決まった間隔で関連論文を確認する（1人実験の統計、思い込みの扱い、量子認知）
2. 取り入れるものは研究層で自社データに当てて確かめる
3. 本番に移すときは、エンジンの版番号を上げ、[engine/CHANGELOG.md](../engine/CHANGELOG.md) に「何を・なぜ・根拠」を書き、検証を再実行して [engine/CALIBRATION.md](../engine/CALIBRATION.md) を更新する
