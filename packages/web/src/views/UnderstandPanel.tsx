import { useEffect, useState } from 'react';

interface LabeledCell {
  cellId: string;
  label: string;
  value: unknown;
  formula?: string;
  role: 'parameter' | 'intermediate' | 'output';
  fanOut: number;
  fanIn: number;
}

interface ModelSection {
  sheet: string;
  title: string;
  startRow: number;
  endRow: number;
  cells: LabeledCell[];
}

interface Understanding {
  name: string;
  sheets: string[];
  sections: ModelSection[];
  keyIntermediates: LabeledCell[];
  parameters: LabeledCell[];
  outputs: LabeledCell[];
}

export function UnderstandPanel({ modelId }: { modelId: string }) {
  const [data, setData] = useState<Understanding | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'sections' | 'intermediates' | 'flow'>('sections');

  useEffect(() => {
    fetch(`/understand/${modelId}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [modelId]);

  if (loading) return <p className="text-slate-400">Analyzing model structure…</p>;
  if (!data) return <p className="text-red-400">Unable to analyze model</p>;

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <h3 className="text-lg font-semibold text-slate-200">{data.name}</h3>
        <span className="text-xs text-slate-500">{data.sheets.join(' → ')}</span>
      </div>

      <nav className="flex gap-1 mb-6">
        {([
          { key: 'sections', label: 'Sections' },
          { key: 'intermediates', label: 'Key Drivers' },
          { key: 'flow', label: 'Data Flow' },
        ] as const).map((t) => (
          <button
            key={t.key}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              view === t.key ? 'bg-indigo-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            onClick={() => setView(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {view === 'sections' && <SectionsView sections={data.sections} />}
      {view === 'intermediates' && <IntermediatesView cells={data.keyIntermediates} />}
      {view === 'flow' && <FlowView data={data} />}
    </div>
  );
}

function SectionsView({ sections }: { sections: ModelSection[] }) {
  if (!sections.length) return <p className="text-slate-500 text-sm">No section structure detected.</p>;

  return (
    <div className="space-y-6">
      {sections.map((s, i) => (
        <div key={i} className="bg-slate-900 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <h4 className="font-medium text-slate-200">{s.title}</h4>
            <span className="text-xs text-slate-600">{s.sheet}</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {s.cells.map((cell) => (
                <tr key={cell.cellId} className="border-b border-slate-800/40">
                  <td className="py-1.5 text-slate-300 w-1/3">{cell.label}</td>
                  <td className="py-1.5 font-mono text-slate-100">{formatValue(cell.value)}</td>
                  <td className="py-1.5 w-20"><RoleBadge role={cell.role} /></td>
                  <td className="py-1.5 text-xs text-slate-600 text-right">
                    {cell.fanOut > 1 && `→ ${cell.fanOut}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function IntermediatesView({ cells }: { cells: LabeledCell[] }) {
  return (
    <div className="bg-slate-900 rounded-lg p-4">
      <p className="text-xs text-slate-500 mb-4">
        Cells that are neither raw inputs nor final outputs but drive multiple downstream calculations.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-800">
            <th className="py-2">Label</th>
            <th>Value</th>
            <th>Formula</th>
            <th className="text-right">Drives</th>
          </tr>
        </thead>
        <tbody>
          {cells.map((cell) => (
            <tr key={cell.cellId} className="border-b border-slate-800/40">
              <td className="py-2 text-slate-200">{cell.label}</td>
              <td className="py-2 font-mono text-slate-100">{formatValue(cell.value)}</td>
              <td className="py-2 font-mono text-xs text-slate-500">{cell.formula}</td>
              <td className="py-2 text-right text-indigo-400 font-mono">{cell.fanOut}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FlowView({ data }: { data: Understanding }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-slate-900 rounded-lg p-4">
        <h4 className="text-xs uppercase text-slate-500 mb-3">Inputs</h4>
        <ul className="space-y-1">
          {data.parameters.map((p) => (
            <li key={p.cellId} className="text-sm">
              <span className="text-slate-300">{p.label}</span>
              <span className="ml-2 font-mono text-slate-500">{formatValue(p.value)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-slate-900 rounded-lg p-4">
        <h4 className="text-xs uppercase text-slate-500 mb-3">Key Calculations</h4>
        <ul className="space-y-1">
          {data.keyIntermediates.slice(0, 10).map((c) => (
            <li key={c.cellId} className="text-sm">
              <span className="text-indigo-300">{c.label}</span>
              <span className="ml-2 font-mono text-slate-500">{formatValue(c.value)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="bg-slate-900 rounded-lg p-4">
        <h4 className="text-xs uppercase text-slate-500 mb-3">Outputs</h4>
        <ul className="space-y-1">
          {data.outputs.map((o) => (
            <li key={o.cellId} className="text-sm">
              <span className="text-emerald-300">{o.label}</span>
              <span className="ml-2 font-mono text-slate-500">{formatValue(o.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles = {
    parameter: 'bg-blue-900/50 text-blue-300',
    intermediate: 'bg-indigo-900/50 text-indigo-300',
    output: 'bg-emerald-900/50 text-emerald-300',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${styles[role as keyof typeof styles] || ''}`}>
      {role === 'parameter' ? 'INPUT' : role === 'intermediate' ? 'CALC' : 'OUTPUT'}
    </span>
  );
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') {
    if (Math.abs(v) < 1 && v !== 0) return (v * 100).toFixed(2) + '%';
    if (Math.abs(v) >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return Number.isInteger(v) ? String(v) : v.toFixed(3);
  }
  return String(v);
}
