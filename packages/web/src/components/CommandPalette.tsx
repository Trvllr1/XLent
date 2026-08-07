import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useModels, type ModelSummary } from '../hooks/useModels.js';

interface Command {
  id: string;
  label: string;
  hint?: string;
  action: () => void;
}

const MODEL_SECTIONS = [
  ['', 'Overview'],
  ['inputs', 'Inputs'],
  ['outputs', 'Outputs'],
  ['graph', 'Graph'],
  ['sections', 'Sections'],
  ['drivers', 'Key Drivers'],
  ['flow', 'Data Flow'],
  ['run', 'Run Model'],
  ['scenarios', 'Scenarios'],
  ['sensitivity', 'Sensitivity'],
  ['compatibility', 'Compatibility'],
  ['tests', 'Tests'],
  ['contract', 'Contract'],
  ['assurance', 'Assurance'],
  ['provenance', 'Provenance'],
  ['debug', 'Debug'],
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { models } = useModels();

  const activeModel = useMemo(() => {
    const m = pathname.match(/^\/models\/([^/]+)/);
    return m ? models.find((mo: ModelSummary) => mo.id === m[1]) : undefined;
  }, [pathname, models]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery('');
        setIndex(0);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];
    for (const m of models) {
      cmds.push({
        id: `model:${m.id}`,
        label: m.name,
        hint: `${m.workbookName} · v${m.version}`,
        action: () => navigate(`/models/${m.id}`),
      });
    }
    if (activeModel) {
      for (const [seg, label] of MODEL_SECTIONS) {
        cmds.push({
          id: `view:${seg || 'overview'}`,
          label: `${activeModel.name} → ${label}`,
          hint: 'Go to view',
          action: () => navigate(`/models/${activeModel.id}${seg ? `/${seg}` : ''}`),
        });
      }
    }
    cmds.push({ id: 'home', label: 'All Models', hint: 'Home', action: () => navigate('/') });
    cmds.push({ id: 'clients', label: 'Client Registry', hint: 'Deliver', action: () => navigate('/clients') });
    return cmds;
  }, [models, activeModel, navigate]);

  const filtered = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return commands.slice(0, 12);
    return commands
      .filter((c) => {
        const hay = `${c.label} ${c.hint ?? ''}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      })
      .slice(0, 12);
  }, [commands, query]);

  useEffect(() => { setIndex(0); }, [query]);

  if (!open) return null;

  const pick = (c: Command) => {
    setOpen(false);
    c.action();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-start justify-center pt-24"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, filtered.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
            else if (e.key === 'Enter' && filtered[index]) pick(filtered[index]);
          }}
          placeholder="Jump to a model or view…"
          className="w-full bg-transparent px-4 py-3 text-sm text-slate-100 placeholder-slate-600 outline-none border-b border-slate-800"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-600">No matches</li>
          )}
          {filtered.map((c, i) => (
            <li key={c.id}>
              <button
                onMouseEnter={() => setIndex(i)}
                onClick={() => pick(c)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left text-sm transition-colors ${
                  i === index ? 'bg-emerald-500/10 text-emerald-300' : 'text-slate-300'
                }`}
              >
                <span className="flex-1 truncate">{c.label}</span>
                {c.hint && <span className="text-xs text-slate-600 shrink-0">{c.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="px-4 py-2 border-t border-slate-800 flex gap-4 text-[10px] text-slate-600">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
