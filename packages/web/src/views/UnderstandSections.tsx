import { useOutletContext } from 'react-router-dom';
import type { ModelOutletContext } from './ModelView.js';
import { SectionsView } from './UnderstandPanel.js';

export function UnderstandSections() {
  const { modelId, understanding, understandingError, understandingLoading } =
    useOutletContext<ModelOutletContext>();

  if (understandingLoading) return <p className="text-slate-400">Analyzing model structure…</p>;
  if (understandingError) return <p className="text-red-400">{understandingError}. Re-upload the spreadsheet to enable analysis.</p>;
  if (!understanding) return <p className="text-red-400">Unable to analyze model</p>;

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <h3 className="text-lg font-semibold text-slate-200">{understanding.name}</h3>
        <span className="text-xs text-slate-500">{understanding.sheets.join(' → ')}</span>
      </div>
      <SectionsView sections={understanding.sections} modelId={modelId} />
    </div>
  );
}
