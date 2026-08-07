import { useOutletContext } from 'react-router-dom';
import type { ModelOutletContext } from './ModelView.js';

export function CompatibilityView() {
  const { model } = useOutletContext<ModelOutletContext>();
  const report = model.compatibility;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          report.status === 'VALID' ? 'bg-emerald-900 text-emerald-300' :
          report.status === 'PARTIAL' ? 'bg-amber-900 text-amber-300' :
          'bg-red-900 text-red-300'
        }`}>
          {report.status}
        </span>
        <span className="text-sm text-slate-400">
          {report.supportedFormulas}/{report.totalFormulas} formulas supported
        </span>
      </div>
      {report.issues?.length > 0 && (
        <ul className="space-y-1">
          {report.issues.map((issue: any, i: number) => (
            <li key={i} className="text-xs text-slate-400">
              [{issue.severity}] {issue.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
