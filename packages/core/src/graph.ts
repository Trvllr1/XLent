import type { ParsedWorkbook } from './parser.js';
import type { DependencyGraph, DependencyEdge } from './types.js';

/** Build a directed dependency graph from workbook formulas. */
export function buildGraph(workbook: ParsedWorkbook): DependencyGraph {
  const nodes = new Set<string>();
  const edges: DependencyEdge[] = [];

  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      const cellId = `${cell.address.sheet}!${cell.address.ref}`;
      nodes.add(cellId);

      if (cell.formula) {
        const deps = extractDependencies(cell.formula, cell.address.sheet);
        for (const dep of deps) {
          nodes.add(dep);
          edges.push({ from: dep, to: cellId });
        }
      }
    }
  }

  return { nodes: Array.from(nodes), edges };
}

/** Find all cells that have no downstream dependents (leaf outputs). */
export function findTerminalNodes(graph: DependencyGraph): string[] {
  const hasOutgoing = new Set(graph.edges.map((e) => e.from));
  return graph.nodes.filter((n) => !hasOutgoing.has(n));
}

/** Find all cells that have no upstream dependencies (root inputs). */
export function findRootNodes(graph: DependencyGraph): string[] {
  const hasIncoming = new Set(graph.edges.map((e) => e.to));
  return graph.nodes.filter((n) => !hasIncoming.has(n));
}

/** Trace the upstream dependency path from a given node. */
export function traceUpstream(graph: DependencyGraph, nodeId: string): string[] {
  const visited = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const parents = graph.edges.filter((e) => e.to === current).map((e) => e.from);
    queue.push(...parents);
  }
  visited.delete(nodeId);
  return Array.from(visited);
}

/** Detect circular dependencies. Returns arrays of node IDs forming cycles. */
export function detectCycles(graph: DependencyGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from)!.push(edge.to);
  }

  function dfs(node: string): void {
    visited.add(node);
    stack.add(node);
    path.push(node);

    for (const neighbor of adjacency.get(node) || []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (stack.has(neighbor)) {
        const cycleStart = path.indexOf(neighbor);
        cycles.push(path.slice(cycleStart));
      }
    }

    path.pop();
    stack.delete(node);
  }

  for (const node of graph.nodes) {
    if (!visited.has(node)) dfs(node);
  }

  return cycles;
}

function extractDependencies(formula: string, currentSheet: string): string[] {
  const refs: string[] = [];
  const refPattern = /(?:([A-Za-z0-9_ ]+)!)?\$?([A-Z]+)\$?(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = refPattern.exec(formula)) !== null) {
    const sheet = match[1] || currentSheet;
    refs.push(`${sheet}!${match[2]}${match[3]}`);
  }
  return [...new Set(refs)];
}
