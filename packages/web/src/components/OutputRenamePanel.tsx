import { useState } from 'react';

interface Output {
  id: string;
  name: string;
  value: unknown;
}

interface Preview {
  baseVersion: number;
  previewId?: string;
  affectedComponents: string[];
  affectedOutputs: string[];
  allTestsPass: boolean;
  testResults: Array<{ status: string }>;
  contractFindings: Array<{ id: string; severity: string; explanation: string }>;
  diff?: { summary: string };
}

interface OutputRenamePanelProps {
  modelId: string;
  output: Output;
  outputIndex: number;
  outputCount: number;
  onClose: () => void;
  onCommitted: () => void;
}

export function OutputRenamePanel({ modelId, output, outputIndex, outputCount, onClose, onCommitted }: OutputRenamePanelProps) {
  const [mode, setMode] = useState<'name' | 'position'>('name');
  const [name, setName] = useState(output.name);
  const [position, setPosition] = useState(String(outputIndex + 1));
  const [rationale, setRationale] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = () => ({
    actor: { id: 'web-user', type: 'human' as const },
    rationale,
    operations: mode === 'name'
      ? [{ type: 'renameOutput' as const, outputId: output.id, name: name.trim() }]
      : [{ type: 'moveOutput' as const, outputId: output.id, toIndex: Number(position) - 1 }],
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
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const validationMessage = data?.validationIssues?.map((issue: { message: string }) => issue.message).join(' ');
      throw new Error(data?.error ?? validationMessage ?? `Mutation request failed (${response.status})`);
    }
    return data;
  };

  const handlePreview = async () => {
    setBusy(true);
    setError(null);
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

  const blocked = !preview?.allTestsPass || preview.contractFindings.some((finding) => finding.severity === 'critical');

  return (
    <section className="mb-5 border-y border-slate-800 bg-slate-900/40 px-4 py-4" aria-label={`Edit output ${output.name}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Propose output change</h2>
          <p className="mt-1 text-xs text-slate-500"><span className="text-slate-300">{output.name}</span> · Current: <span className="font-mono text-slate-300">{String(output.value)}</span></p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-slate-100">Close</button>
      </div>
      <div className="mt-4 inline-flex rounded border border-slate-700 bg-slate-950 p-0.5" aria-label="Change type">
        {(['name', 'position'] as const).map((option) => (
          <button key={option} type="button" aria-pressed={mode === option} onClick={() => revise(() => setMode(option))} className={`px-3 py-1 text-xs font-medium capitalize ${mode === option ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}>{option}</button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(10rem,0.5fr)_minmax(16rem,1fr)_auto] xl:items-end">
        <label className="text-xs text-slate-400">{mode === 'name' ? 'Proposed name' : 'Proposed position'}
          {mode === 'name' ? (
            <input value={name} onChange={(event) => revise(() => setName(event.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100" />
          ) : (
            <select value={position} onChange={(event) => revise(() => setPosition(event.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100">
              {Array.from({ length: outputCount }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
            </select>
          )}
        </label>
        <label className="text-xs text-slate-400">Rationale
          <input value={rationale} onChange={(event) => revise(() => setRationale(event.target.value))} placeholder="Why should this model change?" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 placeholder:text-slate-600" />
        </label>
        <button type="button" disabled={busy || !rationale.trim() || (mode === 'name' ? !name.trim() || name.trim() === output.name : Number(position) === outputIndex + 1)} onClick={handlePreview} className="rounded bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{busy ? 'Evaluating…' : 'Preview change'}</button>
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