import { useState } from 'react';

type ParameterType = 'number' | 'string' | 'boolean' | 'date';

interface Preview {
  baseVersion: number;
  previewId?: string;
  evidenceRefs: Array<{ checksum: string }>;
  affectedComponents: string[];
  affectedOutputs: string[];
  allTestsPass: boolean;
  testResults: Array<{ name: string; status: string; message?: string }>;
  contractFindings: Array<{ id: string; severity: string; explanation: string }>;
  diff?: { summary: string };
}

interface AddInputPanelProps {
  modelId: string;
  onClose: () => void;
  onCommitted: () => void;
}

export function AddInputPanel({ modelId, onClose, onCommitted }: AddInputPanelProps) {
  const [parameterId] = useState(() => crypto.randomUUID());
  const [name, setName] = useState('');
  const [parameterType, setParameterType] = useState<ParameterType>('number');
  const [value, setValue] = useState('');
  const [rationale, setRationale] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typedValue = () => (
    parameterType === 'number' ? Number(value)
      : parameterType === 'boolean' ? value === 'true'
        : value
  );

  const request = () => ({
    actor: { id: 'web-user', type: 'human' as const },
    rationale,
    operations: [{
      type: 'addParameter' as const,
      parameterId,
      name: name.trim(),
      parameterType,
      value: typedValue(),
    }],
  });

  const revise = (update: () => void) => {
    update();
    setPreview(null);
    setError(null);
  };

  const call = async (path: string, body: object) => {
    const response = await fetch(`/models/${modelId}/mutations/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? data.validationIssues?.map((issue: { message: string }) => issue.message).join(' ') ?? `Mutation request failed (${response.status})`);
    return data;
  };

  const handlePreview = async () => {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      setPreview(await call('preview', request()));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDecision = async (decision: 'commit' | 'reject') => {
    if (!preview?.previewId) return;
    setBusy(true);
    setError(null);
    try {
      await call(decision, { ...request(), baseVersion: preview.baseVersion, previewId: preview.previewId });
      if (decision === 'commit') onCommitted();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${decision} failed`);
    } finally {
      setBusy(false);
    }
  };

  const valueInvalid = parameterType === 'number' && !Number.isFinite(Number(value));
  const blocked = !preview?.allTestsPass || preview.contractFindings.some((finding) => finding.severity === 'critical');

  return (
    <section className="mb-5 border-y border-slate-800 bg-slate-900/40 px-4 py-4" aria-label="Add input">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Propose native input</h2>
          <p className="mt-1 text-xs text-slate-500">Create a governed assumption owned by XLent. It starts isolated until a formula rewires to it.</p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-slate-100">Close</button>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(10rem,0.6fr)_minmax(8rem,0.4fr)_minmax(8rem,0.4fr)_minmax(14rem,1fr)_auto] xl:items-end">
        <label className="text-xs text-slate-400">Name
          <input value={name} onChange={(event) => revise(() => setName(event.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100" />
        </label>
        <label className="text-xs text-slate-400">Type
          <select value={parameterType} onChange={(event) => revise(() => setParameterType(event.target.value as ParameterType))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100">
            <option value="number">Number</option>
            <option value="string">Text</option>
            <option value="boolean">Boolean</option>
            <option value="date">Date</option>
          </select>
        </label>
        <label className="text-xs text-slate-400">Initial value
          {parameterType === 'boolean' ? (
            <select value={value} onChange={(event) => revise(() => setValue(event.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100">
              <option value="">Select…</option>
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          ) : (
            <input type={parameterType === 'number' ? 'number' : parameterType === 'date' ? 'date' : 'text'} value={value} onChange={(event) => revise(() => setValue(event.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 font-mono text-sm text-slate-100" />
          )}
        </label>
        <label className="text-xs text-slate-400">Rationale
          <input value={rationale} onChange={(event) => revise(() => setRationale(event.target.value))} placeholder="Why should this model change?" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 placeholder:text-slate-600" />
        </label>
        <button type="button" disabled={busy || !name.trim() || !value.trim() || valueInvalid || !rationale.trim()} onClick={handlePreview} className="rounded bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{busy ? 'Evaluating…' : 'Preview change'}</button>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {preview && (
        <div className="mt-4 border-t border-slate-800 pt-4 text-xs">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-slate-400">
            <span>{preview.diff?.summary ?? 'No semantic changes.'}</span>
            <span>{preview.affectedComponents.length} components affected</span>
            <span>{preview.affectedOutputs.length} outputs affected</span>
            <span className="font-mono">Evidence {preview.previewId?.slice(0, 12)}</span>
          </div>
          {preview.testResults.length > 0 && <p className={`mt-2 ${preview.allTestsPass ? 'text-emerald-400' : 'text-red-400'}`}>Tests: {preview.testResults.filter((test) => test.status === 'pass').length}/{preview.testResults.length} passed</p>}
          {preview.testResults.filter((test) => test.status === 'fail' || test.status === 'error').map((test) => <p key={test.name} className="mt-1 text-red-300"><span className="font-medium">{test.name}:</span> {test.message ?? test.status}</p>)}
          {preview.contractFindings.map((finding) => <p key={finding.id} className={finding.severity === 'critical' ? 'mt-2 text-red-400' : 'mt-2 text-amber-400'}>{finding.explanation}</p>)}
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={busy || blocked} onClick={() => handleDecision('commit')} className="rounded bg-emerald-500 px-3 py-1.5 font-medium text-slate-950 disabled:opacity-40">Commit</button>
            <button type="button" disabled={busy} onClick={() => handleDecision('reject')} className="rounded border border-slate-700 px-3 py-1.5 text-slate-300 disabled:opacity-40">Reject</button>
          </div>
        </div>
      )}
    </section>
  );
}
