import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ModelOutletContext } from './ModelView.js';
import { formatExcelValue } from '../format.js';

interface ComparisonRow {
  outputId: string;
  outputName: string;
  baseline: unknown;
  scenario: unknown;
  delta: number | null;
  percentDelta: number | null;
}

export function ScenariosView() {
  const { model, modelId } = useOutletContext<ModelOutletContext>();
  const parameters: any[] = model.parameters ?? [];
  const outputs: any[] = model.outputs ?? [];

  const [scenarioName, setScenarioName] = useState('Scenario');
  const [overrides, setOverrides] = useState<Map<string, number>>(new Map());
  const [running, setRunning] = useState(false);
  const [comparison, setComparison] = useState<ComparisonRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const changed = useMemo(() => overrides.size > 0, [overrides]);

  const setOverride = (parameterId: string, value: number | null, original: number) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      if (value == null || Number.isNaN(value) || value === original) next.delete(parameterId);
      else next.set(parameterId, value);
      return next;
    });
  };

  const run = async () => {
    if (!changed) return;
    setRunning(true);
    setError(null);
    setComparison(null);
    try {
      const res = await fetch(`/models/${modelId}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioId: scenarioName,
          scenarioOverrides: Array.from(overrides.entries()).map(([parameterId, value]) => ({ parameterId, value })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Comparison failed');
      setComparison(data.comparison.rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Comparison failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <input
          value={scenarioName}
          onChange={(e) => setScenarioName(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-md px-3 py-1.5 text-sm text-slate-200 w-56"
          placeholder="Scenario name"
        />
        <button
          onClick={run}
          disabled={!changed || running}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm px-4 py-1.5 rounded-md transition-colors"
        >
          {running ? 'Running…' : `Run Scenario (${overrides.size} override${overrides.size === 1 ? '' : 's'})`}
        </button>
        {error && <span className="text-xs text-red-400">{error}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Overrides</h3>
          <div className="rounded-lg border border-slate-800 divide-y divide-slate-800/60 overflow-hidden max-h-[26rem] overflow-y-auto">
            {parameters.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1 text-sm text-slate-300 truncate" title={p.name}>{p.name}</span>
                <span className="text-xs font-mono text-slate-600 w-20 text-right">
                  {formatExcelValue(p.currentValue, p.format)}
                </span>
                <input
                  type="number"
                  step="any"
                  placeholder="override"
                  onChange={(e) => setOverride(p.id, e.target.value === '' ? null : parseFloat(e.target.value), p.currentValue)}
                  className="w-28 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-100 text-right"
                />
              </div>
            ))}
          </div>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Baseline vs {scenarioName}
          </h3>
          {!comparison ? (
            <p className="text-sm text-slate-600">Adjust one or more inputs, then run to see the impact on outputs.</p>
          ) : (
            <div className="rounded-lg border border-slate-800 divide-y divide-slate-800/60 overflow-hidden max-h-[26rem] overflow-y-auto">
              {comparison.map((row) => (
                <div key={row.outputId} className="px-3 py-2 flex items-center gap-3 text-sm">
                  <span className="flex-1 text-slate-300 truncate" title={row.outputName}>{row.outputName}</span>
                  <span className="font-mono text-xs text-slate-500 w-24 text-right">
                    {formatExcelValue(row.baseline, outputs.find((o) => o.id === row.outputId)?.format)}
                  </span>
                  <span className="text-slate-600">→</span>
                  <span className="font-mono text-xs text-slate-100 w-24 text-right">
                    {formatExcelValue(row.scenario, outputs.find((o) => o.id === row.outputId)?.format)}
                  </span>
                  <span className={`font-mono text-xs w-20 text-right ${
                    row.percentDelta == null ? 'text-slate-600'
                    : row.percentDelta > 0 ? 'text-emerald-400'
                    : row.percentDelta < 0 ? 'text-red-400' : 'text-slate-500'
                  }`}>
                    {row.percentDelta == null ? '—' : `${row.percentDelta > 0 ? '+' : ''}${row.percentDelta.toFixed(1)}%`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
