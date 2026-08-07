import { Link, useLocation } from 'react-router-dom';
import { useModels } from '../hooks/useModels.js';

const SECTION_LABELS: Record<string, string> = {
  inputs: 'Inputs',
  outputs: 'Outputs',
  graph: 'Graph',
  sections: 'Sections',
  drivers: 'Key Drivers',
  flow: 'Data Flow',
  run: 'Run Model',
  scenarios: 'Scenarios',
  sensitivity: 'Sensitivity',
  compatibility: 'Compatibility',
  tests: 'Tests',
  provenance: 'Provenance',
  debug: 'Debug',
};

export function Breadcrumb() {
  const { pathname } = useLocation();
  const { models } = useModels();

  const segs = pathname.split('/').filter(Boolean);
  const crumbs: { label: string; to: string }[] = [{ label: 'XLent', to: '/' }];

  if (segs[0] === 'models' && segs[1]) {
    const model = models.find((m) => m.id === segs[1]);
    crumbs.push({ label: model?.name ?? 'Model', to: `/models/${segs[1]}` });
    if (segs[2]) {
      crumbs.push({ label: SECTION_LABELS[segs[2]] ?? segs[2], to: pathname });
    }
  } else if (segs[0] === 'clients') {
    crumbs.push({ label: 'Clients', to: '/clients' });
  }

  return (
    <nav className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
      {crumbs.map((c, i) => (
        <span key={c.to + i} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && <span className="text-slate-700">›</span>}
          {i === crumbs.length - 1 ? (
            <span className="text-slate-300 truncate">{c.label}</span>
          ) : (
            <Link to={c.to} className="hover:text-emerald-400 transition-colors truncate">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
