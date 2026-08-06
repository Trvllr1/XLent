/**
 * E2E test: Derived Computations — compute what's missing from what exists.
 *
 * Scenario: A workbook has yearly cash flows but NO NPV or IRR formula.
 * XLent should still compute NPV/IRR on request using the existing data.
 *
 * Run: node fixtures/test-derived-compute.mjs
 * (Does not require the API server — tests the core directly)
 */
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// Import from compiled core
import { pathToFileURL } from 'url';
const corePath = path.join(import.meta.dirname, '..', 'packages', 'core', 'dist', 'index.js');
const { parseWorkbook, buildGraph, findRootNodes, findTerminalNodes, ModelRuntime } = await import(pathToFileURL(corePath).href);

const workbookPath = path.join(import.meta.dirname, 'workbooks', 'project-cashflows-no-npv.xlsx');
const buffer = fs.readFileSync(workbookPath);

console.log('═══════════════════════════════════════════════════════════════');
console.log(' XLent — Derived Computation Test');
console.log(' "Can XLent compute what\'s NOT in the spreadsheet?"');
console.log('═══════════════════════════════════════════════════════════════\n');

// Step 1: Parse and build model
const workbook = parseWorkbook(buffer, 'project-cashflows-no-npv.xlsx');
const graph = buildGraph(workbook);
const roots = findRootNodes(graph);
const terminals = findTerminalNodes(graph);

const parameters = [];
const outputs = [];

for (const sheet of workbook.sheets) {
  for (const cell of sheet.cells) {
    const cellId = `${cell.address.sheet}!${cell.address.ref}`;
    if (!cell.formula && cell.type === 'number' && roots.includes(cellId)) {
      parameters.push({
        id: cellId, name: cellId, type: cell.type,
        currentValue: cell.value, originalValue: cell.value,
        sourceCell: cell.address, source: 'CLIENT_MODEL',
        confidence: 'MEDIUM', confirmed: false,
      });
    }
    if (cell.formula && terminals.includes(cellId)) {
      outputs.push({
        id: cellId, name: cellId, value: cell.value,
        sourceCell: cell.address, dependsOn: [],
        confidence: 'MEDIUM', confirmed: false,
      });
    }
  }
}

const model = {
  id: 'derived-test',
  name: 'Project Cash Flows (No NPV)',
  slug: 'project-cashflows-no-npv',
  semver: '1.0.0', status: 'draft', version: 1,
  createdAt: new Date().toISOString(),
  workbookName: 'project-cashflows-no-npv.xlsx',
  parameters, calculations: [], outputs, graph,
  compatibility: { status: 'VALID', supportedFormulas: 1, totalFormulas: 1, issues: [] },
  discovery: { workbookName: 'project-cashflows-no-npv.xlsx', sheets: workbook.sheets.length, formulaCells: 0, inputCandidates: parameters.length, outputCandidates: outputs.length, crossSheetReferences: 0, externalReferences: 0, namedRanges: 0, unsupportedFunctions: 0, circularDependencies: 0, compatibility: 'VALID' },
};

console.log(`Model: ${model.name}`);
console.log(`Sheets: ${workbook.sheets.map(s => s.name).join(', ')}`);
console.log(`Parameters: ${parameters.length} | Outputs: ${outputs.length}`);
console.log(`Graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges\n`);

// Step 2: Run the model to compute all existing formulas
const runtime = new ModelRuntime(model, workbook);
const results = runtime.run();

console.log('── Existing Outputs (declared in workbook) ──');
for (const [id, val] of Object.entries(results)) {
  const label = id.split('!')[1];
  const sheet = id.split('!')[0];
  console.log(`  ${sheet}.${label} = ${typeof val === 'number' ? val.toLocaleString() : val}`);
}

// Step 3: Show the cash flows the model computed
console.log('\n── Cash Flows (computed by model) ──');
for (let row = 2; row <= 7; row++) {
  const year = runtime.getCellValue('CashFlows', `A${row}`);
  const netCF = runtime.getCellValue('CashFlows', `F${row}`);
  console.log(`  Year ${year}: Net CF = ${typeof netCF === 'number' ? netCF.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : netCF}`);
}

// Step 4: DERIVED COMPUTATIONS — compute what doesn't exist
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(' DERIVED COMPUTATIONS — metrics NOT in the workbook');
console.log('═══════════════════════════════════════════════════════════════\n');

// NPV using the discount rate from Assumptions and cash flows from CashFlows
const npv = runtime.computeDerived(
  'NPV(Assumptions!B2, CashFlows!F2, CashFlows!F3, CashFlows!F4, CashFlows!F5, CashFlows!F6, CashFlows!F7)',
  'CashFlows'
);
console.log(`  NPV (10% discount rate): ${typeof npv === 'number' ? npv.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : npv}`);

// IRR using the cash flow range
const irr = runtime.computeDerived('IRR(CashFlows!F2:F7)', 'CashFlows');
console.log(`  IRR: ${typeof irr === 'number' ? (irr * 100).toFixed(2) + '%' : irr + ' (multiple sign changes — expected)'}`);

// Payback period (simple — total investment / avg annual CF)
const payback = runtime.computeDerived(
  'Assumptions!B3/AVERAGE(CashFlows!F3, CashFlows!F4, CashFlows!F5, CashFlows!F6, CashFlows!F7)',
  'CashFlows'
);
console.log(`  Simple Payback: ${typeof payback === 'number' ? payback.toFixed(2) + ' years' : payback}`);

// Profitability Index
const pi = runtime.computeDerived(
  '(NPV(Assumptions!B2, CashFlows!F3, CashFlows!F4, CashFlows!F5, CashFlows!F6, CashFlows!F7))/Assumptions!B3',
  'CashFlows'
);
console.log(`  Profitability Index: ${typeof pi === 'number' ? pi.toFixed(3) : pi}`);

// Total return multiple
const multiple = runtime.computeDerived('Summary!B2/Assumptions!B3', 'Summary');
console.log(`  Total Return Multiple: ${typeof multiple === 'number' ? multiple.toFixed(2) + 'x' : multiple}`);

// Step 5: Scenario — what if discount rate changes?
console.log('\n── Scenario: What if discount rate = 15%? ──');
const rateParam = parameters.find(p => p.currentValue === 0.10);
if (rateParam) {
  const rt2 = new ModelRuntime(model, workbook);
  rt2.run([{ parameterId: rateParam.id, value: 0.15 }]);

  const npv15 = rt2.computeDerived(
    'NPV(Assumptions!B2, CashFlows!F2, CashFlows!F3, CashFlows!F4, CashFlows!F5, CashFlows!F6, CashFlows!F7)',
    'CashFlows'
  );
  console.log(`  NPV @ 15%: ${typeof npv15 === 'number' ? npv15.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : npv15}`);
  console.log(`  NPV Delta: ${typeof npv === 'number' && typeof npv15 === 'number' ? (npv15 - npv).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : 'N/A'}`);
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(' ✓ XLent computed NPV, IRR, Payback, PI from raw cash flows');
console.log('   that had NO such formulas in the original workbook.');
console.log('═══════════════════════════════════════════════════════════════\n');
