import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ModelOutletContext } from './ModelView.js';
import { useSelection } from '../selection.js';
import { formatExcelValue } from '../format.js';
import { ConfidenceBadge } from '../components/ConfidenceBadge.js';

export function InputsView() {
  const { model, modelId, parameterImpact } = useOutletContext<ModelOutletContext>();
  const { selection, select } = useSelection();

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
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b border-slate-800">
          <th className="py-2">Name</th>
          <th>Value</th>
          <th>Source</th>
          <th>Confidence</th>
          <th className="text-right">Drives</th>
          <th className="text-right">Reach</th>
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
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
