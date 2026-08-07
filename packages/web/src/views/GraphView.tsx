import { useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ModelOutletContext } from './ModelView.js';
import { layoutGraph, NODE_SIZE, type LayoutNode } from '../layout.js';
import { useSelection } from '../selection.js';
import { formatExcelValue } from '../format.js';

type Role = 'input' | 'output' | 'intermediate';

const ROLE_STYLES: Record<Role, { border: string; text: string; label: string }> = {
  input: { border: 'stroke-blue-500/60', text: 'fill-blue-300', label: 'INPUT' },
  output: { border: 'stroke-emerald-500/60', text: 'fill-emerald-300', label: 'OUTPUT' },
  intermediate: { border: 'stroke-indigo-500/50', text: 'fill-indigo-300', label: 'CALC' },
};

export function GraphView() {
  const { model, modelId, understanding } = useOutletContext<ModelOutletContext>();
  const { selection, select } = useSelection();
  const graph = model.graph;
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(null);

  const layout = useMemo(() => layoutGraph(graph?.nodes ?? [], graph?.edges ?? []), [graph]);
  const pos = useMemo(() => new Map(layout.nodes.map((n) => [n.id, n])), [layout]);

  // Cell metadata from the understand report (labels, values, formats)
  const meta = useMemo(() => {
    const map = new Map<string, { label: string; value: unknown; format?: string; formula?: string }>();
    if (understanding) {
      for (const c of [...understanding.parameters, ...understanding.outputs, ...understanding.keyIntermediates]) {
        map.set(c.cellId, { label: c.label, value: c.value, format: c.format, formula: c.formula });
      }
    }
    const fanOut = new Map<string, number>();
    const fanIn = new Map<string, number>();
    for (const e of graph?.edges ?? []) {
      fanOut.set(e.from, (fanOut.get(e.from) ?? 0) + 1);
      fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1);
    }
    return { map, fanOut, fanIn };
  }, [understanding, graph]);

  const roleOf = (id: string): Role => {
    if ((meta.fanIn.get(id) ?? 0) === 0) return 'input';
    if ((meta.fanOut.get(id) ?? 0) === 0) return 'output';
    return 'intermediate';
  };

  const onWheel = (e: React.WheelEvent) => {
    const scale = Math.min(2.5, Math.max(0.15, view.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
    setView((v) => ({ ...v, scale }));
  };

  const fit = () => {
    const el = containerRef.current;
    if (!el) return;
    const s = Math.min(1.2, Math.min(el.clientWidth / layout.width, el.clientHeight / layout.height) * 0.95);
    setView({ x: 0, y: 0, scale: s });
  };

  const onMouseDown = (e: React.MouseEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.current.moved = true;
    if (!drag.current.moved) return;
    setView((v) => ({ ...v, x: drag.current!.vx + dx, y: drag.current!.vy + dy }));
  };
  const onMouseUp = () => { drag.current = null; };

  const onNodeClick = (ev: React.MouseEvent, n: LayoutNode) => {
    if (drag.current?.moved) return;
    ev.stopPropagation();
    const m = meta.map.get(n.id);
    const role = roleOf(n.id);
    select({
      modelId,
      cellId: n.id,
      label: m?.label && m.label !== n.id ? m.label : n.id,
      value: m?.value,
      format: m?.format,
      formula: m?.formula,
      role,
      fanOut: meta.fanOut.get(n.id) ?? 0,
      fanIn: meta.fanIn.get(n.id) ?? 0,
    });
  };

  if (!graph?.nodes?.length) {
    return <p className="text-slate-500 text-sm">No dependency graph available.</p>;
  }

  return (
    <div className="flex flex-col h-full min-h-0 space-y-3">
      <div className="flex items-center gap-4 text-xs text-slate-500">
        <span>{graph.nodes.length} cells · {graph.edges.length} dependencies</span>
        <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-blue-500/60 inline-block" /> Inputs</span>
        <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-indigo-500/60 inline-block" /> Calculations</span>
        <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-sm bg-emerald-500/60 inline-block" /> Outputs</span>
        <span className="ml-auto">Scroll to zoom · Drag to pan · Click a cell to inspect</span>
        <button
          onClick={fit}
          className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 hover:text-white text-[11px] transition-colors"
        >
          Fit
        </button>
      </div>

      <div
        ref={containerRef}
        className="flex-1 min-h-0 rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden cursor-grab active:cursor-grabbing"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <svg width="100%" height="100%">
          <g transform={`translate(${view.x + 24}, ${view.y + 16}) scale(${view.scale})`}>
            {graph.edges.map((e: { from: string; to: string }, i: number) => {
              const a = pos.get(e.from);
              const b = pos.get(e.to);
              if (!a || !b) return null;
              const x1 = a.x + NODE_SIZE.w;
              const y1 = a.y + NODE_SIZE.h / 2;
              const x2 = b.x;
              const y2 = b.y + NODE_SIZE.h / 2;
              const mx = (x1 + x2) / 2;
              const highlighted =
                selection && (e.from === selection.cellId || e.to === selection.cellId);
              return (
                <path
                  key={i}
                  d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                  className={highlighted ? 'stroke-emerald-400/70' : 'stroke-slate-700/60'}
                  fill="none"
                  strokeWidth={highlighted ? 1.6 : 1}
                />
              );
            })}

            {layout.nodes.map((n) => {
              const role = roleOf(n.id);
              const style = ROLE_STYLES[role];
              const isSelected = selection?.cellId === n.id;
              const m = meta.map.get(n.id);
              const title = m?.label && m.label !== n.id ? m.label : n.id;
              const subtitle = m?.value != null
                ? formatExcelValue(m.value, m.format)
                : (m?.label && m.label !== n.id ? n.id : style.label);
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x}, ${n.y})`}
                  className="cursor-pointer"
                  onClick={(ev) => onNodeClick(ev, n)}
                >
                  <rect
                    width={NODE_SIZE.w}
                    height={NODE_SIZE.h}
                    rx={6}
                    className={`fill-slate-950 ${style.border} ${isSelected ? 'stroke-emerald-400' : ''}`}
                    strokeWidth={isSelected ? 2 : 1}
                  />
                  <text x={10} y={14} className={`${style.text} font-mono`} fontSize={10}>
                    {truncate(title, 24)}
                  </text>
                  <text x={10} y={27} className="fill-slate-500 font-mono" fontSize={9}>
                    {truncate(subtitle, 26)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
