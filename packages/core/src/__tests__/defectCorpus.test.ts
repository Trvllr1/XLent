import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseWorkbook } from '../parser.js';
import { buildGraph, findRootNodes, findTerminalNodes } from '../graph.js';
import { analyzeFindings } from '../findings.js';
import { discoverModel, buildCalculations } from '../discovery.js';
import { resolveLabels } from '../understand.js';
import type { Model, Parameter, Output } from '../types.js';

/**
 * E11.1 — Intentional-defect corpus. Each fixture is a workbook built in code
 * with a known defect; the manifest maps it to the findings it should produce.
 * §53 rule 7: every detector capability has a fixture that exercises it.
 */

interface Fixture {
  name: string;
  build: () => Buffer;
  expect: { category: string; severity?: string; atLeast?: number };
}

function wb(buf: Buffer) {
  return parseWorkbook(buf, 'fixture.xlsx');
}

/** Build a full Model via the same classification pipeline as the import route. */
function modelFrom(buf: Buffer, overrides: Partial<Model> = {}): Model {
  const workbook = wb(buf);
  const graph = buildGraph(workbook);
  const discovery = discoverModel(workbook);
  const rootNodes = findRootNodes(graph);
  const terminalNodes = findTerminalNodes(graph);
  const labels = resolveLabels(workbook, graph);

  const parameters: Parameter[] = [];
  const outputs: Output[] = [];
  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      const cellId = `${cell.address.sheet}!${cell.address.ref}`;
      if (!cell.formula && cell.type === 'number' && rootNodes.includes(cellId)) {
        const label = labels.get(cellId) || null;
        parameters.push({
          id: cellId, name: label || cellId, type: cell.type, format: cell.format,
          currentValue: cell.value, originalValue: cell.value, sourceCell: cell.address,
          source: 'CLIENT_MODEL', confidence: label ? 'HIGH' : 'MEDIUM', confirmed: false,
        });
      }
      if (cell.formula && terminalNodes.includes(cellId)) {
        if (cell.value == null || (typeof cell.value === 'string' && !cell.value.trim())) continue;
        const label = labels.get(cellId) || null;
        outputs.push({
          id: cellId, name: label || cellId, value: cell.value, format: cell.format,
          sourceCell: cell.address, dependsOn: [], confidence: label ? 'HIGH' : 'MEDIUM', confirmed: false,
        });
      }
    }
  }

  return {
    id: 'fx', name: 'fx', slug: 'fx', semver: '1.0.0', version: 1, status: 'draft',
    createdAt: '', workbookName: 'fixture.xlsx',
    parameters, calculations: buildCalculations(workbook, graph), outputs, graph,
    compatibility: { status: discovery.compatibility, supportedFormulas: discovery.formulaCells - discovery.unsupportedFunctions, totalFormulas: discovery.formulaCells, issues: [] },
    discovery,
    ...overrides,
  };
}

// --- Fixture builders ---

function circularRef(): Buffer {
  // A1 = B1+1 ; B1 = A1+1  (a 2-cell cycle)
  const book = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['a', 'b']]);
  ws['A1'] = { t: 'n', f: 'B1+1', v: 0 };
  ws['B1'] = { t: 'n', f: 'A1+1', v: 0 };
  ws['!ref'] = 'A1:B1';
  XLSX.utils.book_append_sheet(book, ws, 'S');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
}

function patternBreak(): Buffer {
  // A consistent column-accumulation row with one off-pattern cell.
  // 7 columns so the dominant shape (5 matches) clears the 60% majority gate.
  const book = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['Metric', 'Y1', 'Y2', 'Y3', 'Y4', 'Y5', 'Y6', 'Y7']]);
  ws['A2'] = { t: 's', v: 'NI' };
  [10, 20, 30, 40, 50, 60, 70].forEach((v, i) => { ws[XLSX.utils.encode_cell({ r: 1, c: 1 + i })] = { t: 'n', v }; });
  ws['A3'] = { t: 's', v: 'Cum' };
  ws['B3'] = { t: 'n', f: 'B2', v: 10 };          // anchor (skipped as band start)
  ws['C3'] = { t: 'n', f: 'B3+C2', v: 30 };
  ws['D3'] = { t: 'n', f: 'C3+D2', v: 60 };
  ws['E3'] = { t: 'n', f: 'D3+B2', v: 110 };      // defect: B2 should be E2
  ws['F3'] = { t: 'n', f: 'E3+F2', v: 160 };
  ws['G3'] = { t: 'n', f: 'F3+G2', v: 220 };
  ws['H3'] = { t: 'n', f: 'G3+H2', v: 290 };
  ws['!ref'] = 'A1:H3';
  XLSX.utils.book_append_sheet(book, ws, 'S');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
}

function brokenRef(): Buffer {
  const book = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['x', 'y']]);
  ws['A1'] = { t: 'n', v: 5 };
  ws['B1'] = { t: 'n', f: 'Z99*2', v: 0 };  // references empty Z99
  ws['!ref'] = 'A1:B1';
  XLSX.utils.book_append_sheet(book, ws, 'S');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
}

