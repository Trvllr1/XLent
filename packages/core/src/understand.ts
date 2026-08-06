import type { ParsedWorkbook, ParsedSheet } from './parser.js';
import type { DependencyGraph } from './types.js';

export interface LabeledCell {
  cellId: string;
  label: string;
  value: unknown;
  formula?: string;
  role: 'parameter' | 'intermediate' | 'output';
  fanOut: number; // how many cells depend on this
  fanIn: number;  // how many cells this depends on
}

export interface ModelUnderstanding {
  name: string;
  sheets: string[];
  sections: ModelSection[];
  keyIntermediates: LabeledCell[];
  parameters: LabeledCell[];
  outputs: LabeledCell[];
}

export interface ModelSection {
  sheet: string;
  title: string;
  startRow: number;
  endRow: number;
  cells: LabeledCell[];
}

/**
 * Resolve human-readable labels for cells by inspecting adjacent text.
 * Handles common spreadsheet patterns:
 * - A-column label for B-column value (row-label pattern)
 * - Header row above columnar data
 */
export function resolveLabels(workbook: ParsedWorkbook, graph: DependencyGraph): Map<string, string> {
  const labels = new Map<string, string>();

  for (const sheet of workbook.sheets) {
    const cellMap = new Map<string, { value: unknown; type: string }>();
    for (const cell of sheet.cells) {
      cellMap.set(cell.address.ref, { value: cell.value, type: cell.type });
    }

    for (const cell of sheet.cells) {
      const ref = cell.address.ref;
      const col = ref.replace(/[0-9]/g, '');
      const row = parseInt(ref.replace(/[A-Z]/g, ''), 10);
      const cellId = `${sheet.name}!${ref}`;

      // Skip if cell itself is a text label
      if (cell.type === 'string' && !cell.formula) continue;

      // Pattern 1: look left for a text label (A-col label, B-col value)
      if (col !== 'A') {
        const leftCol = String.fromCharCode(col.charCodeAt(0) - 1);
        const leftRef = `${leftCol}${row}`;
        const leftCell = cellMap.get(leftRef);
        if (leftCell && leftCell.type === 'string' && typeof leftCell.value === 'string' && leftCell.value.trim()) {
          labels.set(cellId, cleanLabel(leftCell.value));
          continue;
        }
      }

      // Pattern 2: look up for a header row
      if (row > 1) {
        const aboveRef = `${col}${row - 1}`;
        const aboveCell = cellMap.get(aboveRef);
        if (aboveCell && aboveCell.type === 'string' && typeof aboveCell.value === 'string' && aboveCell.value.trim()) {
          labels.set(cellId, cleanLabel(aboveCell.value));
        }
      }
    }
  }

  return labels;
}

/**
 * Identify semantically significant intermediate cells.
 * An intermediate is "significant" if it has high fan-out (many cells depend on it)
 * or if it's a labeled formula cell that's not a leaf.
 */
export function findSignificantIntermediates(
  workbook: ParsedWorkbook,
  graph: DependencyGraph,
  labels: Map<string, string>,
  minFanOut = 2,
): LabeledCell[] {
  const fanOutMap = new Map<string, number>();
  const fanInMap = new Map<string, number>();

  for (const edge of graph.edges) {
    fanOutMap.set(edge.from, (fanOutMap.get(edge.from) || 0) + 1);
    fanInMap.set(edge.to, (fanInMap.get(edge.to) || 0) + 1);
  }

  const terminals = new Set(
    graph.nodes.filter(n => !fanOutMap.has(n) || fanOutMap.get(n) === 0)
  );
  const roots = new Set(
    graph.nodes.filter(n => !fanInMap.has(n) || fanInMap.get(n) === 0)
  );

  const intermediates: LabeledCell[] = [];

  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      if (!cell.formula) continue;
      const cellId = `${cell.address.sheet}!${cell.address.ref}`;

      // Must be an intermediate (not root, not terminal)
      if (terminals.has(cellId) || roots.has(cellId)) continue;

      const fanOut = fanOutMap.get(cellId) || 0;
      const fanIn = fanInMap.get(cellId) || 0;
      const label = labels.get(cellId);

      // Significant if: high fan-out OR has a human label
      if (fanOut >= minFanOut || label) {
        intermediates.push({
          cellId,
          label: label || cellId,
          value: cell.value,
          formula: cell.formula,
          role: 'intermediate',
          fanOut,
          fanIn,
        });
      }
    }
  }

  // Sort by fan-out (most influential first)
  intermediates.sort((a, b) => b.fanOut - a.fanOut);
  return intermediates;
}

/**
 * Produce a full "Understand" report for a model.
 */
