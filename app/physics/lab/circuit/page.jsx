'use client';

import { useMemo, useState } from 'react';
import { GATES } from '@/lib/quantum/gates';
import { simulate, runShots, topBasis, ketString, emptyCircuit } from '@/lib/quantum/circuit';
import { mulberry32 } from '@/lib/quantum/statevector';
import { PRESETS, getPreset } from '@/lib/quantum/presets';
import { Card, SectionTitle, Button, Badge } from '@/components/physics/ui';
import CircuitDiagram from '@/components/physics/CircuitDiagram';
import BlochSphere from '@/components/physics/BlochSphere';
import ProbBars from '@/components/physics/ProbBars';
import Tex from '@/components/physics/Tex';

const SINGLE = ['H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg', 'SX'];
const ROT = ['RX', 'RY', 'RZ', 'P'];
const ANGLES = [
  { label: 'π/8', v: Math.PI / 8 }, { label: 'π/4', v: Math.PI / 4 },
  { label: 'π/2', v: Math.PI / 2 }, { label: '2π/3', v: (2 * Math.PI) / 3 },
  { label: 'π', v: Math.PI },
];

export default function CircuitLab() {
  const [circuit, setCircuit] = useState(() => ({ ...emptyCircuit(2), ops: getPreset('bell').circuit.ops }));
  const [presetId, setPresetId] = useState('bell');
  const [gate, setGate] = useState('H');
  const [target, setTarget] = useState(0);
  const [controls, setControls] = useState([]);
  const [param, setParam] = useState(Math.PI / 2);
  const [step, setStep] = useState(null);
  const [shots, setShots] = useState(null);

  const preset = PRESETS.find((p) => p.id === presetId);
  const sim = useMemo(() => simulate(circuit), [circuit]);
  const stepIdx = step === null ? circuit.ops.length - 1 : step;
  const view = sim.steps[stepIdx + 1] || sim.steps[0];

  const stateAtStep = useMemo(
    () => simulate({ n: circuit.n, ops: circuit.ops.slice(0, stepIdx + 1) }).state,
    [circuit, stepIdx]
  );

  const setN = (n) => {
    setCircuit({ n, ops: [] });
    setPresetId('');
    setControls([]);
    setTarget(0);
    setStep(null);
    setShots(null);
  };

  const loadPreset = (id) => {
    const p = getPreset(id);
    if (!p) return;
    setCircuit(p.circuit);
    setPresetId(id);
    setControls([]);
    setTarget(0);
    setStep(null);
    setShots(null);
  };

  const addOp = (kind) => {
    const clean = controls.filter((c) => c !== target && c < circuit.n);
    let op;
    if (kind === 'measure') op = { kind: 'measure', target };
    else if (kind === 'swap') {
      const other = clean[0] ?? (target + 1) % circuit.n;
      if (other === target) return;
      op = { kind: 'swap', target, target2: other, controls: clean.slice(1) };
    } else {
      op = { kind: 'gate', gate, target, controls: clean, ...(GATES[gate]?.param ? { param } : {}) };
    }
    setCircuit((c) => ({ ...c, ops: [...c.ops, op] }));
    setPresetId('');
    setStep(null);
    setShots(null);
  };

  const removeOp = (i) => {
    setCircuit((c) => ({ ...c, ops: c.ops.filter((_, k) => k !== i) }));
    setPresetId('');
    setStep(null);
    setShots(null);
  };

  const toggleControl = (q) => {
    setControls((cs) => (cs.includes(q) ? cs.filter((c) => c !== q) : [...cs, q]));
  };

  const doShots = () => {
    const rng = mulberry32(Date.now() & 0xffffffff);
    const { counts, shots: total, measured } = runShots(circuit, 1024, rng);
    const entries = Object.entries(counts)
      .map(([label, cnt]) => ({ label, p: cnt / total, count: cnt }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 10);
    setShots({ entries, measured, total });
  };

  const probEntries = topBasis(view.probabilities, circuit.n, 8);
  const totalEntropy = view.entropy.reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">量子回路シミュレータ</h1>
        <p className="text-[12px] text-qmute mt-1 leading-relaxed">
          状態ベクトルを厳密に計算します（最大6量子ビット＝64振幅）。
          ステップを進めながら、確率分布・Blochベクトル・エンタングルメントがどう変わるかを追ってください。
        </p>
      </div>

      {/* プリセット */}
      <Card className="p-4">
        <SectionTitle sub="教科書の代表的な回路をそのまま読み込めます">プリセット</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => loadPreset(p.id)}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] border transition-colors ${
                presetId === p.id ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
              }`}
            >
              {p.title}
            </button>
          ))}
        </div>
        {preset && (
          <div className="mt-3 rounded-xl bg-vacuum/50 border border-edge/60 p-3 space-y-2">
            <p className="text-[12px] leading-relaxed text-qink">{preset.note}</p>
            <p className="text-[11.5px] text-photon">期待される結果：{preset.expect}</p>
          </div>
        )}
      </Card>

      {/* 回路図 */}
      <Card className="p-4">
        <SectionTitle
          sub="列をダブルクリックでその演算を削除、クリックでその時点の状態を表示"
          right={
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5, 6].map((k) => (
                <button
                  key={k}
                  onClick={() => setN(k)}
                  className={`w-7 h-7 rounded-lg text-[11.5px] border transition-colors ${
                    circuit.n === k ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          }
        >
          回路（{circuit.n} 量子ビット・{circuit.ops.length} 演算）
        </SectionTitle>

        <CircuitDiagram circuit={circuit} activeStep={stepIdx} onSelect={setStep} onRemove={removeOp} />

        <div className="flex items-center gap-3 mt-3">
          <input
            type="range" className="phys-range flex-1"
            min={-1} max={Math.max(circuit.ops.length - 1, 0)} step={1}
            value={stepIdx}
            onChange={(e) => setStep(parseInt(e.target.value, 10))}
          />
          <span className="text-[11px] text-qmute tabular-nums w-24 text-right">
            ステップ {stepIdx + 1} / {circuit.ops.length}
          </span>
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          <Button variant="ghost" onClick={() => { setCircuit((c) => ({ ...c, ops: [] })); setPresetId(''); setStep(null); setShots(null); }}>
            回路を消去
          </Button>
          <Button variant="ghost" onClick={() => removeOp(circuit.ops.length - 1)} disabled={!circuit.ops.length}>
            末尾を削除
          </Button>
          <Button variant="primary" onClick={doShots} disabled={!circuit.ops.length}>
            1024ショット測定
          </Button>
        </div>
      </Card>

      {/* ゲート追加 */}
      <Card className="p-4">
        <SectionTitle sub="ゲート → 対象 → （必要なら）制御ビット の順に選んで追加">ゲートを組む</SectionTitle>

        <div className="space-y-3">
          <div>
            <p className="text-[11px] text-qmute mb-1.5">1量子ビットゲート</p>
            <div className="flex flex-wrap gap-1.5">
              {SINGLE.map((g) => (
                <button
                  key={g}
                  onClick={() => setGate(g)}
                  title={GATES[g].desc}
                  className={`px-2.5 py-1 rounded-lg text-[11.5px] font-mono border transition-colors ${
                    gate === g ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
                  }`}
                >
                  {GATES[g].label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] text-qmute mb-1.5">回転・位相ゲート</p>
            <div className="flex flex-wrap gap-1.5 items-center">
              {ROT.map((g) => (
                <button
                  key={g}
                  onClick={() => setGate(g)}
                  title={GATES[g].desc}
                  className={`px-2.5 py-1 rounded-lg text-[11.5px] font-mono border transition-colors ${
                    gate === g ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
                  }`}
                >
                  {GATES[g].label}
                </button>
              ))}
              <span className="text-[11px] text-qmute ml-2">θ =</span>
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
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-qmute mb-1.5">対象ビット</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: circuit.n }, (_, q) => (
                  <button
                    key={q}
                    onClick={() => setTarget(q)}
                    className={`w-9 h-8 rounded-lg text-[11.5px] font-mono border transition-colors ${
                      target === q ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
                    }`}
                  >
                    q{q}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] text-qmute mb-1.5">制御ビット（複数可・省略可）</p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: circuit.n }, (_, q) => (
                  <button
                    key={q}
                    onClick={() => toggleControl(q)}
                    disabled={q === target}
                    className={`w-9 h-8 rounded-lg text-[11.5px] font-mono border transition-colors disabled:opacity-25 ${
                      controls.includes(q) ? 'bg-photon/15 text-photon border-photon/40' : 'bg-panel border-edge text-qmute hover:border-photon/40'
                    }`}
                  >
                    q{q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="primary" onClick={() => addOp('gate')}>ゲートを追加</Button>
            <Button variant="ghost" onClick={() => addOp('swap')} disabled={circuit.n < 2}>SWAPを追加</Button>
            <Button variant="ghost" onClick={() => addOp('measure')}>測定を追加</Button>
          </div>
          <p className="text-[11px] text-qmute">
            制御ビットを付けると制御ゲートになります（例：X + 制御 q0 = CNOT、Z + 制御2本 = CCZ）。
          </p>
        </div>
      </Card>

      {/* 結果 */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionTitle sub="現在のステップにおける各基底状態の観測確率">測定確率</SectionTitle>
          <ProbBars entries={probEntries} />
          <div className="mt-4 pt-3 border-t border-edge/60">
            <p className="text-[11px] text-qmute mb-1.5">状態ベクトル（q0 が左端）</p>
            <p className="font-mono text-[11px] text-photon break-all leading-relaxed">
              |ψ⟩ = {ketString(stateAtStep)}
            </p>
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle sub="縮約状態。長さが1未満なら他のビットとエンタングルしている">各量子ビットのBloch表示</SectionTitle>
          <div className="flex flex-wrap gap-2 justify-center">
            {view.bloch.map((b, q) => (
              <div key={q} className="text-center">
                <BlochSphere vector={b} size={circuit.n > 3 ? 118 : 150} label={`q${q}`} showProjection={false} />
                <p className="text-[10.5px] text-qmute -mt-1">
                  |r| = <span className="tabular-nums text-qink">{b.r.toFixed(3)}</span>
                  <br />
                  S = <span className="tabular-nums text-photon">{view.entropy[q].toFixed(3)}</span> bit
                </p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-qmute mt-3 leading-relaxed">
            エンタングルメント・エントロピー合計 <span className="text-photon tabular-nums">{totalEntropy.toFixed(3)}</span> bit。
            0 なら各ビットは独立（積状態）、1 に近いほどそのビットは他と強く絡んでいます。
          </p>
        </Card>
      </div>

      {shots && (
        <Card className="p-4">
          <SectionTitle sub={`測定対象: ${shots.measured.map((q) => `q${q}`).join(', ')} ／ ${shots.total} ショット`}>
            サンプリング結果
          </SectionTitle>
          <ProbBars entries={shots.entries} color="from-photon to-quantum" />
          <p className="text-[11px] text-qmute mt-3">
            回路に測定演算があれば途中測定として実際に状態を収縮させ、無ければ最後に全ビットを測定します。
            理論確率とのずれは統計誤差（1024ショットなら約 ±1.5%）です。
          </p>
        </Card>
      )}

      <Card className="p-4">
        <SectionTitle>この計算がしていること</SectionTitle>
        <div className="text-[12px] text-qmute space-y-2 leading-relaxed">
          <p>
            n 量子ビットの状態は <Tex>{'2^n'}</Tex> 個の複素振幅で表されます。各ゲートはその振幅ベクトルに対するユニタリ変換で、
            ここでは対象ビットのペア <Tex>{'(|{\\cdots}0{\\cdots}\\rangle, |{\\cdots}1{\\cdots}\\rangle)'}</Tex> ごとに 2×2 行列を掛けています。
          </p>
          <p>
            測定確率は <Tex>{'p(x)=|\\langle x|\\psi\\rangle|^2'}</Tex>、Blochベクトルは縮約密度行列
            <Tex>{'\\rho_q=\\mathrm{Tr}_{\\bar q}|\\psi\\rangle\\langle\\psi|'}</Tex> から
            <Tex>{'\\rho=\\tfrac12(I+\\mathbf r\\cdot\\boldsymbol\\sigma)'}</Tex> として取り出しています。
            エントロピーは <Tex>{'S=-\\mathrm{Tr}\\rho_q\\log_2\\rho_q'}</Tex>。
          </p>
        </div>
      </Card>
    </div>
  );
}
