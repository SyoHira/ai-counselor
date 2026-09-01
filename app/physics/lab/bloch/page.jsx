'use client';

import { useState } from 'react';
import {
  QUBIT_GATES, applyGate, amplitudeDamping, phaseDamping, depolarize,
  BASES, measureProbs, measure, purity, vonNeumannEntropy, stateDescription,
} from '@/lib/quantum/qubit1';
import { Card, SectionTitle, Button, Badge } from '@/components/physics/ui';
import BlochSphere from '@/components/physics/BlochSphere';
import Tex from '@/components/physics/Tex';

const INIT = { x: 0, y: 0, z: 1 };
const ANGLES = [
  { label: 'π/8', v: Math.PI / 8 }, { label: 'π/4', v: Math.PI / 4 },
  { label: 'π/2', v: Math.PI / 2 }, { label: 'π', v: Math.PI },
];

export default function BlochLab() {
  const [state, setState] = useState(INIT);
  const [trail, setTrail] = useState([INIT]);
  const [history, setHistory] = useState([]);
  const [param, setParam] = useState(Math.PI / 2);
  const [basis, setBasis] = useState('Z');
  const [tally, setTally] = useState({ 0: 0, 1: 0 });

  const push = (next, label) => {
    setState(next);
    setTrail((t) => [...t.slice(-160), next]);
    setHistory((h) => [...h, label].slice(-40));
  };

  const gate = (name) => push(applyGate(state, name, param), QUBIT_GATES[name].param ? `${name}(${(param / Math.PI).toFixed(2)}π)` : name);
  const noise = (fn, label, amount) => push(fn(state, amount), label);

  const reset = () => {
    setState(INIT);
    setTrail([INIT]);
    setHistory([]);
    setTally({ 0: 0, 1: 0 });
  };

  const doMeasure = () => {
    const { outcome, state: collapsed } = measure(state, BASES[basis].axis);
    setTally((t) => ({ ...t, [outcome]: t[outcome] + 1 }));
    push(collapsed, `測定(${basis})→${BASES[basis].kets[outcome]}`);
  };

  const desc = stateDescription(state);
  const probs = measureProbs(state, BASES[basis].axis);
  const pur = purity(state);
  const S = vonNeumannEntropy(state);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">Bloch球ラボ</h1>
        <p className="text-[12px] text-qmute mt-1 leading-relaxed">
          1量子ビットを密度行列 <Tex>{'\\rho=\\tfrac12(I+\\mathbf r\\cdot\\boldsymbol\\sigma)'}</Tex> として扱います。
          ユニタリゲートは球面上の回転、ノイズはベクトルの縮み、測定は軸への飛び移りです。
        </p>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4">
        <Card className="p-4 flex flex-col items-center justify-center">
          <BlochSphere vector={state} size={280} trail={trail} />
          <div className="text-center mt-1 space-y-1">
            <p className="font-mono text-[11.5px] text-photon">
              r = ({fmt(state.x)}, {fmt(state.y)}, {fmt(state.z)})
            </p>
            <p className="text-[11px] text-qmute">
              |r| = <span className="text-qink tabular-nums">{desc.len.toFixed(4)}</span>
              　θ = <span className="text-qink tabular-nums">{(desc.theta / Math.PI).toFixed(3)}π</span>
              　φ = <span className="text-qink tabular-nums">{(desc.phi / Math.PI).toFixed(3)}π</span>
            </p>
            <p className="text-[11px] text-qmute">
              純度 Tr ρ² = <span className="text-qink tabular-nums">{pur.toFixed(4)}</span>
              　S = <span className="text-photon tabular-nums">{S.toFixed(4)}</span> bit
              {desc.pure ? <Badge tone="quantum" className="ml-2">純粋状態</Badge> : <Badge tone="plasma" className="ml-2">混合状態</Badge>}
            </p>
            {desc.pure && <p className="font-mono text-[11px] text-qmute">|ψ⟩ = {desc.ket}</p>}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <SectionTitle sub="球面上の回転として作用します">ゲート</SectionTitle>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {['X', 'Y', 'Z', 'H', 'S', 'T'].map((g) => (
                <button
                  key={g}
                  onClick={() => gate(g)}
                  title={QUBIT_GATES[g].desc}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-mono bg-panel border border-edge text-qink hover:border-quantum/60 hover:text-quantum transition-colors"
                >
                  {QUBIT_GATES[g].label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 items-center">
              {['RX', 'RY', 'RZ'].map((g) => (
                <button
                  key={g}
                  onClick={() => gate(g)}
                  title={QUBIT_GATES[g].desc}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-mono bg-panel border border-edge text-qink hover:border-quantum/60 hover:text-quantum transition-colors"
                >
                  {QUBIT_GATES[g].label}
                </button>
              ))}
              <span className="text-[11px] text-qmute ml-1">θ =</span>
              {ANGLES.map((a) => (
                <button
                  key={a.label}
                  onClick={() => setParam(a.v)}
                  className={`px-2 py-0.5 rounded-md text-[11px] border transition-colors ${
                    Math.abs(param - a.v) < 1e-9 ? 'bg-photon/15 text-photon border-photon/40' : 'bg-panel border-edge text-qmute hover:border-photon/40'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <SectionTitle sub="環境との相互作用でBlochベクトルが球の内側へ縮む">ノイズ（開放系）</SectionTitle>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="ghost" onClick={() => noise(amplitudeDamping, 'T1減衰 20%', 0.2)}>振幅減衰 γ=0.2</Button>
              <Button variant="ghost" onClick={() => noise(phaseDamping, '位相緩和 30%', 0.3)}>位相緩和 λ=0.3</Button>
              <Button variant="ghost" onClick={() => noise(depolarize, '脱分極 20%', 0.2)}>脱分極 p=0.2</Button>
            </div>
            <p className="text-[11px] text-qmute mt-2.5 leading-relaxed">
              振幅減衰は |1⟩→|0⟩ のエネルギー緩和（T₁）、位相緩和は横成分だけを壊す純デコヒーレンス（T₂）。
              位相緩和を繰り返すと <Tex>{'|+\\rangle'}</Tex> は完全混合に近づき、干渉能力を失います。
            </p>
          </Card>

          <Card className="p-4">
            <SectionTitle sub="測定は基底の選択で結果が変わる">測定</SectionTitle>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Object.entries(BASES).map(([k, b]) => (
                <button
                  key={k}
                  onClick={() => setBasis(k)}
                  className={`px-2.5 py-1 rounded-lg text-[11.5px] border transition-colors ${
                    basis === k ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <div className="space-y-1.5 mb-3">
              {BASES[basis].kets.map((ket, i) => (
                <div key={ket} className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-qmute w-12">|{ket}⟩</span>
                  <div className="flex-1 h-3.5 rounded bg-edge/50 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-quantum to-violetq transition-[width] duration-300" style={{ width: `${probs[i] * 100}%` }} />
                  </div>
                  <span className="text-[11px] tabular-nums w-14 text-right">{(probs[i] * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={doMeasure}>1回測定して収縮させる</Button>
              <span className="text-[11px] text-qmute tabular-nums">
                実測 {BASES[basis].kets[0]}:{tally[0]} / {BASES[basis].kets[1]}:{tally[1]}
              </span>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-qmute break-all leading-relaxed flex-1">
                {history.length ? history.join(' → ') : '操作履歴はまだありません'}
              </p>
              <Button variant="ghost" onClick={reset} className="shrink-0">リセット</Button>
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-4">
        <SectionTitle>読み取り方</SectionTitle>
        <ul className="text-[12px] text-qmute space-y-2 leading-relaxed">
          <li>· 球<span className="text-qink">面上</span>＝純粋状態。球の<span className="text-qink">内部</span>＝混合状態で、中心は完全混合 <Tex>{'\\rho=I/2'}</Tex>。</li>
          <li>· ユニタリゲートは |r| を変えません。|r| が縮むのは環境と情報が漏れたときだけです。</li>
          <li>· 測定確率は <Tex>{'p_\\pm=\\tfrac12(1\\pm \\mathbf n\\cdot\\mathbf r)'}</Tex>。測定軸 <Tex>{'\\mathbf n'}</Tex> に垂直な状態はどちらも50%になります。</li>
          <li>· H を掛けてから Z 基底で測ると、実質的に X 基底の測定になります（基底変換と測定の等価性）。</li>
        </ul>
      </Card>
    </div>
  );
}

function fmt(v) {
  return (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3);
}
