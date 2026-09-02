'use client';

import { useMemo, useState } from 'react';
import {
  VECTOR_FIELDS, WAVEFORMS, COMPLEX_MAPS, TAYLOR_TARGETS,
  fourierPartialSum, fourierError, mapGrid, eigen2x2, mapUnitCircle, taylorPartialSum,
} from '@/lib/physics/mathviz';
import { Card, SectionTitle, Button, Badge } from '@/components/physics/ui';
import VectorFieldView from '@/components/physics/VectorFieldView';
import Plot from '@/components/physics/Plot';
import Tex from '@/components/physics/Tex';

const SECTIONS = [
  { id: 'field', label: 'ベクトル場', hint: 'div と rot を目で見る' },
  { id: 'fourier', label: 'フーリエ級数', hint: '波は正弦波の足し算' },
  { id: 'complex', label: '複素写像', hint: '関数は平面の変形' },
  { id: 'eigen', label: '固有ベクトル', hint: '向きの変わらない方向' },
  { id: 'taylor', label: 'テイラー展開', hint: '近似が効く範囲' },
];

export default function MathLab() {
  const [section, setSection] = useState('field');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">物理数学ビジュアライザ</h1>
        <p className="text-[12px] text-qmute mt-1 leading-relaxed max-w-2xl">
          物理数学でつまずくのは、たいてい記号の操作ではなく「その式が何をしている絵なのか」が浮かばないときです。
          ここでは発散・回転・フーリエ級数・複素写像・固有ベクトル・テイラー展開を、動かして絵として掴みます。
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            title={s.hint}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border transition-colors ${
              section === s.id ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'field' && <FieldSection />}
      {section === 'fourier' && <FourierSection />}
      {section === 'complex' && <ComplexSection />}
      {section === 'eigen' && <EigenSection />}
      {section === 'taylor' && <TaylorSection />}
    </div>
  );
}

