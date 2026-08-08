import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ModelOutletContext } from './ModelView.js';
import { useSelection } from '../selection.js';
import { formatExcelValue } from '../format.js';
import { ConfidenceBadge } from '../components/ConfidenceBadge.js';
import { OutputRenamePanel } from '../components/OutputRenamePanel.js';
import { AddOutputPanel } from '../components/AddOutputPanel.js';

export function OutputsView() {
  const { model, modelId, refreshModel, understanding } = useOutletContext<ModelOutletContext>();
  const { selection, select } = useSelection();
  const [editingOutputId, setEditingOutputId] = useState<string | null>(null);
  const [addingOutput, setAddingOutput] = useState(false);
  const editingOutput = model.outputs.find((output: any) => output.id === editingOutputId);

  const fanIn = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of model.graph?.edges ?? []) map.set(e.to, (map.get(e.to) ?? 0) + 1);
    return map;
  }, [model.graph]);
  const outputCandidates = useMemo(() => {
    const exposed = new Set(model.outputs.map((output: any) => `${output.sourceCell.sheet}!${output.sourceCell.ref}`));
    const candidates = [...(understanding?.sections.flatMap((section) => section.cells) ?? []), ...(understanding?.keyIntermediates ?? [])];
    return [...new Map(candidates.filter((cell) => cell.formula && !exposed.has(cell.cellId)).map((cell) => [cell.cellId, cell])).values()];
  }, [model.outputs, understanding]);

  return (
    <>
    {addingOutput && <AddOutputPanel modelId={modelId} candidates={outputCandidates} onClose={() => setAddingOutput(false)} onCommitted={refreshModel} />}
    {editingOutput && <OutputRenamePanel modelId={modelId} output={editingOutput} outputIndex={model.outputs.findIndex((output: any) => output.id === editingOutput.id)} outputCount={model.outputs.length} onClose={() => setEditingOutputId(null)} onCommitted={refreshModel} />}
    <div className="mb-3 flex justify-end"><button type="button" onClick={() => { setEditingOutputId(null); setAddingOutput(true); }} className="rounded border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-500 hover:text-emerald-300">Add output</button></div>
    <div className="max-w-full overflow-x-auto">
    <table className="w-full min-w-[36rem] text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b border-slate-800">
          <th className="py-2">Name</th>
          <th>Value</th>
          <th>Confidence</th>
          <th className="text-right">Depends on</th>
          <th><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {model.outputs.map((o: any) => {
          const cellId = `${o.sourceCell.sheet}!${o.sourceCell.ref}`;
          const isSelected = selection?.cellId === cellId;
          return (
            <tr
              key={o.id}
              onClick={() => select({
                modelId,
                cellId,
                label: o.name,
                value: o.value,
                format: o.format,
                role: 'output',
                fanOut: 0,
                fanIn: fanIn.get(cellId) ?? 0,
                sourceCell: o.sourceCell,
              })}
              className={`border-b border-slate-800/50 cursor-pointer transition-colors ${
                isSelected ? 'bg-emerald-500/5' : 'hover:bg-slate-900/60'
              }`}
            >
              <td className="py-2 text-slate-200">{o.name}</td>
              <td className="font-mono">{formatExcelValue(o.value, o.format)}</td>
              <td><ConfidenceBadge level={o.confidence} /></td>
              <td className="text-right text-xs font-mono text-slate-500">{fanIn.get(cellId) ?? 0}</td>
              <td className="text-right"><button type="button" onClick={(event) => { event.stopPropagation(); setEditingOutputId(o.id); }} className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-emerald-500 hover:text-emerald-300">Edit</button></td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
    </>
  );
}
