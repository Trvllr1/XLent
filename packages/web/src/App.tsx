import { useState } from 'react';
import { Upload } from './views/Upload.js';
import { ModelView } from './views/ModelView.js';

export type ActiveModel = {
  id: string;
  name: string;
};

export function App() {
  const [activeModel, setActiveModel] = useState<ActiveModel | null>(null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center gap-4">
        <h1 className="text-xl font-bold tracking-tight">
          <span className="text-emerald-400">X</span>Lent
        </h1>
        <span className="text-sm text-slate-500">Spreadsheets → Software</span>
        {activeModel && (
          <button
            className="ml-auto text-xs text-slate-400 hover:text-slate-200"
            onClick={() => setActiveModel(null)}
          >
            ← Upload New
          </button>
        )}
      </header>

      <main className="p-6">
        {activeModel ? (
          <ModelView modelId={activeModel.id} modelName={activeModel.name} />
        ) : (
          <Upload onImported={(id, name) => setActiveModel({ id, name })} />
        )}
      </main>
    </div>
  );
}
