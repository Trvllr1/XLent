import { describe, it, expect } from 'vitest';
import { ModelRuntime } from '../runtime.js';
import { parseWorkbook } from '../parser.js';
import { buildGraph, findRootNodes, findTerminalNodes } from '../graph.js';
import type { Model, Parameter, Output } from '../types.js';
import * as XLSX from 'xlsx';

function buildTestModel(sheets: { name: string; data: any[][] }[]): { model: Model; workbook: ReturnType<typeof parseWorkbook> } {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.data);
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
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
    id: 'test-derived',
    name: 'Test Derived',
    slug: 'test-derived',
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
    discovery: { workbookName: 'test.xlsx', sheets: 1, formulaCells: 0, inputCandidates: parameters.length, outputCandidates: outputs.length, crossSheetReferences: 0, externalReferences: 0, namedRanges: 0, unsupportedFunctions: 0, circularDependencies: 0, compatibility: 'VALID' },
  };

  return { model, workbook };
}

describe('Derived Computations — compute what is missing from what exists', () => {
  it('computes NPV from cash flows that exist in the workbook but have no NPV formula', () => {
    // Workbook has: discount rate in A1, cash flows in A2:A6 — but no NPV formula anywhere
    const { model, workbook } = buildTestModel([{
      name: 'CashFlows',
      data: [
        [0.10],      // A1 = discount rate
        [-100000],   // A2 = initial investment
        [30000],     // A3 = year 1
        [40000],     // A4 = year 2
        [45000],     // A5 = year 3
        [50000],     // A6 = year 4
      ],
    }]);

    const runtime = new ModelRuntime(model, workbook);
    runtime.run();

    // No NPV output exists in the model
    expect(model.outputs.length).toBe(0);

    // But XLent CAN compute it on request using what's there
    const npv = runtime.computeDerived('NPV(A1, A2, A3, A4, A5, A6)', 'CashFlows');
    expect(typeof npv).toBe('number');

    // Manual NPV: sum of cf[i]/(1+r)^(i+1) for i=0..4
    const r = 0.10;
    const cfs = [-100000, 30000, 40000, 45000, 50000];
    const expected = cfs.reduce((acc, cf, i) => acc + cf / Math.pow(1 + r, i + 1), 0);
    expect(npv).toBeCloseTo(expected, 2);
  });

  it('computes IRR from raw cash flows with no IRR formula in workbook', () => {
    const { model, workbook } = buildTestModel([{
      name: 'Project',
      data: [
        [-500000],  // A1 = initial outlay
        [150000],   // A2 = year 1
        [180000],   // A3 = year 2
        [200000],   // A4 = year 3
        [175000],   // A5 = year 4
      ],
    }]);

    const runtime = new ModelRuntime(model, workbook);
    runtime.run();

    // IRR expects a range, not individual cells (Excel convention)
    const irr = runtime.computeDerived('IRR(A1:A5)', 'Project');
    expect(typeof irr).toBe('number');
    // IRR should be around 14-16% for this cash flow pattern
    expect(irr as number).toBeGreaterThan(0.10);
    expect(irr as number).toBeLessThan(0.25);
  });

  it('computes derived gross margin from revenue/COGS cells with no margin formula', () => {
    // Workbook has revenue and COGS but no margin calculation
    const { model, workbook } = buildTestModel([{
      name: 'PnL',
      data: [
        [5000000],   // A1 = revenue
        [3200000],   // A2 = COGS
      ],
    }]);

    const runtime = new ModelRuntime(model, workbook);
    runtime.run();

    const margin = runtime.computeDerived('(A1-A2)/A1', 'PnL');
    expect(margin).toBeCloseTo(0.36, 4);
  });

  it('computes derived metric using cross-sheet data', () => {
    // Sheet1 has unit cost, Sheet2 has ASP — no margin formula exists
    const { model, workbook } = buildTestModel([
      { name: 'Costs', data: [[42]] },     // Costs!A1 = unit cost
      { name: 'Revenue', data: [[89]] },   // Revenue!A1 = ASP
    ]);

    const runtime = new ModelRuntime(model, workbook);
    runtime.run();

    const contributionMargin = runtime.computeDerived('(Revenue!A1-Costs!A1)/Revenue!A1', 'Costs');
    expect(contributionMargin).toBeCloseTo((89 - 42) / 89, 6);
  });

  it('computes derived metric after scenario override changes inputs', () => {
    const { model, workbook } = buildTestModel([{
      name: 'Deal',
      data: [
        [0.12],     // A1 = discount rate
        [-200000],  // A2 = investment
        [80000],    // A3 = year 1
        [90000],    // A4 = year 2
        [110000],   // A5 = year 3
      ],
    }]);

    const runtime = new ModelRuntime(model, workbook);

    // Override discount rate from 12% to 8%
    const rateParam = model.parameters.find(p => (p.currentValue as number) === 0.12);
    runtime.run([{ parameterId: rateParam!.id, value: 0.08 }]);

    const npv = runtime.computeDerived('NPV(A1, A2, A3, A4, A5)', 'Deal');
    expect(typeof npv).toBe('number');

    // With 8% rate, NPV should be higher than with 12%
    const r = 0.08;
    const cfs = [-200000, 80000, 90000, 110000];
    const expected = cfs.reduce((acc, cf, i) => acc + cf / Math.pow(1 + r, i + 1), 0);
    expect(npv).toBeCloseTo(expected, 2);
  });

  it('computes PMT (loan payment) from existing loan parameters', () => {
    // Workbook has loan terms but no PMT formula
    const { model, workbook } = buildTestModel([{
      name: 'Loan',
      data: [
        [0.005],    // A1 = monthly rate (6% annual / 12)
        [360],      // A2 = nper (30 years * 12)
        [500000],   // A3 = principal
      ],
    }]);

    const runtime = new ModelRuntime(model, workbook);
    runtime.run();

    const pmt = runtime.computeDerived('PMT(A1, A2, A3)', 'Loan');
    expect(typeof pmt).toBe('number');
    // Monthly payment on $500k at 6% for 30yr ≈ -$2,997
    expect(pmt as number).toBeCloseTo(-2997.75, 0);
  });

  it('returns formula error for invalid derived expression', () => {
    const { model, workbook } = buildTestModel([{
      name: 'Sheet1',
      data: [[0]],
    }]);

    const runtime = new ModelRuntime(model, workbook);
    runtime.run();

    // Division by zero returns Excel-style error
    const result = runtime.computeDerived('1/A1', 'Sheet1');
    expect(result).toBe('#DIV/0!');
  });

  it('computes breakeven from existing cost/price data with no breakeven formula', () => {
    // Fixed costs, variable cost per unit, price per unit — no breakeven formula
    const { model, workbook } = buildTestModel([{
      name: 'Economics',
      data: [
        [2500000],  // A1 = fixed costs
        [35],       // A2 = variable cost per unit
        [89],       // A3 = price per unit
      ],
    }]);

    const runtime = new ModelRuntime(model, workbook);
    runtime.run();

    const breakeven = runtime.computeDerived('A1/(A3-A2)', 'Economics');
    expect(breakeven).toBeCloseTo(2500000 / (89 - 35), 2);
  });
});
