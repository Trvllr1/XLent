import { useEffect, useState } from 'react';

export interface ModelSummary {
  id: string;
  name: string;
  sourceKind?: 'workbook' | 'native';
  workbookName: string;
  version: number;
  createdAt: string;
  compatibility: { status: string };
  parameters: unknown[];
  outputs: unknown[];
}

let cache: Promise<ModelSummary[]> | null = null;

export function invalidateModelsCache() {
  cache = null;
  window.dispatchEvent(new Event('xlent:models-changed'));
}

export function useModels() {
  const [models, setModels] = useState<ModelSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setLoading(true);
      (cache ??= fetch('/models').then((r) => r.json()).then((d) => (d.models || []) as ModelSummary[]))
        .then((m) => { if (!cancelled) setModels(m); })
        .catch(() => { if (!cancelled) setModels([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    };
    load();
    window.addEventListener('xlent:models-changed', load);
    return () => { cancelled = true; window.removeEventListener('xlent:models-changed', load); };
  }, []);

  return { models, loading };
}
