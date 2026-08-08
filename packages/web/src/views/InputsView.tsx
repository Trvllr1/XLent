import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ModelOutletContext } from './ModelView.js';
import { useSelection } from '../selection.js';
import { formatExcelValue } from '../format.js';
import { ConfidenceBadge } from '../components/ConfidenceBadge.js';
import { MutationPanel } from '../components/MutationPanel.js';
import { AddInputPanel } from '../components/AddInputPanel.js';

export function InputsView() {
  const { model, modelId, parameterImpact, refreshModel } = useOutletContext<ModelOutletContext>();
  const { selection, select } = useSelection();
  const [editingParameterId, setEditingParameterId] = useState<string | null>(null);
  const [addingInput, setAddingInput] = useState(false);
  const editingParameter = model.parameters.find((parameter: any) => parameter.id === editingParameterId);

  const fanOut = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of model.graph?.edges ?? []) map.set(e.from, (map.get(e.from) ?? 0) + 1);
    return map;
  }, [model.graph]);

  const impactByParam = useMemo(
    () => new Map(parameterImpact.map((p: any) => [p.parameterId, p])),
    [parameterImpact],
  );

  return (
    <>
      {addingInput && <AddInputPanel modelId={modelId} onClose={() => setAddingInput(false)} onCommitted={refreshModel} />}
      {editingParameter && (
        <MutationPanel
          modelId={modelId}
          parameter={editingParameter}
          parameterIndex={model.parameters.findIndex((parameter: any) => parameter.id === editingParameter.id)}
          parameterCount={model.parameters.length}
          onClose={() => setEditingParameterId(null)}
          onCommitted={refreshModel}
        />
      )}
      <div className="mb-3 flex justify-end"><button type="button" onClick={() => { setEditingParameterId(null); setAddingInput(true); }} className="rounded border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-emerald-500 hover:text-emerald-300">Add input</button></div>
      <div className="max-w-full overflow-x-auto">
      <table className="w-full min-w-[48rem] text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b border-slate-800">
          <th className="py-2">Name</th>
          <th>Value</th>
          <th>Source</th>
          <th>Confidence</th>
          <th className="text-right">Drives</th>
          <th className="text-right">Reach</th>
          <th><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {model.parameters.map((p: any) => {
          const cellId = `${p.sourceCell.sheet}!${p.sourceCell.ref}`;
          const isSelected = selection?.cellId === cellId;
          const impact = impactByParam.get(p.id);
          return (
            <tr
              key={p.id}
              onClick={() => select({
                modelId,
                cellId,
                label: p.name,
                value: p.currentValue,
                format: p.format,
                role: 'parameter',
                fanOut: fanOut.get(cellId) ?? 0,
                fanIn: 0,
                sourceCell: p.sourceCell,
              })}
              className={`border-b border-slate-800/50 cursor-pointer transition-colors ${
                isSelected ? 'bg-emerald-500/5' : 'hover:bg-slate-900/60'
              }`}
            >
              <td className="py-2 text-slate-200">{p.name}</td>
              <td className="font-mono">{formatExcelValue(p.currentValue, p.format)}</td>
              <td className="text-xs text-slate-400">{p.source}</td>
              <td><ConfidenceBadge level={p.confidence} /></td>
              <td className="text-right text-xs font-mono text-slate-500">{fanOut.get(cellId) ?? 0}</td>
              <td className="text-right text-xs font-mono">
                {impact?.dead ? (
                  <span className="text-blue-400" title="No downstream outputs — potential dead input">dead</span>
                ) : (
                  <span className="text-slate-400" title={impact?.sensitivityRank ? `Sensitivity rank #${impact.sensitivityRank}` : undefined}>
                    {impact?.reachCount ?? '—'}
                    {impact?.sensitivityRank != null && (
                      <span className="text-indigo-400 ml-1">#{impact.sensitivityRank}</span>
                    )}
                  </span>
                )}
              </td>
              <td className="text-right">
                <button
                  type="button"
                  onClick={(event) => { event.stopPropagation(); setEditingParameterId(p.id); }}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-emerald-500 hover:text-emerald-300"
                >
                  Edit
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
      </table>
      </div>
    </>
  );
}