/* ── 発散と回転 ───────────────────────────────── */
function FieldSection() {
  const [key, setKey] = useState('radial');
  const [overlay, setOverlay] = useState('div');
  const [radius, setRadius] = useState(1);
  const field = VECTOR_FIELDS[key];
  const isCoulomb = key === 'coulomb2d';

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle sub="矢印が場、背景の色が発散または回転（青が正、桃が負）">ベクトル場</SectionTitle>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(VECTOR_FIELDS).map(([k, f]) => (
            <button
              key={k}
              onClick={() => setKey(k)}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] border transition-colors ${
                key === k ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {[['div', '発散 ∇·F'], ['curl', '回転 ∇×F'], ['none', '矢印だけ']].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setOverlay(k)}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] border transition-colors ${
                overlay === k ? 'bg-photon/15 text-photon border-photon/40' : 'bg-panel border-edge text-qmute hover:border-photon/40'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-5 items-start">
          <VectorFieldView field={field} overlay={overlay} showFlux={isCoulomb} fluxRadius={radius} />
          <div className="space-y-3">
            <div className="rounded-xl bg-vacuum/60 border border-edge/60 px-3 py-2.5 overflow-x-auto">
              <Tex display>{field.tex}</Tex>
            </div>
            <div className="flex gap-4 text-[12px]">
              <span className="text-qmute">∇·F = <span className="text-qink tabular-nums">{field.div()}</span></span>
              <span className="text-qmute">∇×F = <span className="text-qink tabular-nums">{field.curl()}</span></span>
            </div>
            <p className="text-[12px] text-qmute leading-relaxed">{field.note}</p>

            {isCoulomb && (
              <div className="rounded-xl border border-amberq/30 bg-amberq/5 p-3 space-y-2">
                <p className="text-[11px] text-amberq">Gaussの法則を確かめる</p>
                <label className="block">
                  <span className="text-[11px] text-qmute">
                    黄色い円の半径 R = <span className="text-qink tabular-nums">{radius.toFixed(2)}</span>
                  </span>
                  <input type="range" className="phys-range w-full mt-1" min={0.3} max={1.9} step={0.05}
                    value={radius} onChange={(e) => setRadius(parseFloat(e.target.value))} />
                </label>
                <p className="text-[11.5px] text-qmute leading-relaxed">
                  この円を通って外へ出る流束は <Tex>{'\\oint \\mathbf{F}\\cdot \\hat{\\mathbf n}\\,d\\ell = 2\\pi'}</Tex> で、
                  半径を変えても変わりません。場は遠ざかるほど弱まりますが、円周が同じだけ長くなるからです。
                  それでいて原点以外では発散がゼロ——この「どこにも湧き出しがないのに全体では湧き出している」矛盾の置き場所が、
                  原点のデルタ関数です。
                </p>
              </div>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle>読み取り方</SectionTitle>
        <ul className="text-[12px] text-qmute space-y-2 leading-relaxed">
          <li>· <span className="text-qink">発散</span>は「その一点から湧き出す量」。小さな円を描いて、入ってくる矢印より出ていく矢印が多ければ正です。</li>
          <li>· <span className="text-qink">回転</span>は「その一点に置いた小さな羽根車の回り方」。せん断流を選ぶと、まっすぐ流れているのに回転がゼロでないことが見えます——見た目の渦とは別物です。</li>
          <li>· 発散が電荷（Gaussの法則）、回転が電流（Ampèreの法則）に対応します。Maxwell方程式が4本とも「この2つのどちらか」を述べている、と気づけば見通しがよくなります。</li>
        </ul>
      </Card>
    </div>
  );
}

/* ── フーリエ級数 ─────────────────────────────── */
function FourierSection() {
  const [key, setKey] = useState('square');
  const [N, setN] = useState(5);
  const w = WAVEFORMS[key];

  const series = useMemo(() => {
    const pts = 500;
    const exact = [];
    const approx = [];
    for (let i = 0; i <= pts; i++) {
      const x = -Math.PI + (2 * Math.PI * i) / pts;
      exact.push([x, w.exact(x)]);
      approx.push([x, fourierPartialSum(w, x, N)]);
    }
    return [
      { points: exact, color: '#8b93b8', width: 1.4, dash: '4 3' },
      { points: approx, color: '#7c8cff', width: 2 },
    ];
  }, [w, N]);

  const errors = useMemo(
    () => [1, 3, 5, 9, 15, 25, 49].map((n) => ({ n, e: fourierError(w, n) })),
    [w]
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle sub="点線が元の波、実線が第N項までの足し算">フーリエ級数の部分和</SectionTitle>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(WAVEFORMS).map(([k, f]) => (
            <button key={k} onClick={() => setKey(k)}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] border transition-colors ${
                key === k ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
              }`}>{f.label}</button>
          ))}
        </div>
        <Plot series={series} xDomain={[-Math.PI, Math.PI]} yDomain={[-1.45, 1.45]} height={230} xLabel="x" />
        <label className="block mt-3">
          <span className="text-[11.5px] text-qmute">
            項数 N = <span className="text-qink tabular-nums">{N}</span>
            　二乗平均誤差 <span className="text-photon tabular-nums">{fourierError(w, N).toFixed(4)}</span>
          </span>
          <input type="range" className="phys-range w-full mt-1.5" min={1} max={60} step={1}
            value={N} onChange={(e) => setN(parseInt(e.target.value, 10))} />
        </label>
        <div className="rounded-xl bg-vacuum/60 border border-edge/60 px-3 py-2.5 mt-3 overflow-x-auto">
          <Tex display>{`${w.tex}\\ \\approx\\ \\sum_{n=1}^{N} b_n\\sin nx`}</Tex>
        </div>
        <p className="text-[12px] text-qmute mt-2 leading-relaxed">{w.note}</p>
      </Card>

      <Card className="p-4">
        <SectionTitle sub="滑らかな波ほど少ない項で足りる">項数と誤差</SectionTitle>
        <div className="space-y-1.5">
          {errors.map((e) => (
            <div key={e.n} className="flex items-center gap-2">
              <span className="text-[11px] text-qmute w-14 tabular-nums">N = {e.n}</span>
              <div className="flex-1 h-3 rounded bg-edge/50 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-quantum to-violetq"
                  style={{ width: `${Math.min(100, (e.e / errors[0].e) * 100)}%` }} />
              </div>
              <span className="text-[11px] tabular-nums w-16 text-right">{e.e.toFixed(4)}</span>
            </div>
          ))}
        </div>
        <p className="text-[12px] text-qmute mt-3 leading-relaxed">
          係数の落ち方は元の関数の滑らかさで決まります。跳びがあると <Tex>{'1/n'}</Tex>、折れ曲がりだと <Tex>{'1/n^2'}</Tex>、
          何度でも微分できるなら指数的に落ちます。量子力学で波動関数の連続性・微分可能性にこだわるのは、
          ここが効くからです。
        </p>
      </Card>
    </div>
  );
}

/* ── 複素写像 ─────────────────────────────────── */
function ComplexSection() {
  const [key, setKey] = useState('square');
  const map = COMPLEX_MAPS[key];
  const SIZE = 380;
  const EXT = 2.6;

  const paths = useMemo(() => mapGrid(map.fn, { lines: 11, points: 90, extent: 1.5 }), [map]);
  const toS = (x, y) => [((x + EXT) / (2 * EXT)) * SIZE, ((EXT - y) / (2 * EXT)) * SIZE];
  const d = (pts) => 'M ' + pts.map(([x, y]) => toS(x, y).map((n) => n.toFixed(1)).join(' ')).join(' L ');

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle sub="もとの平面の直交格子が、写像でどう曲がるか">複素関数は平面の変形</SectionTitle>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(COMPLEX_MAPS).map(([k, f]) => (
            <button key={k} onClick={() => setKey(k)}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] font-mono border transition-colors ${
                key === k ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
              }`}>{f.label}</button>
          ))}
        </div>
        <div className="grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-5 items-start">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-auto max-w-[380px] mx-auto block">
            <rect width={SIZE} height={SIZE} fill="#0b0e18" rx="10" />
            {paths.map((p, i) => (
              <path key={i} d={d(p.pts)} fill="none"
                stroke={p.kind === 'h' ? '#7c8cff' : '#4fd1c5'} strokeWidth="1" opacity="0.75" />
            ))}
            <circle cx={SIZE / 2} cy={SIZE / 2} r="3" fill="#f472b6" />
            <text x={SIZE / 2 + 7} y={SIZE / 2 + 4} fontSize="9.5" fill="#f472b6">0</text>
          </svg>
          <div className="space-y-3">
            <div className="rounded-xl bg-vacuum/60 border border-edge/60 px-3 py-2.5 overflow-x-auto">
              <Tex display>{map.tex}</Tex>
            </div>
            <p className="text-[12px] text-qmute leading-relaxed">{map.note}</p>
            <p className="text-[12px] text-qmute leading-relaxed">
              青が元の横線、水色が元の縦線です。正則関数では、交点での直角が写像後も直角のまま保たれます（等角写像）。
              直角が崩れる点は微分がゼロになる点で、そこだけ特別扱いが要ります。
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle>なぜ物理で複素関数を使うのか</SectionTitle>
        <ul className="text-[12px] text-qmute space-y-2 leading-relaxed">
          <li>· 実軸上の積分が、複素平面を回る積分に化けて計算できる（留数定理）。散乱振幅やGreen関数はこれで求まります。</li>
          <li>· 応答関数が上半平面で正則であること＝<span className="text-qink">因果律</span>。ここからKramers–Kronig関係が出ます。</li>
          <li>· 極の位置が寿命や共鳴幅を表します。「複素平面のどこに極があるか」で物理が読めます。</li>
        </ul>
      </Card>
    </div>
  );
}

