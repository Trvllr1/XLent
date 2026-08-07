import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ModelOutletContext } from './ModelView.js';
import { formatExcelValue } from '../format.js';

interface SweepPoint {
  factor: number;
  paramValue: number;
  outputValue: unknown;
}

interface ParameterImpact {
  parameterId: string;
  parameterName: string;
  outputId: string;
  outputName: string;
  baseValue: unknown;
  sweepValues: SweepPoint[];
  absoluteImpact: number;
  relativeImpact: number;
}

interface SensitivityResult {
  baselineOutputs: Record<string, unknown>;
  impacts: ParameterImpact[];
  ranking: { parameterId: string; parameterName: string; totalImpact: number }[];
}

export function SensitivityView() {
  const { model, modelId } = useOutletContext<ModelOutletContext>();
  const outputs: any[] = model.outputs ?? [];

  const [outputId, setOutputId] = useState<string>(outputs[0]?.id ?? '');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SensitivityResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/sensitivity/${modelId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputIds: outputId ? [outputId] : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sensitivity analysis failed');
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sensitivity analysis failed');
    } finally {
      setRunning(false);
    }
  };

  const fmt = (id: string) => outputs.find((o) => o.id === id)?.format;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-xs text-slate-500">Target output</label>
        <select
          value={outputId}
          onChange={(e) => setOutputId(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-md px-3 py-1.5 text-sm text-slate-200"
        >
          {outputs.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <button
          onClick={run}
          disabled={running || !outputId}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm px-4 py-1.5 rounded-md transition-colors"
        >
          {running ? 'Sweeping…' : 'Run Sensitivity'}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      {!result ? (
        <p className="text-sm text-slate-600">
          Sweeps each input ±10% / ±25% / ±50% and ranks which parameters move the target output most.
        </p>
      ) : (
        <>
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Impact Ranking</h3>
            <div className="rounded-lg border border-slate-800 divide-y divide-slate-800/60 overflow-hidden">
              {result.ranking.map((r, i) => {
                const max = result.ranking[0]?.totalImpact || 1;
                const pct = Math.min(100, (r.totalImpact / max) * 100);
                return (
                  <div key={r.parameterId} className="px-3 py-2 flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-600 w-6">{i + 1}</span>
                    <span className="w-56 text-sm text-slate-300 truncate">{r.parameterName}</span>
                    <div className="flex-1 h-4 bg-slate-950 rounded overflow-hidden">
                      <div className="h-full bg-indigo-500/70 rounded" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="font-mono text-xs text-slate-400 w-24 text-right">
                      {r.totalImpact.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Sweep Detail</h3>
            <div className="rounded-lg border border-slate-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-500 border-b border-slate-800">
                    <th className="py-2 px-3">Parameter</th>
                    <th className="py-2 px-3">Output</th>
                    <th className="py-2 px-3 text-right">Base</th>
                    {result.impacts[0]?.sweepValues.map((s) => (
                      <th key={s.factor} className="py-2 px-3 text-right font-mono text-xs">
                        {s.factor > 0 ? '+' : ''}{Math.round(s.factor * 100)}%
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.impacts
                    .filter((imp) => !outputId || imp.outputId === outputId)
                    .sort((a, b) => b.relativeImpact - a.relativeImpact)
                    .map((imp) => (
                      <tr key={`${imp.parameterId}:${imp.outputId}`} className="border-b border-slate-800/50">
                        <td className="py-1.5 px-3 text-slate-300">{imp.parameterName}</td>
                        <td className="py-1.5 px-3 text-slate-400">{imp.outputName}</td>
                        <td className="py-1.5 px-3 text-right font-mono text-xs text-slate-400">
                          {formatExcelValue(imp.baseValue, fmt(imp.outputId))}
                        </td>
                        {imp.sweepValues.map((s) => (
                          <td key={s.factor} className="py-1.5 px-3 text-right font-mono text-xs text-slate-200">
                            {formatExcelValue(s.outputValue, fmt(imp.outputId))}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
