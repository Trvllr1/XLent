import type { DependencyGraph, ParameterImpactInfo, Parameter } from './types.js';
import type { SensitivityResult } from './sensitivity.js';

/** Trace all reachable output cells downstream of a cell (E7.2). */
export function traceDownstream(graph: DependencyGraph, cellId: string): string[] {
  const outEdges = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!outEdges.has(e.from)) outEdges.set(e.from, []);
    outEdges.get(e.from)!.push(e.to);
  }
  const seen = new Set<string>();
  const queue = [cellId];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const next of outEdges.get(cur) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return [...seen];
}

/** Compute per-parameter impact: reach count + optional sensitivity rank (E7.3). */
export function computeParameterImpact(
  graph: DependencyGraph,
  parameters: Parameter[],
  sensitivity?: SensitivityResult | null,
): ParameterImpactInfo[] {
  const terminalSet = new Set(graph.nodes.filter((n) => !graph.edges.some((e) => e.from === n)));
  const rankByParam = new Map<string, number>();
  sensitivity?.ranking.forEach((r, i) => rankByParam.set(r.parameterId, i + 1));

  return parameters.map((p) => {
    const cellId = `${p.sourceCell.sheet}!${p.sourceCell.ref}`;
    const reach = traceDownstream(graph, cellId);
    const reachCount = reach.filter((n) => terminalSet.has(n)).length;
    return {
      parameterId: p.id,
      name: p.name,
      reachCount,
      sensitivityRank: rankByParam.get(p.id),
      dead: reachCount === 0,
    };
  });
}
