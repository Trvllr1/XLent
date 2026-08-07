import { useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { StatusBar } from '../components/StatusBar.js';
import type { Understanding } from './UnderstandPanel.js';

export interface ModelOutletContext {
  model: any;
  modelId: string;
  parameterImpact: any[];
  understanding: Understanding | null;
  understandingError: string | null;
  understandingLoading: boolean;
  refreshModel: () => void;
}

export function ModelView() {
  const { id: modelId } = useParams<{ id: string }>();
  const [model, setModel] = useState<any>(null);
  const [parameterImpact, setParameterImpact] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [understanding, setUnderstanding] = useState<Understanding | null>(null);
  const [understandingError, setUnderstandingError] = useState<string | null>(null);
  const [understandingLoading, setUnderstandingLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/models/${modelId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setModel(d.model);
          setParameterImpact(d.parameterImpact ?? []);
        }
      })
      .catch(() => { if (!cancelled) setModel(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [modelId, reload]);

  useEffect(() => {
    let cancelled = false;
    setUnderstanding(null);
    setUnderstandingError(null);
    setUnderstandingLoading(true);
    fetch(`/understand/${modelId}`)
      .then((r) => (r.ok ? r.json() : r.json().then((e) => Promise.reject(new Error(e.error || 'Analysis failed')))))
      .then((d) => { if (!cancelled) setUnderstanding(d); })
      .catch((e) => { if (!cancelled) setUnderstandingError(e.message); })
      .finally(() => { if (!cancelled) setUnderstandingLoading(false); });
    return () => { cancelled = true; };
  }, [modelId]);

  if (loading) return <p className="text-slate-400 p-6">Loading model…</p>;
  if (!model) return <p className="text-red-400 p-6">Model not found</p>;

  const ctx: ModelOutletContext = {
    model,
    modelId: modelId!,
    parameterImpact,
    understanding,
    understandingError,
    understandingLoading,
    refreshModel: () => setReload((n) => n + 1),
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto p-6">
        <Outlet context={ctx} />
      </div>
      <StatusBar model={model} />
    </div>
  );
}
