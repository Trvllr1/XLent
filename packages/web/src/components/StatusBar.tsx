export function StatusBar({ model }: { model: any }) {
  const status = model.compatibility?.status ?? 'UNKNOWN';
  const statusColor =
    status === 'VALID' ? 'text-emerald-400' : status === 'PARTIAL' ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="border-t border-slate-800 px-4 py-1.5 flex items-center gap-4 text-[11px] text-slate-500 bg-slate-900/40">
      <span className="font-mono">{model.slug ?? model.name}</span>
      <span className="font-mono">{model.semver ?? `v${model.version}`}</span>
      <span className={`font-medium ${statusColor}`}>{status}</span>
      <span>{model.parameters?.length ?? 0} inputs</span>
      <span>{model.outputs?.length ?? 0} outputs</span>
      <span className="ml-auto font-mono">{model.workbookName}</span>
    </div>
  );
}