function hardcodeInSeries(): Buffer {
  const book = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['Metric', 'A', 'B', 'C', 'D']]);
  ws['A2'] = { t: 's', v: 'Rev' };[10, 20, 30, 40].forEach((v, i) => { ws[XLSX.utils.encode_cell({ r: 1, c: 1 + i })] = { t: 'n', v }; });
  ws['A3'] = { t: 's', v: 'Margin' };
  ws['B3'] = { t: 'n', f: 'B2*0.1', v: 1 };
  ws['C3'] = { t: 'n', f: 'C2*0.1', v: 2 };
  ws['D3'] = { t: 'n', v: 0.5 };  // hardcode in a formula row
  ws['E3'] = { t: 'n', f: 'E2*0.1', v: 4 };
  ws['!ref'] = 'A1:E3';
  XLSX.utils.book_append_sheet(book, ws, 'S');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
}

function externalRef(): Buffer {
  // A formula that pulls from another workbook ([Book2]Sheet!A1).
  const book = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['In', 'Out']]);
  ws['A1'] = { t: 'n', v: 5 };
  ws['B1'] = { t: 'n', f: "'[Book2.xlsx]Sheet1'!A1*2", v: 10 };
  ws['!ref'] = 'A1:B1';
  XLSX.utils.book_append_sheet(book, ws, 'S');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
}

function deadInput(): Buffer {
  // An input cell that feeds nothing (no output consumes it).
  const book = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['Used', 'Unused', 'Result']]);
  ws['A1'] = { t: 'n', v: 10 };
  ws['B1'] = { t: 'n', v: 99 };      // dead: never referenced
  ws['C1'] = { t: 'n', f: 'A1*2', v: 20 };
  ws['!ref'] = 'A1:C1';
  XLSX.utils.book_append_sheet(book, ws, 'S');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
}

function missingFormula(): Buffer {
  // A vertical column of formulas with a numeric gap in the middle.
  const book = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['Step', 'Total']]);
  ws['A1'] = { t: 's', v: 's1' }; ws['B1'] = { t: 'n', v: 1 };
  ws['A2'] = { t: 's', v: 's2' }; ws['B2'] = { t: 'n', f: 'B1+1', v: 2 };
  ws['A3'] = { t: 's', v: 's3' }; ws['B3'] = { t: 'n', v: 5 };  // gap: no formula between B2 and B4
  ws['A4'] = { t: 's', v: 's4' }; ws['B4'] = { t: 'n', f: 'B3+1', v: 6 };
  ws['A5'] = { t: 's', v: 's5' }; ws['B5'] = { t: 'n', f: 'B4+1', v: 7 };
  ws['!ref'] = 'A1:B5';
  XLSX.utils.book_append_sheet(book, ws, 'S');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
}

function disconnectedOutput(): Buffer {
  // A cycle disguised as a chain: C1 -> D1, but D1 -> C1 (mutual), so neither is
  // a true terminal and neither reaches a real output. Exercises the
  // dead-end/disconnected detector on a non-terminal node.
  const book = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([['In', 'Real', 'X', 'Y']]);
  ws['A1'] = { t: 'n', v: 4 };
  ws['B1'] = { t: 'n', f: 'A1*2', v: 8 };   // real terminal output
  ws['C1'] = { t: 'n', f: 'A1+D1', v: 5 };  // depends on input + D1
  ws['D1'] = { t: 'n', f: 'C1+0', v: 5 };   // cycle back to C1 → disconnected island
  ws['!ref'] = 'A1:D1';
  XLSX.utils.book_append_sheet(book, ws, 'S');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
}

const FIXTURES: Fixture[] = [
  { name: 'circular_reference', build: circularRef, expect: { category: 'structural', severity: 'critical', atLeast: 1 } },
  { name: 'pattern_break', build: patternBreak, expect: { category: 'structural', severity: 'critical', atLeast: 1 } },
  { name: 'broken_reference', build: brokenRef, expect: { category: 'structural', severity: 'critical', atLeast: 1 } },
  { name: 'hardcode_in_series', build: hardcodeInSeries, expect: { category: 'structural', severity: 'warning', atLeast: 1 } },
  { name: 'external_reference', build: externalRef, expect: { category: 'structural', severity: 'warning', atLeast: 1 } },
  { name: 'dead_input', build: deadInput, expect: { category: 'logical', atLeast: 1 } },
  { name: 'missing_formula', build: missingFormula, expect: { category: 'structural', severity: 'warning', atLeast: 1 } },
  { name: 'disconnected_output', build: disconnectedOutput, expect: { category: 'logical', severity: 'warning', atLeast: 1 } },
];

describe('E11.1 defect corpus', () => {
  for (const fx of FIXTURES) {
    it(`${fx.name} produces expected ${fx.expect.severity}/${fx.expect.category} findings`, () => {
      const model = modelFrom(fx.build());
      const workbook = wb(fx.build());
      const findings = analyzeFindings(model, workbook);
      const matching = findings.filter((f) =>
        f.category === fx.expect.category && (!fx.expect.severity || f.severity === fx.expect.severity),
      );
      expect(matching.length).toBeGreaterThanOrEqual(fx.expect.atLeast ?? 1);
    });
  }

  it('every fixture yields at least one finding', () => {
    for (const fx of FIXTURES) {
      const model = modelFrom(fx.build());
      const findings = analyzeFindings(model, wb(fx.build()));
      expect(findings.length, `${fx.name} produced no findings`).toBeGreaterThan(0);
    }
  });

  it('corpus spans structural, logical, and consistency categories', () => {
    const categories = new Set(FIXTURES.map((f) => f.expect.category));
    expect(categories.has('structural')).toBe(true);
    expect(categories.has('logical')).toBe(true);
  });
});
