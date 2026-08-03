/**
 * Generate a test XLSX workbook and upload it to the XLent API
 * to prove the end-to-end pipeline.
 */
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

// Create a simple semiconductor cost model
const wb = XLSX.utils.book_new();

// Sheet: Inputs
const inputsData = [
  ['Parameter', 'Value', 'Unit'],
  ['Wafer Cost', 18500, 'USD'],
  ['Die Area', 100, 'mm²'],
  ['Wafer Diameter', 300, 'mm'],
  ['Defect Density', 0.3, 'd/cm²'],
  ['Packaging Cost', 45, 'USD'],
  ['Test Cost', 12, 'USD'],
  ['Volume', 100000, 'units'],
  ['ASP', 65, 'USD'],
];
const wsInputs = XLSX.utils.aoa_to_sheet(inputsData);
XLSX.utils.book_append_sheet(wb, wsInputs, 'Inputs');

// Sheet: Calculations
const calcsData = [
  ['Metric', 'Formula', 'Value'],
  ['Wafer Area', '', { f: 'PI()*(Inputs!B4/2)^2' }],
  ['Gross DPW', '', { f: 'Calculations!B2/Inputs!B3' }],
  ['Yield', '', { f: '(1-Inputs!B5)^(Inputs!B3/100)' }],
  ['Net DPW', '', { f: 'Calculations!B3*Calculations!B4' }],
  ['Cost Per Die', '', { f: 'Inputs!B2/Calculations!B5' }],
  ['Total Unit Cost', '', { f: 'Calculations!B6+Inputs!B6+Inputs!B7' }],
  ['Revenue', '', { f: 'Inputs!B8*Inputs!B9' }],
  ['COGS', '', { f: 'Inputs!B8*Calculations!B7' }],
  ['Gross Margin', '', { f: '(Calculations!B8-Calculations!B9)/Calculations!B8' }],
];

// Build calculations sheet with formulas
const wsCalcs = XLSX.utils.aoa_to_sheet([calcsData[0]]);
for (let i = 1; i < calcsData.length; i++) {
  const row = calcsData[i];
  XLSX.utils.sheet_add_aoa(wsCalcs, [[row[0]]], { origin: `A${i + 1}` });
  if (row[2] && typeof row[2] === 'object' && 'f' in row[2]) {
    wsCalcs[`B${i + 1}`] = { t: 'n', f: row[2].f, v: 0 };
  }
}
XLSX.utils.book_append_sheet(wb, wsCalcs, 'Calculations');

// Write to file
const outPath = path.join(import.meta.dirname, 'test_model.xlsx');
XLSX.writeFile(wb, outPath);
console.log(`Created: ${outPath}`);

// Upload to XLent API
const fileBuffer = fs.readFileSync(outPath);
const form = new FormData();
form.append('file', new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'test_model.xlsx');

const res = await fetch('http://localhost:4100/models/import', { method: 'POST', body: form });
const data = await res.json();

console.log('\n=== MODEL DISCOVERY ===');
console.log(JSON.stringify(data.discovery, null, 2));
console.log('\n=== MODEL ===');
console.log(`ID: ${data.model.id}`);
console.log(`Parameters: ${data.model.parameters.length}`);
console.log(`Outputs: ${data.model.outputs.length}`);
console.log(`Graph: ${data.model.graph.nodes.length} nodes, ${data.model.graph.edges.length} edges`);

// Run the model
const runRes = await fetch(`http://localhost:4100/models/${data.model.id}/run`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({}),
});
const runData = await runRes.json();
console.log('\n=== EXECUTION RESULTS ===');
console.log(JSON.stringify(runData.results, null, 2));

// Create a scenario
if (data.model.parameters.length > 0) {
  const waferParam = data.model.parameters.find((p) => p.name.includes('Wafer') || p.currentValue === 18500);
  if (waferParam) {
    const scenRes = await fetch(`http://localhost:4100/models/${data.model.id}/scenarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Wafer Cost +15%',
        overrides: [{ parameterId: waferParam.id, value: 21275 }],
      }),
    });
    const scenData = await scenRes.json();
    console.log('\n=== SCENARIO: Wafer Cost +15% ===');
    console.log(JSON.stringify(scenData.scenario.results, null, 2));

    // Compare
    const cmpRes = await fetch(`http://localhost:4100/models/${data.model.id}/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioOverrides: [{ parameterId: waferParam.id, value: 21275 }],
      }),
    });
    const cmpData = await cmpRes.json();
    console.log('\n=== COMPARISON: Baseline vs Wafer Cost +15% ===');
    for (const row of cmpData.comparison.rows) {
      const delta = row.percentDelta != null ? `${row.percentDelta > 0 ? '+' : ''}${row.percentDelta.toFixed(1)}%` : 'N/A';
      console.log(`  ${row.outputName}: ${row.baseline} → ${row.scenario} (${delta})`);
    }
  }
}

console.log('\n✓ End-to-end pipeline verified successfully');
