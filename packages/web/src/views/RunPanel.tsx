import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';

interface Parameter {
  id: string;
  name: string;
  currentValue: unknown;
  sourceCell: { sheet: string; ref: string };
  source: string;
  confidence: string;
}

interface OutputItem {
  id: string;
  name: string;
  confidence: string;
}

interface ComparisonRow {
  outputId: string;
  outputName: string;
  baseline: unknown;
  scenario: unknown;
  delta: number | null;
  percentDelta: number | null;
}

export function RunPanel() {
  const { id: modelId } = useParams<{ id: string }>();
  const [model, setModel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState<Map<string, number>>(new Map());
  const [results, setResults] = useState<Record<string, unknown> | null>(null);
  const [comparison, setComparison] = useState<ComparisonRow[] | null>(null);
  const [running, setRunning] = useState(false);
  const [deliverable, setDeliverable] = useState<any>(null);

  useEffect(() => {
    fetch(`/models/${modelId}`)
      .then((r) => r.json())
      .then((d) => setModel(d.model))
      .finally(() => setLoading(false));
  }, [modelId]);

  const handleRun = async () => {
    setRunning(true);
    setComparison(null);
    setDeliverable(null);
    try {
      const body = overrides.size > 0
        ? { overrides: Array.from(overrides.entries()).map(([parameterId, value]) => ({ parameterId, value })) }
        : {};
      const res = await fetch(`/models/${modelId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setResults(data.results);
    } finally {
      setRunning(false);
    }
  };

  const handleCompare = async () => {
    if (overrides.size === 0) return;
    setRunning(true);
    try {
      const res = await fetch(`/models/${modelId}/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenarioOverrides: Array.from(overrides.entries()).map(([parameterId, value]) => ({ parameterId, value })),
        }),
      });
      const data = await res.json();
      setComparison(data.comparison.rows);
    } finally {
      setRunning(false);
    }
  };

  const handleDeliverable = async () => {
    const res = await fetch(`/models/${modelId}/deliverable`);
    const data = await res.json();
    setDeliverable(data.deliverable);
  };

  if (loading) return <p className="text-slate-400">Loading…</p>;
  if (!model) return <p className="text-red-400">Model not found</p>;

  const parameters: Parameter[] = model.parameters;
  const outputs: OutputItem[] = model.outputs;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link to={`/models/${modelId}`} className="text-sm text-slate-400 hover:text-slate-200">← {model.name}</Link>
        <h2 className="text-xl font-semibold">Run Model</h2>
      </div>

      {/* Parameter overrides */}
      <section>
        <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wide">Parameters</h3>
        <div className="rounded-lg border border-slate-800 divide-y divide-slate-800 overflow-hidden max-h-80 overflow-y-auto">
          {parameters.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono text-slate-300 truncate">{p.name}</p>
                <p className="text-[10px] text-slate-500">{p.sourceCell.sheet}!{p.sourceCell.ref}</p>
              </div>
              <input
                type="number"
                defaultValue={p.currentValue as number}
                className="w-32 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm font-mono text-right text-slate-200 focus:border-emerald-500 focus:outline-none"
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) setOverrides(new Map(overrides).set(p.id, val));
                }}
              />
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                p.confidence === 'HIGH' ? 'bg-emerald-900/50 text-emerald-300' :
                p.confidence === 'MEDIUM' ? 'bg-amber-900/50 text-amber-300' :
                'bg-red-900/50 text-red-300'
              }`}>{p.confidence}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleRun}
          disabled={running}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg"
        >
          {running ? 'Running…' : 'Run Model'}
        </button>
        {overrides.size > 0 && (
          <button
            onClick={handleCompare}
            disabled={running}
            className="border border-emerald-600 text-emerald-400 hover:bg-emerald-600/10 disabled:opacity-50 text-sm px-4 py-2 rounded-lg"
          >
            Compare vs Baseline
          </button>
        )}
      </div>

      {/* Results */}
      {results && (
        <section>
          <div className="flex items-center gap-4 mb-3">
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wide">Outputs</h3>
            <button
              onClick={handleDeliverable}
              className="ml-auto text-xs border border-slate-600 text-slate-300 hover:border-emerald-500 hover:text-emerald-400 px-3 py-1.5 rounded"
            >
              Send to Client ↗
            </button>
          </div>
          <div className="rounded-lg border border-slate-800 divide-y divide-slate-800 overflow-hidden">
            {outputs.map((o) => (
              <div key={o.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-mono text-slate-300">{o.name}</span>
                <span className="text-sm font-mono font-medium text-slate-100">
                  {typeof results[o.id] === 'number' ? (results[o.id] as number).toFixed(4) : String(results[o.id] ?? '—')}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Comparison */}
      {comparison && (
        <section>
          <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wide">Comparison</h3>
          <div className="rounded-lg border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900 text-left text-[10px] uppercase text-slate-500">
                  <th className="px-4 py-2">Output</th>
                  <th className="px-4 py-2 text-right">Baseline</th>
                  <th className="px-4 py-2 text-right">Scenario</th>
                  <th className="px-4 py-2 text-right">Δ%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {comparison.map((row) => (
                  <tr key={row.outputId}>
                    <td className="px-4 py-2 font-mono text-slate-300">{row.outputName}</td>
                    <td className="px-4 py-2 text-right font-mono">{typeof row.baseline === 'number' ? row.baseline.toFixed(2) : '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{typeof row.scenario === 'number' ? row.scenario.toFixed(2) : '—'}</td>
                    <td className={`px-4 py-2 text-right font-mono font-medium ${
                      row.percentDelta != null && row.percentDelta > 0 ? 'text-red-400' :
                      row.percentDelta != null && row.percentDelta < 0 ? 'text-emerald-400' : ''
                    }`}>
                      {row.percentDelta != null ? `${row.percentDelta > 0 ? '+' : ''}${row.percentDelta.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Deliverable preview */}
      {deliverable && (
        <section>
          <h3 className="text-sm font-medium text-slate-400 mb-3 uppercase tracking-wide">Deliverable Package</h3>
          <pre className="rounded-lg bg-slate-900 border border-slate-800 p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-64 overflow-y-auto">
            {JSON.stringify(deliverable, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
