export function ConfidenceBadge({ level }: { level: string }) {
  const colors = {
    HIGH: 'text-emerald-400',
    MEDIUM: 'text-amber-400',
    LOW: 'text-red-400',
  };
  return <span className={`text-xs font-medium ${colors[level as keyof typeof colors] || 'text-slate-400'}`}>{level}</span>;
}
