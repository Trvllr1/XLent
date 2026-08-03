import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <Link to="/" className="text-xl font-bold tracking-tight hover:opacity-80">
          <span className="text-emerald-400">X</span>Lent
        </Link>
        <span className="text-sm text-slate-500">Spreadsheets → Software</span>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
