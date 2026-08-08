import { useState } from 'react';

interface Parameter {
  id: string;
  name: string;
  type: string;
  currentValue: unknown;
  source: string;
}

interface MutationPreview {
  valid: boolean;
  baseVersion: number;
  previewId?: string;
  affectedComponents: string[];
  affectedOutputs: string[];
  evidenceRefs: Array<{ kind: 'preview'; checksum: string }>;
  testResults: Array<{ name: string; status: string; message?: string }>;
  allTestsPass: boolean;
  contractFindings: Array<{ id: string; severity: string; explanation: string }>;
  validationIssues: Array<{ code: string; message: string }>;
  diff?: { summary: string; entries: Array<{ path: string; description: string; before?: unknown; after?: unknown }> };
}

interface MutationPanelProps {
  modelId: string;
  parameter: Parameter;
  parameterIndex: number;
  parameterCount: number;
  onClose: () => void;
  onCommitted: () => void;
}

export function MutationPanel({ modelId, parameter, parameterIndex, parameterCount, onClose, onCommitted }: MutationPanelProps) {
  const [mode, setMode] = useState<'value' | 'name' | 'position' | 'source' | 'remove'>('value');
  const [value, setValue] = useState(String(parameter.currentValue ?? ''));
  const [name, setName] = useState(parameter.name);
  const [position, setPosition] = useState(String(parameterIndex + 1));
  const [formula, setFormula] = useState('=');
  const [rationale, setRationale] = useState('');
  const [preview, setPreview] = useState<MutationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = () => ({
    actor: { id: 'web-user', type: 'human' as const },
    rationale,
    operations: mode === 'value'
      ? [{
          type: 'setParameterValue' as const,
          parameterId: parameter.id,
          value: parameter.type === 'number' ? Number(value) : parameter.type === 'boolean' ? value === 'true' : value,
        }]
      : mode === 'name'
        ? [{ type: 'renameParameter' as const, parameterId: parameter.id, name: name.trim() }]
        : mode === 'position'
          ? [{ type: 'moveParameter' as const, parameterId: parameter.id, toIndex: Number(position) - 1 }]
          : mode === 'source'
            ? [{ type: 'setParameterSource' as const, parameterId: parameter.id, formula }]
            : [{ type: 'removeParameter' as const, parameterId: parameter.id }],
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
    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = null;
    }
    if (!response.ok) {
      const validationMessage = data?.validationIssues?.map((issue: { message: string }) => issue.message).join(' ');
      throw new Error(data?.error ?? validationMessage ?? `Mutation request failed (${response.status})`);
    }
    if (!data) throw new Error('Mutation response was not valid JSON');
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

  const blocked = !preview?.allTestsPass || preview.contractFindings.some((finding) => finding.severity === 'critical');

  return (
    <section className="mb-5 border-y border-slate-800 bg-slate-900/40 px-4 py-4" aria-label={`Edit ${parameter.name}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Propose input change</h2>
          <p className="mt-1 text-xs text-slate-500">
            <span className="text-slate-300">{parameter.name}</span> · Current: <span className="font-mono text-slate-300">{String(parameter.currentValue)}</span>
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-xs text-slate-400 hover:text-slate-100">Close</button>
      </div>

      <div className="mt-4 inline-flex rounded border border-slate-700 bg-slate-950 p-0.5" aria-label="Change type">
        {(['value', 'name', 'position', 'source', 'remove'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => revise(() => setMode(option))}
            className={`px-3 py-1 text-xs font-medium capitalize ${mode === option ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(10rem,0.5fr)_minmax(16rem,1fr)_auto] xl:items-end">
        <label className="text-xs text-slate-400">
          {mode === 'value' ? 'Proposed value' : mode === 'name' ? 'Proposed name' : mode === 'position' ? 'Proposed position' : mode === 'source' ? 'Proposed formula' : 'Proposed change'}
          {mode === 'remove' ? (
            <span className="mt-1 flex min-h-9 items-center rounded border border-red-900/70 bg-red-950/30 px-2.5 py-2 text-sm text-red-300">Remove {parameter.name}</span>
          ) : mode === 'source' ? (
            <input type="text" value={formula} onChange={(event) => revise(() => setFormula(event.target.value))} placeholder="=B1*2" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 font-mono text-sm text-indigo-200 placeholder:text-slate-600" spellCheck={false} />
          ) : mode === 'position' ? (
            <select value={position} onChange={(event) => revise(() => setPosition(event.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100">
              {Array.from({ length: parameterCount }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
            </select>
          ) : mode === 'name' ? (
            <input type="text" value={name} onChange={(event) => revise(() => setName(event.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100" />
          ) : parameter.type === 'boolean' ? (
            <select value={value} onChange={(event) => revise(() => setValue(event.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100">
              <option value="true">True</option>
              <option value="false">False</option>
            </select>
          ) : (
            <input type={parameter.type === 'number' ? 'number' : 'text'} value={value} onChange={(event) => revise(() => setValue(event.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 font-mono text-sm text-slate-100" />
          )}
        </label>
        <label className="text-xs text-slate-400">
          Rationale
          <input type="text" value={rationale} onChange={(event) => revise(() => setRationale(event.target.value))} placeholder="Why should this model change?" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 placeholder:text-slate-600" />
        </label>
        <button type="button" disabled={busy || !rationale.trim() || (mode === 'name' ? !name.trim() || name.trim() === parameter.name : mode === 'position' ? Number(position) === parameterIndex + 1 : mode === 'source' ? formula.trim().length < 2 || parameter.source !== 'CLIENT_MODEL' : mode === 'value' && parameter.type === 'number' && !Number.isFinite(Number(value)))} onClick={handlePreview} className="rounded bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? 'Evaluating…' : 'Preview change'}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {preview && (
        <div className="mt-4 border-t border-slate-800 pt-4 text-xs">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-slate-400">
            <span>{preview.diff?.summary ?? 'No semantic changes.'}</span>
            <span>{preview.affectedComponents.length} components affected</span>
            <span>{preview.affectedOutputs.length} outputs affected</span>
            <span className="font-mono" title={preview.evidenceRefs[0]?.checksum}>Evidence {preview.previewId?.slice(0, 12)}</span>
          </div>
          {preview.validationIssues.map((issue) => <p key={issue.code} className="mt-2 text-red-400">{issue.message}</p>)}
          {preview.testResults.length > 0 && (
            <p className={`mt-2 ${preview.allTestsPass ? 'text-emerald-400' : 'text-red-400'}`}>
              Tests: {preview.testResults.filter((test) => test.status === 'pass').length}/{preview.testResults.length} passed
            </p>
          )}
          {preview.contractFindings.map((finding) => <p key={finding.id} className={finding.severity === 'critical' ? 'mt-2 text-red-400' : 'mt-2 text-amber-400'}>{finding.explanation}</p>)}
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={busy || blocked} onClick={() => handleDecision('commit')} className="rounded bg-emerald-500 px-3 py-1.5 font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">Commit</button>
            <button type="button" disabled={busy} onClick={() => handleDecision('reject')} className="rounded border border-slate-700 px-3 py-1.5 text-slate-300 hover:border-slate-500 disabled:opacity-40">Reject</button>
          </div>
        </div>
      )}
    </section>
  );
}