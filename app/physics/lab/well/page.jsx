'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { POTENTIALS, makeGrid, buildPotential, solveEigenstates, infiniteWellEnergy, harmonicEnergy } from '@/lib/quantum/schrodinger';
import { Card, SectionTitle, Button, Badge } from '@/components/physics/ui';
import Plot from '@/components/physics/Plot';
import Tex from '@/components/physics/Tex';

const N_GRID = 320;
const COLORS = ['#7c8cff', '#4fd1c5', '#c084fc', '#fbbf24', '#f472b6', '#60a5fa', '#34d399', '#fb923c'];

function defaultParams(kind) {
  const out = {};
  for (const p of POTENTIALS[kind].params) out[p.key] = p.def;
  return out;
}

function rangeFor(kind, params) {
  if (kind === 'well') return [0, 1];
  if (kind === 'double') return [-(params.b + 2.5), params.b + 2.5];
  if (kind === 'morse') return [-2, 12];
  if (kind === 'barrier') return [-6, 6];
  return [-8, 8];
}

export default function WellLab() {
  const [kind, setKind] = useState('harmonic');
  const [params, setParams] = useState(() => defaultParams('harmonic'));
  const [count, setCount] = useState(5);
  const [showDensity, setShowDensity] = useState(false);
  const [selected, setSelected] = useState(null);

  const solverInput = useMemo(() => ({ kind, params, count }), [kind, params, count]);
  const deferred = useDeferredValue(solverInput);
  const def = POTENTIALS[deferred.kind];

  const result = useMemo(() => {
    const [xmin, xmax] = rangeFor(deferred.kind, deferred.params);
    const grid = makeGrid(N_GRID, xmin, xmax);
    const V = buildPotential(deferred.kind, deferred.params, grid);
    const { energies, states } = solveEigenstates(V, grid, { count: deferred.count });
    return { grid, V, energies, states, xmin, xmax };
  }, [deferred]);

  const { grid, V, energies, states, xmin, xmax } = result;

  const eMax = energies[energies.length - 1];
  const vVisible = Array.from(V).filter((v) => v <= eMax * 1.6 + 1);
  const yMin = Math.min(0, ...vVisible) - 0.08 * (eMax || 1);
  const yMax = Math.max(eMax * 1.18, 0.5);
  const eScale = 0.55 * ((yMax - yMin) / Math.max(count, 1));

  const series = [
    {
      points: Array.from(grid.x, (x, i) => [x, Math.min(V[i], yMax * 1.4)]),
      color: '#8b93b8', width: 1.6, fill: false,
    },
    ...states.map((psi, n) => {
      const amp = showDensity ? 1 : 1;
      const pts = Array.from(grid.x, (x, i) => {
        const val = showDensity ? psi[i] * psi[i] : psi[i];
        return [x, energies[n] + val * eScale * (showDensity ? 1.6 : 1) * amp];
      });
      const dim = selected !== null && selected !== n;
      return {
        points: pts,
        color: COLORS[n % COLORS.length],
        width: selected === n ? 2.2 : 1.4,
        opacity: dim ? 0.22 : 1,
        fill: showDensity,
        fillOpacity: dim ? 0.05 : 0.18,
      };
    }),
  ];

  const hlines = energies.map((e, n) => ({
    y: e,
    color: COLORS[n % COLORS.length],
    label: `E${n} = ${e.toFixed(4)}`,
    opacity: selected !== null && selected !== n ? 0.25 : 0.7,
  }));

  const analytic = (n) => {
    if (deferred.kind === 'harmonic') return harmonicEnergy(n, deferred.params.omega);
    if (deferred.kind === 'well') return infiniteWellEnergy(n + 1, 1);
    return null;
  };

  const setParam = (key, value) => setParams((p) => ({ ...p, [key]: value }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[19px] font-semibold tracking-tight">固有状態ソルバ</h1>
        <p className="text-[12px] text-qmute mt-1 leading-relaxed">
          定常シュレーディンガー方程式 <Tex>{'-\\frac{\\hbar^2}{2m}\\psi\'\'+V(x)\\psi=E\\psi'}</Tex> を
          有限差分で三重対角化し、implicit-shift QL 法で数値対角化します（<Tex>{'\\hbar=m=1'}</Tex>、格子点 {N_GRID}）。
          全ポテンシャルで表示区間の両端を無限壁とします。Morseの E ≥ D は箱で離散化された状態で、自由空間の束縛状態ではありません。
        </p>
      </div>

      <Card className="p-4">
        <SectionTitle sub="ポテンシャルの形が、準位の間隔と波動関数の形をどう決めるかを見る">ポテンシャル</SectionTitle>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {Object.entries(POTENTIALS).map(([k, p]) => (
            <button
              key={k}
              onClick={() => { setKind(k); setParams(defaultParams(k)); setSelected(null); }}
              className={`px-2.5 py-1 rounded-lg text-[11.5px] border transition-colors ${
                kind === k ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {POTENTIALS[kind].params.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            {POTENTIALS[kind].params.map((p) => (
              <label key={p.key} className="block">
                <span className="text-[11px] text-qmute">
                  {p.label} = <span className="text-qink tabular-nums">{(params[p.key] ?? p.def).toFixed(2)}</span>
                </span>
                <input
                  type="range" className="phys-range w-full mt-1"
                  min={p.min} max={p.max} step={p.step}
                  value={params[p.key] ?? p.def}
                  onChange={(e) => setParam(p.key, parseFloat(e.target.value))}
                />
              </label>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-qmute">表示する準位数</span>
          {[3, 5, 6, 8].map((c) => (
            <button
              key={c}
              onClick={() => setCount(c)}
              className={`w-8 h-7 rounded-lg text-[11.5px] border transition-colors ${
                count === c ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute hover:border-quantum/40'
              }`}
            >
              {c}
            </button>
          ))}
          <Button variant="ghost" onClick={() => setShowDensity((s) => !s)} className="ml-auto">
            {showDensity ? '|ψ|² を表示中' : 'ψ を表示中'}
          </Button>
        </div>

        <p className="text-[11.5px] text-photon mt-3 leading-relaxed">{POTENTIALS[kind].note}</p>
      </Card>

      <Card className="p-4">
        <SectionTitle sub="各波動関数は自分のエネルギー準位を基線として描いています">エネルギー準位と波動関数</SectionTitle>
        <Plot
          series={series}
          hlines={hlines}
          xDomain={[xmin, xmax]}
          yDomain={[yMin, yMax]}
          height={280}
          xLabel="x"
          yLabel="E, V(x)"
        />
        <div className="flex flex-wrap gap-1.5 mt-2">
          <button
            onClick={() => setSelected(null)}
            className={`px-2 py-0.5 rounded-md text-[11px] border ${selected === null ? 'bg-quantum/15 text-quantum border-quantum/40' : 'bg-panel border-edge text-qmute'}`}
          >
            すべて
          </button>
          {energies.map((_, n) => (
            <button
              key={n}
              onClick={() => setSelected(selected === n ? null : n)}
              className="px-2 py-0.5 rounded-md text-[11px] border transition-colors"
              style={{
                borderColor: selected === n ? COLORS[n % COLORS.length] : '#252b45',
                color: selected === n ? COLORS[n % COLORS.length] : '#96a0c2',
                background: selected === n ? `${COLORS[n % COLORS.length]}1f` : 'transparent',
              }}
            >
              n = {n}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <SectionTitle sub="解析解がある系では数値解と比較できます">エネルギー固有値</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="text-qmute border-b border-edge/70">
                <th className="text-left py-1.5 font-medium">n</th>
                <th className="text-right py-1.5 font-medium">数値解 Eₙ</th>
                <th className="text-right py-1.5 font-medium">解析解</th>
                <th className="text-right py-1.5 font-medium">相対誤差</th>
                <th className="text-right py-1.5 font-medium">Eₙ − Eₙ₋₁</th>
                <th className="text-left py-1.5 font-medium pl-3">節の数</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {energies.map((e, n) => {
                const a = analytic(n);
                const nodes = countNodes(states[n]);
                return (
                  <tr key={n} className="border-b border-edge/40 last:border-0">
                    <td className="py-1.5" style={{ color: COLORS[n % COLORS.length] }}>{n}</td>
                    <td className="text-right">{e.toFixed(5)}</td>
                    <td className="text-right text-qmute">{a === null ? '—' : a.toFixed(5)}</td>
                    <td className="text-right text-qmute">{a === null ? '—' : `${(Math.abs(e - a) / Math.abs(a) * 100).toFixed(3)}%`}</td>
                    <td className="text-right text-qmute">{n === 0 ? '—' : (e - energies[n - 1]).toFixed(5)}</td>
                    <td className="pl-3 text-qmute">{nodes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-qmute mt-3 leading-relaxed">
          第 n 励起状態の節の数がちょうど n になっていることを確認してください（振動定理）。
          等間隔なら調和振動子、n² に比例するなら無限井戸、上に行くほど狭まるならMorse型の非調和性です。
        </p>
      </Card>
    </div>
  );
}

function countNodes(psi) {
  let n = 0;
  const thr = 1e-3 * Math.max(...Array.from(psi, Math.abs));
  let prev = 0;
  for (let i = 0; i < psi.length; i++) {
    const v = psi[i];
    if (Math.abs(v) < thr) continue;
    const s = Math.sign(v);
    if (prev !== 0 && s !== prev) n++;
    prev = s;
  }
  return n;
}
