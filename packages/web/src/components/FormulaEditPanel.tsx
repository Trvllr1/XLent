import { useState } from 'react';
import { FormulaEditor } from './FormulaEditor.js';

interface Preview {
  baseVersion: number;
  previewId?: string;
  evidenceRefs: Array<{ checksum: string }>;
  affectedComponents: string[];
  affectedOutputs: string[];
  allTestsPass: boolean;
  testResults: Array<{ name: string; status: string; message?: string }>;
  contractFindings: Array<{ id: string; severity: string; explanation: string }>;
  validationIssues: Array<{ code: string; message: string }>;
  diff?: { summary: string };
}

interface FormulaEditPanelProps {
  modelId: string;
  cellId: string;
  currentFormula: string;
  workbookSheets?: string[];
  onClose: () => void;
}

export function FormulaEditPanel({ modelId, cellId, currentFormula, workbookSheets = [], onClose }: FormulaEditPanelProps) {
  const [formula, setFormula] = useState(`=${currentFormula}`);
  const [rationale, setRationale] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const separator = cellId.lastIndexOf('!');
  const sourceCell = { sheet: cellId.slice(0, separator), ref: cellId.slice(separator + 1) };

  const request = () => ({
    actor: { id: 'web-user', type: 'human' as const },
    rationale,
    operations: [{ type: 'setCellFormula' as const, sourceCell, formula }],
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
    if (!response.ok) {
      const validationMessage = data.validationIssues?.map((issue: { message: string }) => issue.message).join(' ')
        ?? data.preview?.validationIssues?.map((issue: { message: string }) => issue.message).join(' ');
      throw new Error(validationMessage ?? data.error ?? `Mutation request failed (${response.status})`);
    }
    return data;
  };

  const handlePreview = async () => {
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const result = await call('preview', request());
      if (result.valid === false) {
        setError(result.validationIssues?.map((issue: { message: string }) => issue.message).join(' ') ?? 'Preview invalid');
      } else {
        setPreview(result);
      }
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
      if (decision === 'commit') window.dispatchEvent(new Event('xlent:model-changed'));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${decision} failed`);
    } finally {
      setBusy(false);
    }
  };

  const unchanged = formula.trim().replace(/^=+/, '') === currentFormula;
  const blocked = !preview?.allTestsPass || preview.contractFindings.some((finding) => finding.severity === 'critical');

  const referencedSheets = formula.match(/(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_ ]*))!/g)?.map((match) => {
    const quoted = /^'([^']+)'!$/.exec(match);
    return quoted ? quoted[1] : match.slice(0, -1);
  }) ?? [];
  const unknownSheet = referencedSheets.find((sheet) => workbookSheets.length > 0 && !workbookSheets.includes(sheet));

  return (
    <section className="rounded border border-slate-700 bg-slate-950/60 p-3" aria-label={`Edit formula ${cellId}`}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Edit formula</h4>
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300">Close</button>
      </div>
      <label className="mt-2 block text-xs text-slate-400">Proposed formula
        <FormulaEditor value={formula} onChange={(next) => revise(() => setFormula(next))} rows={3} ariaLabel="Proposed formula" />
      </label>
      {unknownSheet && <p className="mt-1 text-xs text-amber-400">Unknown sheet "{unknownSheet}"</p>}
      <label className="mt-2 block text-xs text-slate-400">Rationale
        <input value={rationale} onChange={(event) => revise(() => setRationale(event.target.value))} placeholder="Why should this model change?" className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-slate-100 placeholder:text-slate-600" />
      </label>
      <button type="button" disabled={busy || unchanged || !rationale.trim()} onClick={handlePreview} className="mt-3 w-full rounded bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 disabled:cursor-not-allowed disabled:opacity-40">{busy ? 'Evaluating…' : 'Preview change'}</button>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      {preview && (
        <div className="mt-3 border-t border-slate-800 pt-3 text-xs">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400">
            <span>{preview.diff?.summary ?? 'No semantic changes.'}</span>
            <span>{preview.affectedComponents.length} components affected</span>
            <span>{preview.affectedOutputs.length} outputs affected</span>
            <span className="font-mono">Evidence {preview.previewId?.slice(0, 12)}</span>
          </div>
          {preview.testResults.length > 0 && <p className={`mt-2 ${preview.allTestsPass ? 'text-emerald-400' : 'text-red-400'}`}>Tests: {preview.testResults.filter((test) => test.status === 'pass').length}/{preview.testResults.length} passed</p>}
          {preview.testResults.filter((test) => test.status === 'fail' || test.status === 'error').map((test) => <p key={test.name} className="mt-1 text-red-300"><span className="font-medium">{test.name}:</span> {test.message ?? test.status}</p>)}
          {preview.contractFindings.map((finding) => <p key={finding.id} className={finding.severity === 'critical' ? 'mt-2 text-red-400' : 'mt-2 text-amber-400'}>{finding.explanation}</p>)}
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy || blocked} onClick={() => handleDecision('commit')} className="rounded bg-emerald-500 px-3 py-1.5 font-medium text-slate-950 disabled:opacity-40">Commit</button>
            <button type="button" disabled={busy} onClick={() => handleDecision('reject')} className="rounded border border-slate-700 px-3 py-1.5 text-slate-300 disabled:opacity-40">Reject</button>
          </div>
        </div>
      )}
    </section>
  );
}
