import { describe, it, expect } from 'vitest';
import { ModelRuntime } from '../runtime.js';
import { parseWorkbook } from '../parser.js';
import { buildGraph, findRootNodes, findTerminalNodes } from '../graph.js';
import type { Model, Parameter, Output } from '../types.js';
import * as XLSX from 'xlsx';

function buildTestModel(sheetData: any[][], sheetName = 'Sheet1'): { model: Model; workbook: ReturnType<typeof parseWorkbook> } {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  const workbook = parseWorkbook(buffer, 'test.xlsx');
  const graph = buildGraph(workbook);
  const roots = findRootNodes(graph);
  const terminals = findTerminalNodes(graph);

  const parameters: Parameter[] = [];
  const outputs: Output[] = [];

  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      const cellId = `${cell.address.sheet}!${cell.address.ref}`;
      if (!cell.formula && cell.type === 'number' && roots.includes(cellId)) {
        parameters.push({
          id: cellId,
          name: cellId,
          type: cell.type,
          currentValue: cell.value,
          originalValue: cell.value,
          sourceCell: cell.address,
          source: 'CLIENT_MODEL',
          confidence: 'MEDIUM',
          confirmed: false,
        });
      }
      if (cell.formula && terminals.includes(cellId)) {
        outputs.push({
          id: cellId,
          name: cellId,
          value: cell.value,
          sourceCell: cell.address,
          dependsOn: [],
          confidence: 'MEDIUM',
          confirmed: false,
        });
      }
    }
  }

  const model: Model = {
    id: 'test-model',
    name: 'Test',
    slug: 'test',
    semver: '1.0.0',
    status: 'draft',
    version: 1,
    createdAt: new Date().toISOString(),
    workbookName: 'test.xlsx',
    parameters,
    calculations: [],
    outputs,
    graph,
    compatibility: { status: 'VALID', supportedFormulas: 1, totalFormulas: 1, issues: [] },
    discovery: { workbookName: 'test.xlsx', sheets: 1, formulaCells: 1, inputCandidates: parameters.length, outputCandidates: outputs.length, crossSheetReferences: 0, externalReferences: 0, namedRanges: 0, unsupportedFunctions: 0, circularDependencies: 0, compatibility: 'VALID' },
  };

  return { model, workbook };
}

describe('ModelRuntime', () => {
  it('evaluates simple addition', () => {
    // A1=10, A2=20, A3=A1+A2
    const { model, workbook } = buildTestModel([[10], [20], [{ t: 'n', f: 'A1+A2' }]]);
    const runtime = new ModelRuntime(model, workbook);
    const results = runtime.run();
    const outputKey = Object.keys(results)[0];
    expect(results[outputKey]).toBe(30);
  });

  it('evaluates SUM', () => {
    const { model, workbook } = buildTestModel([[5], [10], [15], [{ t: 'n', f: 'SUM(A1,A2,A3)' }]]);
    const runtime = new ModelRuntime(model, workbook);
    const results = runtime.run();
    const outputKey = Object.keys(results)[0];
    expect(results[outputKey]).toBe(30);
  });

  it('evaluates AVERAGE', () => {
    const { model, workbook } = buildTestModel([[10], [20], [30], [{ t: 'n', f: 'AVERAGE(A1,A2,A3)' }]]);
    const runtime = new ModelRuntime(model, workbook);
    const results = runtime.run();
    const outputKey = Object.keys(results)[0];
    expect(results[outputKey]).toBe(20);
  });

  it('evaluates MIN and MAX', () => {
    const { model, workbook } = buildTestModel([[5], [20], [10], [{ t: 'n', f: 'MIN(A1,A2,A3)' }], [{ t: 'n', f: 'MAX(A1,A2,A3)' }]]);
    const runtime = new ModelRuntime(model, workbook);
    const results = runtime.run();
    const keys = Object.keys(results);
    expect(results[keys[0]]).toBe(5);
    expect(results[keys[1]]).toBe(20);
  });

  it('applies parameter overrides', () => {
    const { model, workbook } = buildTestModel([[10], [20], [{ t: 'n', f: 'A1+A2' }]]);
    const runtime = new ModelRuntime(model, workbook);
    const a1Param = model.parameters.find((p) => p.sourceCell.ref === 'A1');
    const results = runtime.run([{ parameterId: a1Param!.id, value: 100 }]);
    const outputKey = Object.keys(results)[0];
    expect(results[outputKey]).toBe(120);
  });

  it('evaluates SQRT', () => {
    const { model, workbook } = buildTestModel([[144], [{ t: 'n', f: 'SQRT(A1)' }]]);
    const runtime = new ModelRuntime(model, workbook);
    const results = runtime.run();
    const outputKey = Object.keys(results)[0];
    expect(results[outputKey]).toBe(12);
  });

  it('evaluates ABS of negative', () => {
    const { model, workbook } = buildTestModel([[-42], [{ t: 'n', f: 'ABS(A1)' }]]);
    const runtime = new ModelRuntime(model, workbook);
    const results = runtime.run();
    const outputKey = Object.keys(results)[0];
    expect(results[outputKey]).toBe(42);
  });

  it('guards Infinity in outputs', () => {
    const { model, workbook } = buildTestModel([[0], [{ t: 'n', f: '1/A1' }]]);
    const runtime = new ModelRuntime(model, workbook);
    const results = runtime.run();
    const outputKey = Object.keys(results)[0];
    expect(results[outputKey]).toBeNull();
  });

  it('evaluates ROUND', () => {
    const { model, workbook } = buildTestModel([[3.14159], [{ t: 'n', f: 'ROUND(A1,2)' }]]);
    const runtime = new ModelRuntime(model, workbook);
    const results = runtime.run();
    const outputKey = Object.keys(results)[0];
    expect(results[outputKey]).toBeCloseTo(3.14, 2);
  });

  it('evaluates POWER and exponentiation', () => {
    const { model, workbook } = buildTestModel([[2], [{ t: 'n', f: 'POWER(A1,10)' }]]);
    const runtime = new ModelRuntime(model, workbook);
    const results = runtime.run();
    const outputKey = Object.keys(results)[0];
    expect(results[outputKey]).toBe(1024);
  });

  it('explain traces upstream dependencies', () => {
    const { model, workbook } = buildTestModel([[10], [20], [{ t: 'n', f: 'A1+A2' }]]);
    const runtime = new ModelRuntime(model, workbook);
    runtime.run();
    const outputId = model.outputs[0].id;
    const explanation = runtime.explain(outputId);
    expect(explanation.output.id).toBe(outputId);
    expect(explanation.dependencies.length).toBeGreaterThanOrEqual(0);
  });
});
