import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ModelOutletContext } from './ModelView.js';

interface Gate {
  canAdvance: boolean;
  blockers: string[];
}

interface AssuranceData {
  current: string;
  next: string | null;
  ladder: string[];
  gate: Gate | null;
  vv: {
    tests: { verification: number; validation: number };
    findings: { verification: number; validation: number };
  };
  counts: {
    tests: number;
    autoTests: number;
    userTests: number;
    criticalFindings: number;
    evidence: number;
    hasContract: boolean;
  };
}

const LEVEL_DESC: Record<string, string> = {
  UNASSESSED: 'No evidence of validity yet',
  TESTED: 'Structural + user tests pass',
  VERIFIED: 'All tests pass, no critical findings, evidence recorded',
  VALIDATED: 'Contract declared, reconciliation clean, steward approved',
};

export function AssuranceView() {
  const { modelId, model, refreshModel } = useOutletContext<ModelOutletContext>();
  const [data, setData] = useState<AssuranceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [advanceError, setAdvanceError] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/assurance/${modelId}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, [modelId]);

  useEffect(() => { load(); }, [load]);

  const advance = async () => {
    setAdvancing(true);
    setAdvanceError(null);
    try {
      const needsApproval = data?.next === 'VALIDATED';
      const res = await fetch(`/assurance/${modelId}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stewardApproved: needsApproval }),
      });
      const d = await res.json();
      if (!res.ok) {
        setAdvanceError(d.blockers ?? [d.error ?? 'Cannot advance']);
        return;
      }
      await load();
      refreshModel();
    } finally {
      setAdvancing(false);
    }
  };

  if (loading) return <p className="text-slate-400">Evaluating assurance…</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!data) return null;

  const currentIdx = data.ladder.indexOf(data.current);
  const lastCI = (model as any)?.lastCI;

  return (
    <div className="max-w-3xl space-y-6">
      <p className="text-xs text-slate-500">
        Assurance is evidence-backed validity (Rules 8–10, 20–21), distinct from lifecycle status. A model advances one level at a time; each level has explicit gate requirements.
      </p>

      {lastCI && (
        <div className={`rounded-lg border px-4 py-3 text-xs ${lastCI.allPass ? 'border-emerald-800/50 bg-emerald-950/20' : 'border-red-800/50 bg-red-950/20'}`}>
          <p className={lastCI.allPass ? 'text-emerald-300' : 'text-red-300'}>
            Last re-import CI: {lastCI.allPass ? 'all tests passed' : `${lastCI.failures} test(s) failed`} · {lastCI.bump} change · assurance {lastCI.assuranceFrom} → {lastCI.assuranceTo}
          </p>
          <p className="text-slate-500 mt-1">{new Date(lastCI.at).toLocaleString()}</p>
        </div>
      )}

      {/* Ladder */}
      <div className="space-y-0">
        {data.ladder.map((level, i) => {
          const reached = i <= currentIdx;
          const isCurrent = i === currentIdx;
          const isNext = i === currentIdx + 1;
          return (
            <div key={level} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-3.5 h-3.5 rounded-full border-2 ${
                  reached ? 'bg-emerald-400 border-emerald-400' : isNext ? 'border-amber-400' : 'border-slate-700'
                }`} />
                {i < data.ladder.length - 1 && <div className={`w-px flex-1 ${reached ? 'bg-emerald-400/50' : 'bg-slate-800'}`} />}
              </div>
              <div className={`pb-6 ${isCurrent ? '' : 'opacity-70'}`}>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${reached ? 'text-emerald-300' : isNext ? 'text-amber-300' : 'text-slate-500'}`}>
                    {level}
                  </span>
                  {isCurrent && <span className="text-[10px] uppercase bg-emerald-900/50 text-emerald-300 px-1.5 py-0.5 rounded">current</span>}
                  {isNext && data.gate && (
                    <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${data.gate.canAdvance ? 'bg-emerald-900/50 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                      {data.gate.canAdvance ? 'gate open' : 'gated'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{LEVEL_DESC[level]}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* V&V breakdown */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 rounded-lg border border-slate-800/60 p-4">
          <p className="text-[10px] uppercase text-slate-500 mb-2">Verification <span className="normal-case text-slate-600">(does it work correctly?)</span></p>
          <p className="text-sm text-slate-200">{data.vv.tests.verification} tests · {data.vv.findings.verification} findings</p>
        </div>
        <div className="bg-slate-900 rounded-lg border border-slate-800/60 p-4">
          <p className="text-[10px] uppercase text-slate-500 mb-2">Validation <span className="normal-case text-slate-600">(does it solve the right problem?)</span></p>
          <p className="text-sm text-slate-200">{data.vv.tests.validation} tests · {data.vv.findings.validation} intent findings</p>
        </div>
      </div>

      {/* Gate blockers + advance */}
      {data.next && data.gate && (
        <div className="rounded-lg border border-slate-800 overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-3 bg-slate-900">
            <span className="text-sm font-medium text-slate-200">Advance to {data.next}</span>
            <button
              onClick={advance}
              disabled={!data.gate.canAdvance || advancing}
              className="ml-auto px-4 py-1.5 rounded-md text-sm bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {advancing ? 'Checking…' : `Advance → ${data.next}`}
            </button>
          </div>
          {!data.gate.canAdvance && data.gate.blockers.length > 0 && (
            <ul className="px-4 py-3 space-y-1.5">
              {data.gate.blockers.map((b, i) => (
                <li key={i} className="text-xs text-amber-300/90 flex gap-2">
                  <span className="text-amber-500">•</span> {b}
                </li>
              ))}
            </ul>
          )}
          {advanceError && (
            <ul className="px-4 py-3 space-y-1.5 border-t border-slate-800">
              {advanceError.map((b, i) => (
                <li key={i} className="text-xs text-red-400 flex gap-2"><span>•</span> {b}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!data.next && (
        <p className="text-sm text-emerald-300">Model is at the highest assurance level ({data.current}).</p>
      )}
    </div>
  );
}
