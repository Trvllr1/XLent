import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useModels } from '../hooks/useModels.js';
import {
  IconGrid, IconInputs, IconOutputs, IconGraph, IconLayers, IconGauge,
  IconFlow, IconPlay, IconShield, IconTrace, IconChevronLeft, IconUsers, IconSheet,
} from './icons.js';

const COLLAPSED_KEY = 'xlent.sidebar.collapsed';

interface NavItem {
  to: string;
  label: string;
  icon: (p: { className?: string }) => React.ReactElement;
  end?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

function statusDot(status: string): string {
  if (status === 'VALID') return 'bg-emerald-400';
  if (status === 'PARTIAL') return 'bg-amber-400';
  return 'bg-red-400';
}

export function Sidebar() {
  const { pathname } = useLocation();
  const { models } = useModels();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSED_KEY) === '1');

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const modelMatch = pathname.match(/^\/models\/([^/]+)/);
  const modelId = modelMatch?.[1];
  const model = modelId ? models.find((m) => m.id === modelId) : undefined;

  const groups: NavGroup[] = modelId
    ? [
        {
          title: 'Inspect',
          items: [
            { to: `/models/${modelId}`, label: 'Overview', icon: IconGrid, end: true },
            { to: `/models/${modelId}/inputs`, label: 'Inputs', icon: IconInputs },
            { to: `/models/${modelId}/outputs`, label: 'Outputs', icon: IconOutputs },
            { to: `/models/${modelId}/graph`, label: 'Graph', icon: IconGraph },
          ],
        },
        {
          title: 'Understand',
          items: [
            { to: `/models/${modelId}/sections`, label: 'Sections', icon: IconLayers },
            { to: `/models/${modelId}/drivers`, label: 'Key Drivers', icon: IconGauge },
            { to: `/models/${modelId}/flow`, label: 'Data Flow', icon: IconFlow },
          ],
        },
        {
          title: 'Execute',
          items: [
            { to: `/models/${modelId}/run`, label: 'Run Model', icon: IconPlay },
            { to: `/models/${modelId}/scenarios`, label: 'Scenarios', icon: IconLayers },
            { to: `/models/${modelId}/sensitivity`, label: 'Sensitivity', icon: IconGauge },
          ],
        },
        {
          title: 'Assure',
          items: [
            { to: `/models/${modelId}/compatibility`, label: 'Compatibility', icon: IconShield },
            { to: `/models/${modelId}/tests`, label: 'Tests', icon: IconGauge },
          ],
        },
        {
          title: 'Trace',
          items: [{ to: `/models/${modelId}/provenance`, label: 'Provenance', icon: IconTrace }],
        },
      ]
    : [];

  return (
    <aside
      className={`shrink-0 border-r border-slate-800 bg-slate-900/60 flex flex-col transition-[width] duration-200 ${
        collapsed ? 'w-14' : 'w-60'
      }`}
    >
      <div className="flex-1 overflow-y-auto py-3">
        {modelId ? (
          <>
            <div className={collapsed ? 'px-2' : 'px-3'}>
              <Link
                to="/"
                title="All models"
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-emerald-400 transition-colors mb-3"
              >
                <IconChevronLeft className="w-3.5 h-3.5 shrink-0" />
                {!collapsed && <span>All models</span>}
              </Link>
              {!collapsed && (
                <div className="flex items-center gap-2 px-2 py-2 mb-2">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(model?.compatibility.status ?? '')}`} />
                  <span className="text-sm font-semibold text-slate-100 truncate">
                    {model?.name ?? 'Model'}
                  </span>
                  {model && <span className="text-[10px] text-slate-500 shrink-0">v{model.version}</span>}
                </div>
              )}
            </div>
            {groups.map((g) => (
              <div key={g.title} className="mt-4">
                {!collapsed && (
                  <p className="px-5 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                    {g.title}
                  </p>
                )}
                <nav className="space-y-0.5 px-2">
                  {g.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      title={item.label}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                          isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-400 -ml-0.5 pl-3'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                        }`
                      }
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </NavLink>
                  ))}
                </nav>
              </div>
            ))}
          </>
        ) : (
          <div>
            {!collapsed && (
              <p className="px-5 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Models
              </p>
            )}
            <nav className="space-y-0.5 px-2">
              {models.map((m) => (
                <NavLink
                  key={m.id}
                  to={`/models/${m.id}`}
                  title={m.name}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-400 border-l-2 border-emerald-400 -ml-0.5 pl-3'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                    }`
                  }
                >
                  <IconSheet className="w-4 h-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="truncate flex-1">{m.name}</span>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot(m.compatibility.status)}`} />
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </div>

      <div className="border-t border-slate-800 p-2 space-y-0.5">
        <NavLink
          to="/clients"
          title="Clients"
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
              isActive
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`
          }
        >
          <IconUsers className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Clients</span>}
        </NavLink>
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-full flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
        >
          <IconChevronLeft className={`w-4 h-4 shrink-0 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
}