/* ── 固有ベクトル ─────────────────────────────── */
function EigenSection() {
  const [m, setM] = useState({ a: 1.6, b: 0.6, c: 0.4, d: 1.1 });
  const e = eigen2x2(m.a, m.b, m.c, m.d);
  const SIZE = 380;
  const EXT = 3;
  const toS = (x, y) => [((x + EXT) / (2 * EXT)) * SIZE, ((EXT - y) / (2 * EXT)) * SIZE];
  const ellipse = useMemo(() => mapUnitCircle(m.a, m.b, m.c, m.d), [m]);
  const circle = useMemo(() => mapUnitCircle(1, 0, 0, 1), []);
  const d = (pts) => 'M ' + pts.map(([x, y]) => toS(x, y).map((n) => n.toFixed(1)).join(' ')).join(' L ');

  const set = (k) => (ev) => setM((p) => ({ ...p, [k]: parseFloat(ev.target.value) }));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle sub="単位円（点線）が行列でどんな楕円に写るか。黄色が固有方向">固有値問題は「向きの変わらない方向探し」</SectionTitle>
        <div className="grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] gap-5 items-start">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full h-auto max-w-[380px] mx-auto block">
            <rect width={SIZE} height={SIZE} fill="#0b0e18" rx="10" />
            <line x1={0} y1={SIZE / 2} x2={SIZE} y2={SIZE / 2} stroke="#1c2236" />
            <line x1={SIZE / 2} y1={0} x2={SIZE / 2} y2={SIZE} stroke="#1c2236" />
            <path d={d(circle)} fill="none" stroke="#4a5378" strokeWidth="1.2" strokeDasharray="4 3" />
            <path d={d(ellipse)} fill="rgba(124,140,255,0.10)" stroke="#7c8cff" strokeWidth="1.8" />
            {e.real && e.vectors.map((v, i) => {
              const l = e.values[i];
              const [x1, y1] = toS(-v[0] * 2.6, -v[1] * 2.6);
              const [x2, y2] = toS(v[0] * 2.6, v[1] * 2.6);
              const [tx, ty] = toS(v[0] * l, v[1] * l);
              const [ux, uy] = toS(v[0], v[1]);
              return (
                <g key={i}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fbbf24" strokeWidth="1" strokeDasharray="3 3" opacity="0.55" />
                  <line x1={SIZE / 2} y1={SIZE / 2} x2={ux} y2={uy} stroke="#fbbf24" strokeWidth="2" />
                  <line x1={SIZE / 2} y1={SIZE / 2} x2={tx} y2={ty} stroke="#f472b6" strokeWidth="2" />
                  <circle cx={tx} cy={ty} r="3.5" fill="#f472b6" />
                </g>
              );
            })}
          </svg>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {[['a', 'a（左上）'], ['b', 'b（右上）'], ['c', 'c（左下）'], ['d', 'd（右下）']].map(([k, label]) => (
                <label key={k} className="block">
                  <span className="text-[11px] text-qmute">{label} = <span className="text-qink tabular-nums">{m[k].toFixed(2)}</span></span>
                  <input type="range" className="phys-range w-full mt-1" min={-2} max={2} step={0.05} value={m[k]} onChange={set(k)} />
                </label>
              ))}
            </div>
            <div className="rounded-xl bg-vacuum/60 border border-edge/60 px-3 py-2.5 overflow-x-auto">
              <Tex display>{`A=\\begin{pmatrix}${m.a.toFixed(2)} & ${m.b.toFixed(2)}\\\\ ${m.c.toFixed(2)} & ${m.d.toFixed(2)}\\end{pmatrix}`}</Tex>
            </div>
            <div className="text-[12px] text-qmute space-y-1">
              <p>トレース <span className="text-qink tabular-nums">{e.trace.toFixed(3)}</span>（＝固有値の和）　行列式 <span className="text-qink tabular-nums">{e.det.toFixed(3)}</span>（＝固有値の積、面積の倍率）</p>
              {e.real ? (
                <>
                  <p>固有値 λ₁ = <span className="text-amberq tabular-nums">{e.values[0].toFixed(3)}</span>、λ₂ = <span className="text-amberq tabular-nums">{e.values[1].toFixed(3)}</span></p>
                  <p className="text-[11.5px]">黄色い矢印が固有ベクトル、桃色がそれを写した先。<span className="text-qink">向きが変わらず長さだけ λ 倍</span>になっています。</p>
                </>
              ) : (
                <>
                  <p>固有値は複素数 <span className="text-plasma tabular-nums">{e.values[0].re.toFixed(3)} ± {Math.abs(e.values[0].im).toFixed(3)}i</span></p>
                  <p className="text-[11.5px]">実の固有方向がありません。この行列は「回転を含む」ため、どの向きも必ず回されてしまいます。</p>
                </>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle>物理でこれが出てくる場所</SectionTitle>
        <ul className="text-[12px] text-qmute space-y-2 leading-relaxed">
          <li>· <span className="text-qink">基準振動</span>：連成振動子で「全体が同じ振動数で揺れる形」が固有ベクトル、振動数の2乗が固有値。</li>
          <li>· <span className="text-qink">量子状態</span>：ハミルトニアンの固有ベクトルが定常状態、固有値がエネルギー。時間が経っても形が変わらない状態です。</li>
          <li>· <span className="text-qink">慣性テンソル</span>：固有ベクトルが主軸。その向きで回せば、コマはふらつきません。</li>
          <li>· エルミート行列（実対称行列）なら固有値は必ず実数で、固有ベクトルは直交します。観測値が実数であることの数学的な保証がこれです。</li>
        </ul>
      </Card>
    </div>
  );
}

/* ── テイラー展開 ─────────────────────────────── */
function TaylorSection() {
  const [key, setKey] = useState('sin');
  const [N, setN] = useState(3);
  const t = TAYLOR_TARGETS[key];
  const range = t.radius === Infinity ? 7 : 2;

  const series = useMemo(() => {
    const pts = 400;
    const exact = [];
    const approx = [];
    for (let i = 0; i <= pts; i++) {
      const x = -range + (2 * range * i) / pts;
      const ye = t.fn(x);
      if (Number.isFinite(ye) && Math.abs(ye) < 50) exact.push([x, ye]);
      const ya = taylorPartialSum(t, x, N);
      if (Number.isFinite(ya) && Math.abs(ya) < 50) approx.push([x, ya]);
    }
    return [
      { points: exact, color: '#8b93b8', width: 1.6, dash: '4 3' },
      { points: approx, color: '#7c8cff', width: 2 },
    ];
  }, [t, N, range]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle sub="点線が本物、実線が N 次までの多項式">近似が効く範囲を見る</SectionTitle>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(TAYLOR_TARGETS).map(([k, f]) => (
            <button key={k} onClick={() => setKey(k)}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] border transition-colors ${
                key === k ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
              }`}>{f.label}</button>
          ))}
        </div>
        <Plot
          series={series}
          xDomain={[-range, range]}
          yDomain={key === 'geom' || key === 'log' ? [-4, 4] : [-2.5, 4]}
          height={230}
          xLabel="x"
          vlines={t.radius === Infinity ? [] : [{ x: -t.radius }, { x: t.radius }]}
        />
        <label className="block mt-3">
          <span className="text-[11.5px] text-qmute">次数 N = <span className="text-qink tabular-nums">{N}</span></span>
          <input type="range" className="phys-range w-full mt-1.5" min={0} max={20} step={1}
            value={N} onChange={(e) => setN(parseInt(e.target.value, 10))} />
        </label>
        <p className="text-[12px] text-qmute mt-2 leading-relaxed">
          {t.note}
          {t.radius !== Infinity && '（桃色の縦線が収束半径。その外側では次数を上げるほど発散します）'}
        </p>
      </Card>

      <Card className="p-4">
        <SectionTitle>物理での使われ方</SectionTitle>
        <ul className="text-[12px] text-qmute space-y-2 leading-relaxed">
          <li>· <Tex>{'\\sin\\theta\\approx\\theta'}</Tex>：振り子が単振動になるのは1次で切ったから。振幅が大きいと等時性が崩れるのは、切り捨てた3次項のせいです。</li>
          <li>· <Tex>{'\\gamma=(1-v^2/c^2)^{-1/2}\\approx 1+\\tfrac12 v^2/c^2'}</Tex>：相対論的エネルギーの展開から、静止エネルギーと古典的な運動エネルギーが出てきます。</li>
          <li>· ポテンシャルの底を2次まで展開すると、必ず調和振動子になります。世界が振動子だらけなのはこのためです。</li>
          <li>· 摂動論は「小さいパラメータでのテイラー展開」。収束半径があるということは、<span className="text-qink">摂動が効かない領域が必ずある</span>ということでもあります。</li>
        </ul>
      </Card>
    </div>
  );
}
