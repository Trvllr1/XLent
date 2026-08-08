import type { ParsedWorkbook } from './parser.js';
import type { DependencyGraph, DependencyEdge } from './types.js';
import { parseFormula } from './ast/index.js';
import type { ASTNode } from './ast/index.js';

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

/** Extract canonical cell references from a formula (AST-first, regex fallback). */
export function extractDependencies(formula: string, currentSheet: string): string[] {
  try {
    const ast = parseFormula(formula);
    const refs: string[] = [];
    walkRefs(ast, currentSheet, refs);
    return [...new Set(refs)];
  } catch {
    // Fallback to regex if parsing fails
    const refs: string[] = [];
    const refPattern = /(?:([A-Za-z0-9_ ]+)!)?\$?([A-Z]+)\$?(\d+)/g;
    let match: RegExpExecArray | null;
    while ((match = refPattern.exec(formula)) !== null) {
      const sheet = match[1] || currentSheet;
      refs.push(`${sheet}!${match[2]}${match[3]}`);
    }
    return [...new Set(refs)];
  }
}

function walkRefs(node: ASTNode, currentSheet: string, refs: string[]): void {
  switch (node.type) {
    case 'cell':
      refs.push(`${node.sheet || currentSheet}!${node.col}${node.row}`);
      break;
    case 'range': {
      // Expand range to individual cell references
      const sheet = node.start.sheet || currentSheet;
      const sc = colIdx(node.start.col);
      const ec = colIdx(node.end.col);
      for (let row = node.start.row; row <= node.end.row; row++) {
        for (let c = sc; c <= ec; c++) {
          refs.push(`${sheet}!${idxCol(c)}${row}`);
        }
      }
      break;
    }
    case 'binary':
      walkRefs(node.left, currentSheet, refs);
      walkRefs(node.right, currentSheet, refs);
      break;
    case 'unary':
      walkRefs(node.operand, currentSheet, refs);
      break;
    case 'function':
      for (const arg of node.args) walkRefs(arg, currentSheet, refs);
      break;
    case 'array':
      for (const row of node.rows) for (const el of row) walkRefs(el, currentSheet, refs);
      break;
  }
}

function colIdx(col: string): number {
  let idx = 0;
  for (let i = 0; i < col.length; i++) idx = idx * 26 + (col.charCodeAt(i) - 64);
  return idx;
}

function idxCol(idx: number): string {
  let col = '';
  while (idx > 0) { const r = (idx - 1) % 26; col = String.fromCharCode(65 + r) + col; idx = Math.floor((idx - 1) / 26); }
  return col;
}