export function understandModel(
  workbook: ParsedWorkbook,
  graph: DependencyGraph,
): ModelUnderstanding {
  const labels = resolveLabels(workbook, graph);
  const keyIntermediates = findSignificantIntermediates(workbook, graph, labels);

  const fanOutMap = new Map<string, number>();
  const fanInMap = new Map<string, number>();
  for (const edge of graph.edges) {
    fanOutMap.set(edge.from, (fanOutMap.get(edge.from) || 0) + 1);
    fanInMap.set(edge.to, (fanInMap.get(edge.to) || 0) + 1);
  }

  const terminals = new Set(graph.nodes.filter(n => !fanOutMap.has(n)));
  const roots = new Set(graph.nodes.filter(n => !fanInMap.has(n)));

  const parameters: LabeledCell[] = [];
  const outputs: LabeledCell[] = [];

  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      const cellId = `${cell.address.sheet}!${cell.address.ref}`;
      const label = labels.get(cellId) || cellId;
      const fanOut = fanOutMap.get(cellId) || 0;
      const fanIn = fanInMap.get(cellId) || 0;

      if (!cell.formula && cell.type === 'number' && roots.has(cellId)) {
        parameters.push({ cellId, label, value: cell.value, role: 'parameter', fanOut, fanIn });
      }
      if (cell.formula && terminals.has(cellId)) {
        outputs.push({ cellId, label, value: cell.value, formula: cell.formula, role: 'output', fanOut, fanIn });
      }
    }
  }

  // Detect sections (rows with bold-like labels and no value)
  const sections = detectSections(workbook, graph, labels, fanOutMap, fanInMap);

  return {
    name: workbook.name,
    sheets: workbook.sheets.map(s => s.name),
    sections,
    keyIntermediates,
    parameters: parameters.sort((a, b) => b.fanOut - a.fanOut),
    outputs,
  };
}

function detectSections(
  workbook: ParsedWorkbook,
  graph: DependencyGraph,
  labels: Map<string, string>,
  fanOutMap: Map<string, number>,
  fanInMap: Map<string, number>,
): ModelSection[] {
  const sections: ModelSection[] = [];

  for (const sheet of workbook.sheets) {
    // Find rows that are section headers: A-column text with no adjacent numeric value
    const rowData = new Map<number, { hasLabel: boolean; labelText: string; hasCells: boolean }>();

    for (const cell of sheet.cells) {
      const row = parseInt(cell.address.ref.replace(/[A-Z]/g, ''), 10);
      const col = cell.address.ref.replace(/[0-9]/g, '');

      if (!rowData.has(row)) rowData.set(row, { hasLabel: false, labelText: '', hasCells: false });
      const rd = rowData.get(row)!;

      if (col === 'A' && cell.type === 'string' && typeof cell.value === 'string') {
        rd.hasLabel = true;
        rd.labelText = cell.value.trim();
      }
      if (col !== 'A' && (cell.type === 'number' || cell.formula)) {
        rd.hasCells = true;
      }
    }

    // Section headers: row has label in A but no numeric/formula cells in other cols
    const sectionRows: { row: number; title: string }[] = [];
    for (const [row, rd] of rowData) {
      if (rd.hasLabel && !rd.hasCells && rd.labelText.length > 2) {
        sectionRows.push({ row, title: rd.labelText });
      }
    }
    sectionRows.sort((a, b) => a.row - b.row);

    for (let i = 0; i < sectionRows.length; i++) {
      const start = sectionRows[i].row;
      const end = i < sectionRows.length - 1 ? sectionRows[i + 1].row - 1 : 9999;

      const cells: LabeledCell[] = [];
      for (const cell of sheet.cells) {
        const row = parseInt(cell.address.ref.replace(/[A-Z]/g, ''), 10);
        if (row <= start || row > end) continue;
        if (cell.type !== 'number' && !cell.formula) continue;

        const cellId = `${sheet.name}!${cell.address.ref}`;
        const label = labels.get(cellId) || cellId;
        const fanOut = fanOutMap.get(cellId) || 0;
        const fanIn = fanInMap.get(cellId) || 0;
        const role = fanIn === 0 ? 'parameter' : (fanOut === 0 ? 'output' : 'intermediate');

        cells.push({ cellId, label, value: cell.value, formula: cell.formula, role: role as any, fanOut, fanIn });
      }

      if (cells.length > 0) {
        sections.push({ sheet: sheet.name, title: sectionRows[i].title, startRow: start, endRow: end, cells });
      }
    }
  }

  return sections;
}

function cleanLabel(raw: string): string {
  return raw.replace(/[=:]+\s*$/, '').trim();
}
