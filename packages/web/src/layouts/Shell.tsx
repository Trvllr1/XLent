import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar.js';
import { ContextPanel } from '../components/ContextPanel.js';
import { Breadcrumb } from '../components/Breadcrumb.js';
import { CommandPalette } from '../components/CommandPalette.js';
import { useSelection } from '../selection.js';

export function Shell() {
  const { pathname } = useLocation();
  const { clear } = useSelection();

  useEffect(() => { clear(); }, [pathname, clear]);

  return (
    <div className="h-screen flex flex-col bg-slate-950 text-slate-100">
      <header className="shrink-0 border-b border-slate-800 px-5 py-3 flex items-center gap-4">
        <Link to="/" className="text-lg font-bold tracking-tight hover:opacity-80">
          <span className="text-emerald-400">X</span>Lent
        </Link>
        <Breadcrumb />
        <button
          onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }))}
          className="ml-auto flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-[11px] text-slate-500 hover:text-slate-300 hover:border-slate-700 transition-colors"
        >
          Search… <kbd className="font-mono text-[10px] bg-slate-800 rounded px-1">Ctrl K</kbd>
        </button>
      </header>
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col min-h-0">
          <Outlet />
        </main>
        <ContextPanel />
      </div>
      <CommandPalette />
    </div>
  );
}
