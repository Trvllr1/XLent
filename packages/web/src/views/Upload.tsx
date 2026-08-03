import { useState, useCallback } from 'react';

interface Props {
  onImported: (id: string, name: string) => void;
}

export function Upload({ onImported }: Props) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setError('Please upload an .xlsx file');
      return;
    }

    setLoading(true);
    setError(null);

    const form = new FormData();
    form.append('file', file);

    try {
      const res = await fetch('/models/import', { method: 'POST', body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Upload failed (${res.status})`);
      }
      const { model } = await res.json();
      onImported(model.id, model.name);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setLoading(false);
    }
  }, [onImported]);

  return (
    <div className="max-w-xl mx-auto mt-20">
      <div
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          dragging ? 'border-emerald-400 bg-emerald-400/5' : 'border-slate-700 hover:border-slate-500'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
      >
        {loading ? (
          <p className="text-slate-400">Parsing workbook…</p>
        ) : (
          <>
            <p className="text-lg text-slate-300 mb-2">Drop your spreadsheet here</p>
            <p className="text-sm text-slate-500 mb-4">.xlsx files supported</p>
            <label className="inline-block cursor-pointer bg-emerald-600 hover:bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg">
              Choose File
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </label>
          </>
        )}
      </div>
      {error && <p className="mt-4 text-red-400 text-sm text-center">{error}</p>}
    </div>
  );
}
