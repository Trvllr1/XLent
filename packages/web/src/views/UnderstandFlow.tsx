import { useOutletContext } from 'react-router-dom';
import type { ModelOutletContext } from './ModelView.js';
import { FlowView } from './UnderstandPanel.js';

export function UnderstandFlow() {
  const { modelId, understanding, understandingError, understandingLoading } =
    useOutletContext<ModelOutletContext>();

  if (understandingLoading) return <p className="text-slate-400">Analyzing model structure…</p>;
  if (understandingError) return <p className="text-red-400">{understandingError}. Re-upload the spreadsheet to enable analysis.</p>;
  if (!understanding) return <p className="text-red-400">Unable to analyze model</p>;

  return <FlowView data={understanding} modelId={modelId} />;
}
