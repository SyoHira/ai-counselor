'use client';

import Link from 'next/link';
import { Card, SectionTitle, Badge } from '@/components/physics/ui';
import { MODULES } from '@/lib/physics/curriculum';
import Tex from '@/components/physics/Tex';

const LABS = [
  {
    id: 'math',
    href: '/physics/lab/math',
    icon: '∫',
    title: '物理数学ビジュアライザ',
    lead: '発散・回転・フーリエ級数・複素写像・固有ベクトル・テイラー展開を、動かして絵として掴みます。記号の操作ではなく「その式が何をしている絵なのか」を先に持つための場所です。',
    can: ['ベクトル場の発散と回転を背景の色で見比べる', '項を増やすとフーリエ級数が波に近づく様子とGibbs現象', '複素写像で直交格子が歪んでも直角が保たれること（等角性）', '行列が単位円を楕円に変え、固有方向だけ向きが変わらないこと'],
    math: '\\nabla\\cdot\\mathbf{F},\\quad \\nabla\\times\\mathbf{F},\\quad f(x)=\\sum_n b_n\\sin nx,\\quad A\\mathbf{v}=\\lambda\\mathbf{v}',
  },
  {
    id: 'circuit',
    href: '/physics/lab/circuit',
    icon: '⊗',
    title: '量子回路シミュレータ',
    lead: '最大6量子ビットの状態ベクトルを厳密計算。ゲートを1つ置くごとに、確率分布・Blochベクトル・エンタングルメント・エントロピーがどう動くかを追えます。',
    can: ['Bell / GHZ / W 状態の生成と縮約状態の変化', 'Deutsch–Jozsa・Grover・QFT・テレポーテーションの実行', '途中測定を含むショットサンプリング'],
    math: '|\\psi\\rangle=\\sum_{x\\in\\{0,1\\}^n} c_x|x\\rangle',
  },
  {
    id: 'bloch',
    href: '/physics/lab/bloch',
    icon: '◉',
    title: 'Bloch球ラボ',
    lead: '1量子ビットを密度行列で扱います。純粋状態も混合状態も同じ球の中で表現され、ノイズによるベクトルの長さや向きの変化を観察できます。',
    can: ['ゲート＝回転という描像の定着', 'T₁緩和・T₂デコヒーレンス・脱分極の効果', '測定基底を変えると確率がどう変わるか'],
    math: '\\rho=\\tfrac{1}{2}\\left(I+\\mathbf{r}\\cdot\\boldsymbol{\\sigma}\\right)',
  },
  {
    id: 'well',
    href: '/physics/lab/well',
    icon: '∿',
    title: '固有状態ソルバ',
    lead: '6種類のポテンシャルについて、両端を無限壁とした有限区間のシュレーディンガー方程式を離散化し、固有状態を求めます。',
    can: ['調和振動子の等間隔スペクトルと無限井戸の n² 則の比較', '二重井戸のトンネル分裂（量子ビットの二準位系の起源）', 'Morse型の非調和性と解離しきい値'],
    math: '-\\frac{\\hbar^2}{2m}\\psi\'\' + V(x)\\psi = E\\psi',
  },
  {
    id: 'tunnel',
    href: '/physics/lab/tunnel',
    icon: '⇢',
    title: '波束トンネル',
    lead: 'ガウス波束の時間発展をリアルタイムに計算します。反射・透過・障壁内のエバネッセント波を、確率の積分値として実測できます。',
    can: ['透過率の指数依存性 T ~ e^(−2κa) の体感', 'E > V₀ でも起きる反射と共鳴透過', '波束の広がりと不確定性関係'],
    math: 'i\\hbar\\,\\partial_t\\psi = \\left[-\\frac{\\hbar^2}{2m}\\partial_x^2 + V(x)\\right]\\psi',
  },
];

export default function LabHub() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">量子ラボ</h1>
        <p className="text-[12px] text-qmute mt-1 leading-relaxed max-w-2xl">
          量子力学の難しさの多くは「式は追えるが何が起きているか像を結ばない」ことにあります。
          ここでは有限精度の数値計算を回して、状態がどう変わるかを直接観察します。
          すべてブラウザ内で計算しており、パラメータを変えれば即座に結果が変わります。
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {LABS.map((lab) => {
          const related = MODULES.filter((m) => (m.labs || []).includes(lab.id));
          return (
            <Card key={lab.id} className="p-5 flex flex-col min-w-0">
              <Link href={lab.href} className="group">
                <div className="flex items-center gap-3 mb-2.5">
                  <span className="w-10 h-10 rounded-xl bg-quantum/12 text-quantum flex items-center justify-center text-[18px] shrink-0">
                    {lab.icon}
                  </span>
                  <h2 className="text-[15px] font-semibold group-hover:text-quantum transition-colors">{lab.title}</h2>
                </div>
                <p className="text-[12px] text-qmute leading-relaxed">{lab.lead}</p>
              </Link>

              <div className="rounded-xl bg-vacuum/50 border border-edge/60 px-3 py-2 my-3 overflow-x-auto">
                <Tex display>{lab.math}</Tex>
              </div>

              <ul className="space-y-1.5 mb-3">
                {lab.can.map((c, i) => (
                  <li key={i} className="flex gap-2 text-[11.5px] text-qmute">
                    <span className="text-photon">·</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>

              {related.length > 0 && (
                <div className="mt-auto pt-3 border-t border-edge/50">
                  <p className="text-[10.5px] text-qmute/70 mb-1.5">関連する単元</p>
                  <div className="flex flex-wrap gap-1.5">
                    {related.slice(0, 5).map((m) => (
                      <Link
                        key={m.id}
                        href={`/physics/module/${m.id}`}
                        className="px-2 py-0.5 rounded-md bg-edge/40 text-qmute text-[10.5px] hover:text-quantum transition-colors"
                      >
                        {m.title}
                      </Link>
                    ))}
                    {related.length > 5 && <span className="text-[10.5px] text-qmute/60 px-1">他 {related.length - 5} 件</span>}
                  </div>
                </div>
              )}

              <Link
                href={lab.href}
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-quantum text-vacuum px-4 py-2 text-[12.5px] font-medium hover:bg-quantum/90 transition-colors"
              >
                開く
              </Link>
            </Card>
          );
        })}
      </div>

      <Card className="p-4">
        <SectionTitle sub="計算の中身を確認したい場合">実装について</SectionTitle>
        <ul className="text-[12px] text-qmute space-y-1.5 leading-relaxed">
          <li>· 回路シミュレータ：状態ベクトルを2本のFloat64Arrayで保持し、対象ビットのペアごとに2×2ユニタリを適用（<code className="text-photon font-mono text-[11px]">lib/quantum/statevector.js</code>）</li>
          <li>· 固有状態ソルバ：三重対角化した離散ハミルトニアンに implicit-shift QL 法（<code className="text-photon font-mono text-[11px]">lib/quantum/schrodinger.js</code>）</li>
          <li>· 波束発展：基数2 FFT による split-operator 法。規格化の保存が計算の健全性チェックになります（<code className="text-photon font-mono text-[11px]">lib/quantum/evolution.js</code>）</li>
        </ul>
      </Card>
    </div>
  );
}
