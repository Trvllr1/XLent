import { useEffect, useState } from 'react';
import { useSelection } from '../selection.js';
import { formatExcelValue } from '../format.js';
import { IconClose } from './icons.js';
import { FormulaEditPanel } from './FormulaEditPanel.js';

interface Graph {
  nodes: string[];
  edges: { from: string; to: string }[];
}

function trace(graph: Graph, start: string, direction: 'up' | 'down'): string[] {
  const visited = new Set<string>();
  const queue = [start];
  while (queue.length) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const next = direction === 'up'
      ? graph.edges.filter((e) => e.to === current).map((e) => e.from)
      : graph.edges.filter((e) => e.from === current).map((e) => e.to);
    queue.push(...next);
  }
  visited.delete(start);
  return Array.from(visited);
}

export function ContextPanel() {
  const { selection, clear } = useSelection();
  const [graph, setGraph] = useState<Graph | null>(null);
  const [editingFormula, setEditingFormula] = useState(false);

  const modelId = selection?.modelId;
  const cellId = selection?.cellId;
  useEffect(() => {
    if (!modelId) return;
    let cancelled = false;
    fetch(`/models/${modelId}/graph`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setGraph(d.graph); })
      .catch(() => { if (!cancelled) setGraph(null); });
    return () => { cancelled = true; };
  }, [modelId]);
  useEffect(() => { setEditingFormula(false); }, [cellId]);

  if (!selection) return null;

  const upstream = graph ? trace(graph, selection.cellId, 'up') : [];
  const downstream = graph ? trace(graph, selection.cellId, 'down') : [];

  return (
    <aside className="w-80 shrink-0 border-l border-slate-800 bg-slate-900/60 overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Cell Detail</h3>
        <button onClick={clear} className="text-slate-500 hover:text-slate-300 transition-colors" title="Close panel">
          <IconClose className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-5">
        <div>
          <p className="text-sm font-medium text-slate-100">{selection.label}</p>
          <p className="text-xs font-mono text-slate-500 mt-0.5">{selection.cellId}</p>
        </div>

        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5">Value</h4>
          <p className="font-mono text-sm text-slate-100">{formatExcelValue(selection.value, selection.format)}</p>
          <p className="text-xs font-mono text-slate-600 mt-1">raw: {String(selection.value ?? '—')}</p>
          {selection.format && <p className="text-xs font-mono text-slate-600">format: {selection.format}</p>}
        </section>

        {selection.formula && (
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Formula</h4>
              {!editingFormula && <button type="button" onClick={() => setEditingFormula(true)} className="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300 hover:border-emerald-500 hover:text-emerald-300">Edit</button>}
            </div>
            <p className="font-mono text-xs text-indigo-300 bg-slate-950 rounded px-2 py-1.5 break-all">
              {selection.formula}
            </p>
            {editingFormula && modelId && (
              <div className="mt-2">
                <FormulaEditPanel modelId={modelId} cellId={selection.cellId} currentFormula={selection.formula} onClose={() => setEditingFormula(false)} />
              </div>
            )}
          </section>
        )}

        {(selection.fanIn != null || selection.fanOut != null) && (
          <section className="flex gap-4">
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Depends on</h4>
              <p className="text-sm font-mono text-slate-300">{selection.fanIn ?? 0} cells</p>
            </div>
            <div>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Drives</h4>
              <p className="text-sm font-mono text-slate-300">{selection.fanOut ?? 0} cells</p>
            </div>
          </section>
        )}

        {graph && (
          <>
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Upstream ({upstream.length})
              </h4>
              {upstream.length === 0 ? (
                <p className="text-xs text-slate-600">Root input — no upstream dependencies</p>
              ) : (
                <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                  {upstream.slice(0, 20).map((id) => (
                    <li key={id} className="text-xs font-mono text-slate-400 truncate">{id}</li>
                  ))}
                  {upstream.length > 20 && (
                    <li className="text-xs text-slate-600">… {upstream.length - 20} more</li>
                  )}
                </ul>
              )}
            </section>
            <section>
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                Downstream ({downstream.length})
              </h4>
              {downstream.length === 0 ? (
                <p className="text-xs text-slate-600">Terminal output — nothing depends on this</p>
              ) : (
                <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                  {downstream.slice(0, 20).map((id) => (
                    <li key={id} className="text-xs font-mono text-slate-400 truncate">{id}</li>
                  ))}
                  {downstream.length > 20 && (
                    <li className="text-xs text-slate-600">… {downstream.length - 20} more</li>
                  )}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}
