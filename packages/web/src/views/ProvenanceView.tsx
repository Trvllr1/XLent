import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ModelOutletContext } from './ModelView.js';

export function ProvenanceView() {
  const { modelId } = useOutletContext<ModelOutletContext>();
  const [data, setData] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/models/${modelId}/provenance`)
      .then((r) => r.json())
      .then((d) => setData(d.provenance || []));
  }, [modelId]);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-slate-500 border-b border-slate-800">
          <th className="py-2">Cell</th>
          <th>Source</th>
          <th>Modified</th>
        </tr>
      </thead>
      <tbody>
        {data.map((p: any) => (
          <tr key={p.parameterId} className="border-b border-slate-800/50">
            <td className="py-2 font-mono text-xs">{p.sheet}!{p.cell}</td>
            <td className="text-xs">{p.source}</td>
            <td>{p.modified ? '✓' : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
