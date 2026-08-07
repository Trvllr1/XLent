import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ModelOutletContext } from './ModelView.js';
import { useSelection } from '../selection.js';
import { formatExcelValue } from '../format.js';
import { ConfidenceBadge } from '../components/ConfidenceBadge.js';

export function OutputsView() {
  const { model, modelId } = useOutletContext<ModelOutletContext>();
  const { selection, select } = useSelection();

  const fanIn = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of model.graph?.edges ?? []) map.set(e.to, (map.get(e.to) ?? 0) + 1);
    return map;
  }, [model.graph]);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b border-slate-800">
          <th className="py-2">Name</th>
          <th>Value</th>
          <th>Confidence</th>
          <th className="text-right">Depends on</th>
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
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
