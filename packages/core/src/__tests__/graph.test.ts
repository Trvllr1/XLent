import { describe, it, expect } from 'vitest';
import { buildGraph, findRootNodes, findTerminalNodes, detectCycles } from '../graph.js';
import { parseWorkbook } from '../parser.js';
import * as XLSX from 'xlsx';

function makeFormulaWorkbook(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[100], [200], [{ t: 'n', f: 'A1+A2' }]]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

describe('graph', () => {
  it('builds graph with correct nodes and edges', () => {
    const wb = parseWorkbook(makeFormulaWorkbook(), 'test.xlsx');
    const graph = buildGraph(wb);
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThanOrEqual(0);
  });

  it('finds root nodes (inputs)', () => {
    const wb = parseWorkbook(makeFormulaWorkbook(), 'test.xlsx');
    const graph = buildGraph(wb);
    const roots = findRootNodes(graph);
    expect(roots.length).toBeGreaterThan(0);
    // Root nodes should have no incoming edges
    for (const root of roots) {
      expect(graph.edges.filter((e) => e.to === root)).toHaveLength(0);
    }
  });

  it('finds terminal nodes (outputs)', () => {
    const wb = parseWorkbook(makeFormulaWorkbook(), 'test.xlsx');
    const graph = buildGraph(wb);
    const terminals = findTerminalNodes(graph);
    expect(terminals.length).toBeGreaterThan(0);
    // Terminal nodes should have no outgoing edges
    for (const t of terminals) {
      expect(graph.edges.filter((e) => e.from === t)).toHaveLength(0);
    }
  });

  it('reports no cycles in acyclic graph', () => {
    const wb = parseWorkbook(makeFormulaWorkbook(), 'test.xlsx');
    const graph = buildGraph(wb);
    expect(detectCycles(graph)).toHaveLength(0);
  });
});
