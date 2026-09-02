'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { gaussianPacket, makePropagator, step as evolveStep, probabilityIn, positionStats } from '@/lib/quantum/evolution';
import { barrierTransmission } from '@/lib/quantum/schrodinger';
import { Card, SectionTitle, Button, Badge } from '@/components/physics/ui';
import Plot from '@/components/physics/Plot';
import Tex from '@/components/physics/Tex';

const N = 2048;
const PLOT_STRIDE = 3; // 描画は間引く（物理計算は全格子点で行う）
const L = 100;
const DT = 0.01;
const STEPS_PER_FRAME = 10;
const X0 = -22;

function makeX() {
  const x = new Float64Array(N);
  for (let i = 0; i < N; i++) x[i] = -L / 2 + (L * i) / N;
  return x;
}

function makeV(x, V0, a) {
  const V = new Float64Array(N);
  for (let i = 0; i < N; i++) V[i] = Math.abs(x[i]) < a / 2 ? V0 : 0;
  return V;
}

export default function TunnelLab() {
  const [V0, setV0] = useState(5);
  const [a, setA] = useState(1.2);
  const [k0, setK0] = useState(2.6);
  const [sigma, setSigma] = useState(2.5);
  const [running, setRunning] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [tick, setTick] = useState(0);
  const [boundaryHit, setBoundaryHit] = useState(false);

  const xRef = useRef(makeX());
  const psiRef = useRef(null);
  const propRef = useRef(null);
  const timeRef = useRef(0);
  const rafRef = useRef(null);
  const boundaryHitRef = useRef(false);

  const E = (k0 * k0) / 2;
  // 周期境界に達する前に自動停止する。
  // 障壁到達までが |x0|/v、その後 反射波・透過波が箱の端に届くまでが (L/2 − 余裕)/v。
  const speed = Math.max(k0, 0.3);
  const tStop = Math.max(2, Math.min((Math.abs(X0) + L / 2 - 4 * sigma - 8) / speed, 160));
  const stopped = boundaryHit || (snapshot?.t ?? 0) >= tStop;

  const reset = useCallback(() => {
    const x = xRef.current;
    const V = makeV(x, V0, a);
    psiRef.current = gaussianPacket(x, { x0: X0, sigma, k0 });
    propRef.current = makePropagator(x, V, DT);
    timeRef.current = 0;
    setRunning(false);
    boundaryHitRef.current = false;
    setBoundaryHit(false);
    setTick((t) => t + 1);
  }, [V0, a, k0, sigma]);

  useEffect(() => { reset(); }, [reset]);

  // スナップショットを組み立てる
  const capture = useCallback(() => {
    const x = xRef.current;
    const { re, im } = psiRef.current;
    let maxD = 0;
    const plotX = [];
    const plotD = [];
    const plotRe = [];
    for (let i = 0; i < N; i++) {
      const d = re[i] * re[i] + im[i] * im[i];
      if (d > maxD) maxD = d;
      if (i % PLOT_STRIDE === 0) { plotX.push(x[i]); plotD.push(d); plotRe.push(re[i]); }
    }
    const R = probabilityIn(x, re, im, -L / 2, -a / 2);
    const T = probabilityIn(x, re, im, a / 2, L / 2);
    const inside = probabilityIn(x, re, im, -a / 2, a / 2);
    const stats = positionStats(x, re, im);
    // 周期境界からの回り込みを検知する（回り込むと透過率が過大評価される）。
    // 数値的な高波数成分による定常的な滲み（~2e-4）は無視し、本体の到達だけを拾う。
    const leak = probabilityIn(x, re, im, L / 2 - 3, L / 2) + probabilityIn(x, re, im, -L / 2, -L / 2 + 3);
    if (leak > 3e-3) { boundaryHitRef.current = true; setBoundaryHit(true); }
    setSnapshot({
      plotX, plotD, plotRe,
      maxD,
      R, T, inside,
      norm: stats.norm,
      mean: stats.mean,
      sigma: stats.sigma,
      t: timeRef.current,
    });
  }, [a]);

  useEffect(() => { if (psiRef.current) capture(); }, [tick, capture]);

  useEffect(() => {
    if (!running) return;
    const loop = () => {
      if (timeRef.current >= tStop || boundaryHitRef.current) { setRunning(false); return; }
      const { re, im } = psiRef.current;
      for (let s = 0; s < STEPS_PER_FRAME; s++) {
        evolveStep(re, im, propRef.current);
        timeRef.current += DT;
      }
      capture();
      if (timeRef.current >= tStop || boundaryHitRef.current) {
        setRunning(false);
        return;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running, capture, tStop]);

  const x = xRef.current;
  const analyticT = barrierTransmission(E, V0, a);
  const scaleV = snapshot ? (snapshot.maxD > 0 ? (0.8 * Math.max(snapshot.maxD, 0.02)) / Math.max(V0, 0.5) : 0.02) : 0.02;
  const yTop = snapshot ? Math.max(snapshot.maxD, 0.05) * 1.35 : 0.2;

  const reScale = snapshot ? Math.sqrt(Math.max(snapshot.maxD, 1e-6)) * 0.9 : 1;
  // 障壁は間引きの影響を受けないよう、折れ線として厳密に描く
  const barrierPoints = [
    [-L / 2, 0], [-a / 2, 0], [-a / 2, V0 * scaleV],
    [a / 2, V0 * scaleV], [a / 2, 0], [L / 2, 0],
  ];
  const series = snapshot
    ? [
        { points: barrierPoints, color: '#8b93b8', width: 1.4, fill: true, fillOpacity: 0.1 },
        {
          points: snapshot.plotX.map((xi, i) => [xi, snapshot.plotRe[i] * reScale]),
          color: '#4fd1c5', width: 1, opacity: 0.45,
        },
        {
          points: snapshot.plotX.map((xi, i) => [xi, snapshot.plotD[i]]),
          color: '#7c8cff', width: 1.8, fill: true, fillOpacity: 0.22,
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">波束トンネル</h1>
        <p className="text-[12px] text-qmute mt-1 leading-relaxed">
          ガウス波束を split-operator 法で時間発展させます
          （<Tex>{'U(\\delta t)\\approx e^{-iV\\delta t/2}\\,\\mathcal{F}^{-1}e^{-ik^2\\delta t/2}\\mathcal{F}\\,e^{-iV\\delta t/2}'}</Tex>、<Tex>{'\\hbar=m=1'}</Tex>）。
          障壁より低いエネルギーでも、確率の一部が向こう側に現れます。
        </p>
      </div>

      <Card className="p-4">
        <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3">
          <Slider label="障壁の高さ V₀" value={V0} min={0} max={20} step={0.5} onChange={setV0} />
          <Slider label="障壁の幅 a" value={a} min={0.2} max={5} step={0.1} onChange={setA} />
          <Slider label="波数 k₀（入射エネルギー）" value={k0} min={0.5} max={6} step={0.1} onChange={setK0} />
          <Slider label="波束の幅 σ" value={sigma} min={1} max={6} step={0.1} onChange={setSigma} />
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Button variant="primary" onClick={() => setRunning((r) => !r)} disabled={stopped}>
            {running ? '一時停止' : '実行'}
          </Button>
          <Button variant="ghost" onClick={reset}>初期状態に戻す</Button>
          {stopped && <span className="text-[11px] text-amberq">自動停止しました。再実行するには初期状態に戻してください。</span>}
          <span className="text-[11.5px] text-qmute ml-1">
            t = <span className="tabular-nums text-qink">{(snapshot?.t ?? 0).toFixed(2)}</span>
          </span>
          {boundaryHit && (
            <span className="text-[11px] text-amberq">波束が箱の端に到達したため停止しました（周期境界のため、これ以上は回り込みで値が壊れます）</span>
          )}
          <Badge tone={E < V0 ? 'plasma' : 'photon'} className="ml-auto">
            E = {E.toFixed(2)} {E < V0 ? '< V₀（古典的には透過不可）' : '≥ V₀（古典的にも透過可）'}
          </Badge>
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle sub="青＝確率密度 |ψ|²、水色＝Re ψ、灰＝ポテンシャル（縦軸は表示用にスケール）">
          波束の時間発展
        </SectionTitle>
        <Plot
          series={series}
          xDomain={[-L / 2, L / 2]}
          yDomain={[-yTop * 0.55, yTop]}
          height={240}
          xLabel="x"
          yLabel="|ψ|²"
          vlines={[{ x: -a / 2 }, { x: a / 2 }]}
        />
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionTitle sub="領域ごとに |ψ|² を積分した値">確率の内訳</SectionTitle>
          <div className="space-y-2">
            <Row label="反射側 (x < −a/2)" value={snapshot?.R ?? 0} color="#f472b6" />
            <Row label="障壁内 (|x| < a/2)" value={snapshot?.inside ?? 0} color="#fbbf24" />
            <Row label="透過側 (x > a/2)" value={snapshot?.T ?? 0} color="#4fd1c5" />
          </div>
          <div className="mt-3 pt-3 border-t border-edge/60 text-[11.5px] text-qmute space-y-1">
            <p>規格化 ∫|ψ|²dx = <span className="tabular-nums text-qink">{(snapshot?.norm ?? 1).toFixed(6)}</span>（確率保存の確認。空間・時間刻みや境界誤差の検証は別に必要です）</p>
            <p>⟨x⟩ = <span className="tabular-nums text-qink">{(snapshot?.mean ?? 0).toFixed(2)}</span>　Δx = <span className="tabular-nums text-qink">{(snapshot?.sigma ?? 0).toFixed(2)}</span></p>
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle sub="平面波（単一エネルギー）に対する厳密解との比較">解析解との照合</SectionTitle>
          <div className="space-y-2 text-[12px]">
            <p className="text-qmute">
              平面波の透過率　<span className="text-qink tabular-nums text-[13px]">{(analyticT * 100).toFixed(2)}%</span>
            </p>
            <p className="text-qmute">
              波束の実測透過率　<span className="text-photon tabular-nums text-[13px]">{((snapshot?.T ?? 0) * 100).toFixed(2)}%</span>
            </p>
          </div>
          <div className="mt-3 rounded-xl bg-vacuum/50 border border-edge/60 p-3">
            <Tex display>
              {E < V0
                ? 'T=\\left[1+\\frac{V_0^2\\sinh^2(\\kappa a)}{4E(V_0-E)}\\right]^{-1},\\ \\ \\kappa=\\sqrt{2m(V_0-E)}/\\hbar'
                : 'T=\\left[1+\\frac{V_0^2\\sin^2(k_2 a)}{4E(E-V_0)}\\right]^{-1},\\ \\ k_2=\\sqrt{2m(E-V_0)}/\\hbar'}
            </Tex>
          </div>
          <p className="text-[11px] text-qmute mt-2.5 leading-relaxed">
            波束は単一エネルギーではなく <Tex>{'\\Delta k\\sim 1/2\\sigma'}</Tex> の幅を持つため、両者は完全には一致しません。
            σ を大きくする（運動量幅を狭める）ほど平面波の値に近づきます。
          </p>
        </Card>
      </div>

      <Card className="p-4">
        <SectionTitle>試してみること</SectionTitle>
        <ul className="text-[12px] text-qmute space-y-2 leading-relaxed">
          <li>· 幅 a を 2倍にすると透過率がどれだけ落ちるか。<Tex>{'T\\sim e^{-2\\kappa a}'}</Tex> の指数依存性が効きます（走査型トンネル顕微鏡が原子分解能を持つ理由）。</li>
          <li>· E &gt; V₀ でも反射が残ること。<Tex>{'\\sin(k_2a)=0'}</Tex> となる特定のエネルギーでは透過率がちょうど1になります（共鳴透過）。引力の井戸で同じことが起きるのが、希ガス中の低速電子で観測されるRamsauer–Townsend効果です。</li>
          <li>· σ を小さくすると波束は速く広がります。位置を絞るほど運動量幅が広がるという不確定性関係の直接の帰結です。</li>
          <li>· 障壁内部の |ψ|² が指数的に減衰していること。エバネッセント波は「存在するが伝播しない」波です。</li>
        </ul>
      </Card>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }) {
  return (
    <label className="block">
      <span className="text-[11px] text-qmute">
        {label} = <span className="text-qink tabular-nums">{value.toFixed(1)}</span>
      </span>
      <input
        type="range" className="phys-range w-full mt-1"
        min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

function Row({ label, value, color }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11.5px] text-qmute w-40 shrink-0">{label}</span>
      <div className="flex-1 h-3.5 rounded bg-edge/50 overflow-hidden">
        <div className="h-full transition-[width] duration-150" style={{ width: `${Math.min(100, value * 100)}%`, background: color }} />
      </div>
      <span className="text-[11.5px] tabular-nums w-16 text-right">{(value * 100).toFixed(2)}%</span>
    </div>
  );
}
