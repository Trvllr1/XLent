import { formatExcelValue } from '../format.js';
import { useSelection } from '../selection.js';

export interface LabeledCell {
  cellId: string;
  label: string;
  value: unknown;
  format?: string;
  formula?: string;
  role: 'parameter' | 'intermediate' | 'output';
  fanOut: number;
  fanIn: number;
}

export interface ModelSection {
  sheet: string;
  title: string;
  startRow: number;
  endRow: number;
  cells: LabeledCell[];
}

export interface Understanding {
  name: string;
  sheets: string[];
  sections: ModelSection[];
  keyIntermediates: LabeledCell[];
  parameters: LabeledCell[];
  outputs: LabeledCell[];
}

function useCellSelect(modelId: string) {
  const { selection, select } = useSelection();
  return {
    isSelected: (cellId: string) => selection?.cellId === cellId,
    selectCell: (cell: LabeledCell) => select({
      modelId,
      cellId: cell.cellId,
      label: cell.label,
      value: cell.value,
      format: cell.format,
      formula: cell.formula,
      role: cell.role,
      fanOut: cell.fanOut,
      fanIn: cell.fanIn,
    }),
  };
}

export function SectionsView({ sections, modelId }: { sections: ModelSection[]; modelId: string }) {
  const { isSelected, selectCell } = useCellSelect(modelId);
  if (!sections.length) return <p className="text-slate-500 text-sm">No section structure detected.</p>;

  return (
    <div className="space-y-6">
      {sections.map((s, i) => (
        <div key={i} className="bg-slate-900 rounded-lg p-4 border border-slate-800/60">
          <div className="flex items-center gap-2 mb-3">
            <h4 className="font-medium text-slate-200">{s.title}</h4>
            <span className="text-xs text-slate-600">{s.sheet}</span>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {s.cells.map((cell) => (
                <tr
                  key={cell.cellId}
                  onClick={() => selectCell(cell)}
                  className={`border-b border-slate-800/40 cursor-pointer transition-colors ${
                    isSelected(cell.cellId) ? 'bg-emerald-500/5' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <td className="py-1.5 text-slate-300 w-1/3">{cell.label}</td>
                  <td className="py-1.5 font-mono text-slate-100">{formatExcelValue(cell.value, cell.format)}</td>
                  <td className="py-1.5 w-20"><RoleBadge role={cell.role} /></td>
                  <td className="py-1.5 text-xs text-slate-600 text-right">
                    {cell.fanOut > 1 && `→ ${cell.fanOut}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export function IntermediatesView({ cells, modelId }: { cells: LabeledCell[]; modelId: string }) {
  const { isSelected, selectCell } = useCellSelect(modelId);

  return (
    <div className="bg-slate-900 rounded-lg p-4 border border-slate-800/60">
      <p className="text-xs text-slate-500 mb-4">
        Cells that are neither raw inputs nor final outputs but drive multiple downstream calculations.
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 border-b border-slate-800">
            <th className="py-2">Label</th>
            <th>Value</th>
            <th>Formula</th>
            <th className="text-right">Drives</th>
          </tr>
        </thead>
        <tbody>
          {cells.map((cell) => (
            <tr
              key={cell.cellId}
              onClick={() => selectCell(cell)}
              className={`border-b border-slate-800/40 cursor-pointer transition-colors ${
                isSelected(cell.cellId) ? 'bg-emerald-500/5' : 'hover:bg-slate-800/40'
              }`}
            >
              <td className="py-2 text-slate-200">{cell.label}</td>
              <td className="py-2 font-mono text-slate-100">{formatExcelValue(cell.value, cell.format)}</td>
              <td className="py-2 font-mono text-xs text-slate-500">{cell.formula}</td>
              <td className="py-2 text-right text-indigo-400 font-mono">{cell.fanOut}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FlowView({ data, modelId }: { data: Understanding; modelId: string }) {
  const { isSelected, selectCell } = useCellSelect(modelId);

  const item = (cell: LabeledCell, color: string) => (
    <li
      key={cell.cellId}
      onClick={() => selectCell(cell)}
      className={`text-sm cursor-pointer rounded px-1 -mx-1 transition-colors ${
        isSelected(cell.cellId) ? 'bg-emerald-500/10' : 'hover:bg-slate-800/50'
      }`}
    >
      <span className={color}>{cell.label}</span>
      <span className="ml-2 font-mono text-slate-500">{formatExcelValue(cell.value, cell.format)}</span>
    </li>
  );

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-slate-900 rounded-lg p-4 border border-slate-800/60">
        <h4 className="text-xs uppercase text-slate-500 mb-3">Inputs</h4>
        <ul className="space-y-1">{data.parameters.map((p) => item(p, 'text-slate-300'))}</ul>
      </div>
      <div className="bg-slate-900 rounded-lg p-4 border border-slate-800/60">
        <h4 className="text-xs uppercase text-slate-500 mb-3">Key Calculations</h4>
        <ul className="space-y-1">{data.keyIntermediates.slice(0, 10).map((c) => item(c, 'text-indigo-300'))}</ul>
      </div>
      <div className="bg-slate-900 rounded-lg p-4 border border-slate-800/60">
        <h4 className="text-xs uppercase text-slate-500 mb-3">Outputs</h4>
        <ul className="space-y-1">{data.outputs.map((o) => item(o, 'text-emerald-300'))}</ul>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles = {
    parameter: 'bg-blue-900/50 text-blue-300',
    intermediate: 'bg-indigo-900/50 text-indigo-300',
    output: 'bg-emerald-900/50 text-emerald-300',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${styles[role as keyof typeof styles] || ''}`}>
      {role === 'parameter' ? 'INPUT' : role === 'intermediate' ? 'CALC' : 'OUTPUT'}
    </span>
  );
}
