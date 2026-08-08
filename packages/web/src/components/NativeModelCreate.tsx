import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconClose, IconGrid } from './icons.js';

interface NativeTemplateSummary {
  id: string;
  name: string;
  description: string;
  componentCounts: { inputs: number; formulas: number; outputs: number; tests: number };
}

interface Props {
  onCreated: (modelId: string) => void;
}

export function NativeModelCreate({ onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<NativeTemplateSummary[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || templates.length > 0) return;
    fetch('/models/native/templates')
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load native templates');
        return response.json();
      })
      .then((data) => {
        const nextTemplates = data.templates ?? [];
        setTemplates(nextTemplates);
        setSelectedId(nextTemplates[0]?.id ?? '');
      })
      .catch((caught: Error) => setError(caught.message));
  }, [open, templates.length]);

  const close = () => {
    if (loading) return;
    setOpen(false);
    setError(null);
  };

  const create = async () => {
    if (!selectedId || !name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/models/native', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedId, name: name.trim() }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? `Creation failed (${response.status})`);
      onCreated(data.model.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Creation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
      >
        <IconGrid className="h-4 w-4" />
        New native model
      </button>

      {open && createPortal((
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <section className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-950 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="native-model-title">
            <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div>
                <h2 id="native-model-title" className="text-base font-semibold text-slate-100">Create native model</h2>
                <p className="mt-1 text-xs text-slate-500">Start from a governed computational package.</p>
              </div>
              <button type="button" onClick={close} className="rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-200" title="Close">
                <IconClose className="h-4 w-4" />
              </button>
            </header>

            <div className="space-y-5 px-5 py-5">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase text-slate-400">Model name</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') void create(); }}
                  placeholder="FY27 Unit Economics"
                  className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-500"
                />
              </label>

              <fieldset>
                <legend className="mb-2 text-xs font-medium uppercase text-slate-400">Template</legend>
                <div className="divide-y divide-slate-800 overflow-hidden rounded-md border border-slate-700">
                  {templates.map((template) => (
                    <label key={template.id} className={`flex cursor-pointer gap-3 px-3 py-3 ${selectedId === template.id ? 'bg-emerald-950/40' : 'bg-slate-900 hover:bg-slate-800/70'}`}>
                      <input type="radio" name="native-template" value={template.id} checked={selectedId === template.id} onChange={() => setSelectedId(template.id)} className="mt-1 accent-emerald-500" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-200">{template.name}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{template.description}</span>
                        <span className="mt-1 block text-[11px] text-slate-600">
                          {template.componentCounts.inputs} inputs · {template.componentCounts.formulas} formulas · {template.componentCounts.outputs} outputs · {template.componentCounts.tests} tests
                        </span>
                      </span>
                    </label>
                  ))}
                  {templates.length === 0 && !error && <p className="px-3 py-5 text-center text-xs text-slate-500">Loading templates…</p>}
                </div>
              </fieldset>

              {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
            </div>

            <footer className="flex justify-end gap-2 border-t border-slate-800 px-5 py-4">
              <button type="button" onClick={close} className="rounded-md px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200">Cancel</button>
              <button
                type="button"
                onClick={() => void create()}
                disabled={loading || !selectedId || !name.trim()}
                className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? 'Creating…' : 'Create model'}
              </button>
            </footer>
          </section>
        </div>
      ), document.body)}
    </>
  );
}