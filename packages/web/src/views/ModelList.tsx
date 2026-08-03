import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Upload } from './Upload.js';

interface ModelSummary {
  id: string;
  name: string;
  workbookName: string;
  version: number;
  createdAt: string;
  compatibility: { status: string };
  parameters: unknown[];
  outputs: unknown[];
}

export function ModelListPage() {
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const refresh = useCallback(() => {
    setLoading(true);
    fetch('/models')
      .then((r) => r.json())
      .then((d) => setModels(d.models || []))
      .catch(() => setModels([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete model "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/models/${id}`, { method: 'DELETE' });
    if (res.ok) refresh();
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <Upload onImported={(id) => navigate(`/models/${id}`)} />

      <section>
        <h2 className="text-lg font-semibold mb-4">Imported Models</h2>
        {loading ? (
          <p className="text-slate-500 text-sm">Loading…</p>
        ) : models.length === 0 ? (
          <p className="text-slate-500 text-sm">No models yet. Upload a spreadsheet to get started.</p>
        ) : (
          <div className="divide-y divide-slate-800 rounded-lg border border-slate-800 overflow-hidden">
            {models.map((m) => (
              <div key={m.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-900/50 transition-colors">
                <div className="flex-1 min-w-0">
                  <Link to={`/models/${m.id}`} className="text-sm font-medium text-slate-200 hover:text-emerald-400 truncate block">
                    {m.name}
                  </Link>
                  <p className="text-xs text-slate-500 truncate">
                    {m.workbookName} · v{m.version} · {m.parameters.length} inputs · {m.outputs.length} outputs
                  </p>
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-medium ${
                  m.compatibility.status === 'VALID' ? 'bg-emerald-900/50 text-emerald-300' :
                  m.compatibility.status === 'PARTIAL' ? 'bg-amber-900/50 text-amber-300' :
                  'bg-red-900/50 text-red-300'
                }`}>
                  {m.compatibility.status}
                </span>
                <button
                  onClick={() => handleDelete(m.id, m.name)}
                  className="text-xs text-slate-500 hover:text-red-400 px-2 py-1"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
