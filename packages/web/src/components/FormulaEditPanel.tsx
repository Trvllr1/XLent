import { useEffect, useRef, useState } from 'react';
import { FormulaEditor } from './FormulaEditor.js';

interface SnapshotEntry {
  id: string;
  semver: string;
  message?: string;
  createdAt: string;
}

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
  const [history, setHistory] = useState<Array<{ formula: string; rationale: string }>>([{ formula: `=${currentFormula}`, rationale: '' }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [versions, setVersions] = useState<SnapshotEntry[]>([]);
  const [selectedVersion, setSelectedVersion] = useState('');
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);

  useEffect(() => { historyRef.current = history; historyIndexRef.current = historyIndex; }, [history, historyIndex]);

  useEffect(() => {
    fetch(`/snapshots/${modelId}`)
      .then((r) => r.json())
      .then((d) => setVersions(d.snapshots ?? []))
      .catch(() => setVersions([]));
  }, [modelId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
      event.preventDefault();
      const nextIndex = event.shiftKey
        ? Math.min(historyIndexRef.current + 1, historyRef.current.length - 1)
        : Math.max(historyIndexRef.current - 1, 0);
      if (nextIndex !== historyIndexRef.current) {
        const entry = historyRef.current[nextIndex];
        setHistoryIndex(nextIndex);
        setFormula(entry.formula);
        setRationale(entry.rationale);
        setPreview(null);
        setError(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const pushHistory = (nextFormula: string, nextRationale: string) => {
    const current = historyRef.current;
    const currentIndex = historyIndexRef.current;
    const next = current.slice(0, currentIndex + 1);
    next.push({ formula: nextFormula, rationale: nextRationale });
    setHistory(next);
    setHistoryIndex(next.length - 1);
  };

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

  const reviseWithHistory = (update: () => void) => {
    const previousFormula = formula;
    const previousRationale = rationale;
    revise(update);
    pushHistory(previousFormula, previousRationale);
  };

  const commitHistory = () => {
    if (formula === historyRef.current[historyIndexRef.current]?.formula) return;
    pushHistory(formula, rationale);
  };

  const loadVersion = (snapshotId: string) => {
    setSelectedVersion(snapshotId);
    fetch(`/snapshots/${modelId}/${snapshotId}`)
      .then((r) => r.json())
      .then((snapshot) => {
        const calculation = snapshot.data.calculations.find((c: any) => `${c.sourceCell.sheet}!${c.sourceCell.ref}` === cellId);
        if (calculation) {
          const nextFormula = `=${calculation.originalFormula}`;
          setFormula(nextFormula);
          setRationale(`Restore from v${snapshot.semver}`);
          setPreview(null);
          setError(null);
          pushHistory(nextFormula, `Restore from v${snapshot.semver}`);
        }
      })
      .catch(() => setError('Could not load the selected version.'));
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
        <div className="flex items-center gap-1">
          {versions.length > 0 && (
            <select value={selectedVersion} onChange={(event) => loadVersion(event.target.value)} className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[10px] text-slate-400">
              <option value="">History…</option>
              {versions.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.semver}{snapshot.message ? ` · ${snapshot.message.slice(0, 24)}` : ''}</option>)}
            </select>
          )}
          <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-300">Close</button>
        </div>
      </div>
      <p className="mt-1 text-[10px] text-slate-600">Ctrl+Z undo · Ctrl+Shift+Z redo</p>
      <label className="mt-2 block text-xs text-slate-400">Proposed formula
        <FormulaEditor value={formula} onChange={(next) => revise(() => setFormula(next))} onBlur={commitHistory} rows={3} ariaLabel="Proposed formula" />
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
