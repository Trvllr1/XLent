import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ModelOutletContext } from './ModelView.js';

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['sandbox'],
  sandbox: ['validated', 'draft'],
  validated: ['approved', 'draft'],
  approved: ['published', 'draft'],
  published: ['deprecated'],
  deprecated: [],
};

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-amber-900/50 text-amber-300',
  sandbox: 'bg-blue-900/50 text-blue-300',
  validated: 'bg-indigo-900/50 text-indigo-300',
  approved: 'bg-emerald-900/50 text-emerald-300',
  published: 'bg-emerald-900/70 text-emerald-200',
  deprecated: 'bg-slate-800 text-slate-500',
};

export function OverviewView() {
  const { model, modelId, refreshModel } = useOutletContext<ModelOutletContext>();
  const d = model.discovery;
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowed = VALID_TRANSITIONS[model.status] ?? [];

  const transition = async (target: string) => {
    setTransitioning(true);
    setError(null);
    try {
      const res = await fetch(`/models/${modelId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: target }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Transition failed');
      refreshModel();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transition failed');
    } finally {
      setTransitioning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          ['Sheets', d.sheets],
          ['Formula Cells', d.formulaCells],
          ['Input Candidates', d.inputCandidates],
          [model.sourceKind === 'native' ? 'Declared Outputs' : 'Output Candidates', model.sourceKind === 'native' ? model.outputs.length : d.outputCandidates],
          ['Cross-Sheet Refs', d.crossSheetReferences],
          ['External Refs', d.externalReferences],
          ['Named Ranges', d.namedRanges],
          ['Compatibility', d.compatibility],
        ].map(([label, value]) => (
          <div key={label as string} className="bg-slate-900 rounded-lg p-4 border border-slate-800/60">
            <p className="text-xs text-slate-500 uppercase">{label}</p>
            <p className="text-lg font-mono mt-1">{String(value)}</p>
          </div>
        ))}
      </div>

      <div className="bg-slate-900 rounded-lg p-4 border border-slate-800/60">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Model Identity</h3>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
          <div><dt className="text-xs text-slate-600">Slug</dt><dd className="font-mono text-slate-300">{model.slug}</dd></div>
          <div><dt className="text-xs text-slate-600">Version</dt><dd className="font-mono text-slate-300">{model.semver} (v{model.version})</dd></div>
          <div>
            <dt className="text-xs text-slate-600 mb-1">Lifecycle</dt>
            <dd className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_STYLE[model.status] ?? 'bg-slate-800 text-slate-400'}`}>
                {model.status}
              </span>
              {allowed.map((t) => (
                <button
                  key={t}
                  onClick={() => transition(t)}
                  disabled={transitioning}
                  className="text-[10px] uppercase px-1.5 py-0.5 rounded border border-slate-700 text-slate-400 hover:text-emerald-300 hover:border-emerald-700 disabled:opacity-40 transition-colors"
                >
                  → {t}
                </button>
              ))}
            </dd>
          </div>
          <div><dt className="text-xs text-slate-600">{model.sourceKind === 'native' ? 'Created' : 'Imported'}</dt><dd className="font-mono text-slate-300">{new Date(model.createdAt).toLocaleDateString()}</dd></div>
        </dl>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
