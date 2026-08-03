import { useEffect, useState } from 'react';

interface Props {
  modelId: string;
  modelName: string;
}

type Tab = 'overview' | 'inputs' | 'outputs' | 'graph' | 'scenarios' | 'compatibility' | 'provenance';

export function ModelView({ modelId, modelName }: Props) {
  const [tab, setTab] = useState<Tab>('overview');
  const [model, setModel] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/models/${modelId}`)
      .then((r) => r.json())
      .then((d) => setModel(d.model))
      .finally(() => setLoading(false));
  }, [modelId]);

  if (loading) return <p className="text-slate-400">Loading model…</p>;
  if (!model) return <p className="text-red-400">Model not found</p>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'inputs', label: 'Inputs' },
    { key: 'outputs', label: 'Outputs' },
    { key: 'graph', label: 'Graph' },
    { key: 'scenarios', label: 'Scenarios' },
    { key: 'compatibility', label: 'Compatibility' },
    { key: 'provenance', label: 'Provenance' },
  ];

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-4">{modelName}</h2>

      <nav className="flex gap-1 border-b border-slate-800 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`px-3 py-2 text-sm rounded-t transition-colors ${
              tab === t.key ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <OverviewPanel model={model} />}
      {tab === 'inputs' && <InputsPanel parameters={model.parameters} />}
      {tab === 'outputs' && <OutputsPanel outputs={model.outputs} />}
      {tab === 'graph' && <GraphPanel graph={model.graph} />}
      {tab === 'compatibility' && <CompatibilityPanel report={model.compatibility} />}
      {tab === 'provenance' && <ProvenancePanel modelId={modelId} />}
      {tab === 'scenarios' && <ScenariosPanel modelId={modelId} />}
    </div>
  );
}

function OverviewPanel({ model }: { model: any }) {
  const d = model.discovery;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[
        ['Sheets', d.sheets],
        ['Formula Cells', d.formulaCells],
        ['Input Candidates', d.inputCandidates],
        ['Output Candidates', d.outputCandidates],
        ['Cross-Sheet Refs', d.crossSheetReferences],
        ['External Refs', d.externalReferences],
        ['Named Ranges', d.namedRanges],
        ['Compatibility', d.compatibility],
      ].map(([label, value]) => (
        <div key={label as string} className="bg-slate-900 rounded-lg p-4">
          <p className="text-xs text-slate-500 uppercase">{label}</p>
          <p className="text-lg font-mono mt-1">{String(value)}</p>
        </div>
      ))}
    </div>
  );
}

function InputsPanel({ parameters }: { parameters: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b border-slate-800">
          <th className="py-2">Name</th>
          <th>Value</th>
          <th>Source</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>
        {parameters.map((p: any) => (
          <tr key={p.id} className="border-b border-slate-800/50">
            <td className="py-2 font-mono text-xs">{p.name}</td>
            <td className="font-mono">{String(p.currentValue)}</td>
            <td className="text-xs text-slate-400">{p.source}</td>
            <td><ConfidenceBadge level={p.confidence} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OutputsPanel({ outputs }: { outputs: any[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b border-slate-800">
          <th className="py-2">Name</th>
          <th>Value</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>
        {outputs.map((o: any) => (
          <tr key={o.id} className="border-b border-slate-800/50">
            <td className="py-2 font-mono text-xs">{o.name}</td>
            <td className="font-mono">{String(o.value)}</td>
            <td><ConfidenceBadge level={o.confidence} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GraphPanel({ graph }: { graph: any }) {
  return (
    <div className="bg-slate-900 rounded-lg p-4">
      <p className="text-sm text-slate-400 mb-2">
        {graph.nodes.length} nodes · {graph.edges.length} edges
      </p>
      <p className="text-xs text-slate-500">
        Full interactive graph visualization coming in next iteration.
      </p>
    </div>
  );
}

function CompatibilityPanel({ report }: { report: any }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          report.status === 'VALID' ? 'bg-emerald-900 text-emerald-300' :
          report.status === 'PARTIAL' ? 'bg-amber-900 text-amber-300' :
          'bg-red-900 text-red-300'
        }`}>
          {report.status}
        </span>
        <span className="text-sm text-slate-400">
          {report.supportedFormulas}/{report.totalFormulas} formulas supported
        </span>
      </div>
      {report.issues?.length > 0 && (
        <ul className="space-y-1">
          {report.issues.map((issue: any, i: number) => (
            <li key={i} className="text-xs text-slate-400">
              [{issue.severity}] {issue.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProvenancePanel({ modelId }: { modelId: string }) {
  const [data, setData] = useState<any[]>([]);
  useEffect(() => {
    fetch(`/models/${modelId}/provenance`)
      .then((r) => r.json())
      .then((d) => setData(d.provenance || []));
  }, [modelId]);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b border-slate-800">
          <th className="py-2">Cell</th>
          <th>Source</th>
          <th>Modified</th>
        </tr>
      </thead>
      <tbody>
        {data.map((p: any) => (
          <tr key={p.parameterId} className="border-b border-slate-800/50">
            <td className="py-2 font-mono text-xs">{p.sheet}!{p.cell}</td>
            <td className="text-xs">{p.source}</td>
            <td>{p.modified ? '✓' : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ScenariosPanel({ modelId }: { modelId: string }) {
  return (
    <div className="bg-slate-900 rounded-lg p-4">
      <p className="text-sm text-slate-400">
        Scenario creation UI coming in next iteration. Use the API directly:
      </p>
      <pre className="mt-2 text-xs text-slate-500 font-mono">
{`POST /models/${modelId}/scenarios
{
  "name": "Downside",
  "overrides": [{ "parameterId": "...", "value": 120 }]
}`}
      </pre>
    </div>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const colors = {
    HIGH: 'text-emerald-400',
    MEDIUM: 'text-amber-400',
    LOW: 'text-red-400',
  };
  return <span className={`text-xs ${colors[level as keyof typeof colors] || ''}`}>{level}</span>;
}
