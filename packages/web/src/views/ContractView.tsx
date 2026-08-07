import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ModelOutletContext } from './ModelView.js';

const TEMPLATE = {
  purpose: 'What this model exists to compute',
  declaredInputs: [
    { name: 'Current Stock price', unit: 'USD', description: 'Pre-buyback share price' },
  ],
  declaredOutputs: [
    { name: 'Post-buyback price per share', unit: 'USD', meaning: 'Share price after buyback', expectation: 'non-negative' },
  ],
  invariants: [
    { id: 'C001', expression: 'Cash >= 0', description: 'Cash balance cannot go negative' },
  ],
  rules: [
    { id: 'R001', expression: 'Post-buyback price per share = Equity value / Number of shares', severity: 'critical', scope: 'All periods' },
  ],
  behaviors: [
    { id: 'B001', statement: 'Increasing buyback price must not increase post-buyback value per share' },
  ],
  version: '1.0.0',
};

export function ContractView() {
  const { modelId, model, refreshModel } = useOutletContext<ModelOutletContext>();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ count: number; findings: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const contract = model.contract;

  useEffect(() => {
    setText(contract ? JSON.stringify(contract, null, 2) : JSON.stringify(TEMPLATE, null, 2));
  }, [contract]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const parsed = JSON.parse(text);
      const res = await fetch(`/contract/${modelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid contract');
      setResult({ count: data.count, findings: data.intentFindings });
      setMode('view');
      refreshModel();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save contract');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    await fetch(`/contract/${modelId}`, { method: 'DELETE' });
    setResult(null);
    setText(JSON.stringify(TEMPLATE, null, 2));
    setMode('edit');
    refreshModel();
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold text-slate-200">Model Contract</h3>
        <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${contract ? 'bg-violet-900/50 text-violet-300' : 'bg-slate-800 text-slate-500'}`}>
          {contract ? `declared · v${contract.version}` : 'not declared'}
        </span>
        <div className="ml-auto flex gap-2">
          {contract && mode === 'view' && (
            <button onClick={() => setMode('edit')} className="text-xs px-3 py-1.5 rounded bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors">Edit</button>
          )}
          {contract && (
            <button onClick={remove} className="text-xs px-3 py-1.5 rounded bg-slate-800 text-slate-400 hover:text-red-400 transition-colors">Remove</button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        The contract is the highest-authority statement of what the model <em>should</em> do (Rule 11). A model cannot reach <span className="text-slate-300 font-medium">VALIDATED</span> without one. Reconciliation conflicts surface as <span className="text-violet-300">intent</span> findings in the Debug view.
      </p>

      {mode === 'view' && contract ? (
        <div className="space-y-4">
          <section className="bg-slate-900 rounded-lg border border-slate-800/60 p-4">
            <p className="text-[10px] uppercase text-slate-500 mb-1">Purpose</p>
            <p className="text-sm text-slate-200">{contract.purpose}</p>
          </section>
          <div className="grid grid-cols-2 gap-4">
            <ContractSection title="Declared Inputs" count={contract.declaredInputs.length}>
              {contract.declaredInputs.map((i: any, n: number) => (
                <div key={n} className="text-xs text-slate-300 py-1">
                  <span className="font-medium">{i.name}</span>
                  {i.unit && <span className="text-slate-500 ml-2">[{i.unit}]</span>}
                  {i.bounds && <span className="text-slate-500 ml-2 font-mono">{i.bounds.min ?? '−∞'} ≤ x ≤ {i.bounds.max ?? '∞'}</span>}
                </div>
              ))}
            </ContractSection>
            <ContractSection title="Declared Outputs" count={contract.declaredOutputs.length}>
              {contract.declaredOutputs.map((o: any, n: number) => (
                <div key={n} className="text-xs text-slate-300 py-1">
                  <span className="font-medium">{o.name}</span>
                  {o.unit && <span className="text-slate-500 ml-2">[{o.unit}]</span>}
                  {o.expectation && <span className="text-violet-300 ml-2">{o.expectation}</span>}
                </div>
              ))}
            </ContractSection>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <ContractSection title="Rules" count={contract.rules.length}>
              {contract.rules.map((r: any) => (
                <div key={r.id} className="text-xs py-1">
                  <span className="font-mono text-violet-300">{r.id}</span>
                  <span className="text-slate-300 ml-2">{r.expression}</span>
                </div>
              ))}
            </ContractSection>
            <ContractSection title="Invariants" count={contract.invariants.length}>
              {contract.invariants.map((i: any) => (
                <div key={i.id} className="text-xs py-1">
                  <span className="font-mono text-violet-300">{i.id}</span>
                  <span className="text-slate-300 ml-2">{i.expression}</span>
                </div>
              ))}
            </ContractSection>
          </div>
          {contract.behaviors && contract.behaviors.length > 0 && (
            <ContractSection title="Expected Behaviors" count={contract.behaviors.length}>
              {contract.behaviors.map((b: any) => (
                <div key={b.id} className="text-xs py-1 text-slate-300">
                  <span className="font-mono text-violet-300">{b.id}</span> — {b.statement}
                </div>
              ))}
            </ContractSection>
          )}
        </div>
      ) : (
        <div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="w-full h-96 bg-slate-950 border border-slate-800 rounded-lg p-4 font-mono text-xs text-slate-200 focus:outline-none focus:border-violet-700"
          />
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-sm disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : 'Save Contract'}
            </button>
            {contract && (
              <button onClick={() => setMode('view')} className="text-xs text-slate-500 hover:text-slate-300">Cancel</button>
            )}
            {error && <span className="text-xs text-red-400">{error}</span>}
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-violet-800/50 bg-violet-950/20 px-4 py-3">
          <p className="text-xs text-violet-300">
            Contract saved. Reconciliation produced <strong>{result.count}</strong> intent finding{result.count === 1 ? '' : 's'} — see the Debug view.
          </p>
        </div>
      )}
    </div>
  );
}

function ContractSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="bg-slate-900 rounded-lg border border-slate-800/60 p-4">
      <p className="text-[10px] uppercase text-slate-500 mb-2">{title} <span className="text-slate-600">({count})</span></p>
      <div className="divide-y divide-slate-800/50">{children}</div>
    </section>
  );
}
