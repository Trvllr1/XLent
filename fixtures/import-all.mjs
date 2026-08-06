/**
 * Import all fixture workbooks into the running XLent API and run them.
 * Run: node fixtures/import-all.mjs
 */
import fs from 'fs';
import path from 'path';

const WORKBOOKS_DIR = path.join(import.meta.dirname, 'workbooks');
const API = 'http://localhost:4100';

const files = fs.readdirSync(WORKBOOKS_DIR).filter(f => f.endsWith('.xlsx'));

console.log(`Importing ${files.length} workbooks into XLent API...\n`);

const results = [];

for (const file of files) {
  const filePath = path.join(WORKBOOKS_DIR, file);
  const buffer = fs.readFileSync(filePath);

  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), file);

  const importRes = await fetch(`${API}/models/import`, { method: 'POST', body: form });
  
  if (!importRes.ok) {
    const err = await importRes.text();
    console.log(`  ✗ ${file} — IMPORT FAILED (${importRes.status}): ${err.slice(0, 120)}`);
    results.push({ file, status: 'import-failed', error: err.slice(0, 120) });
    continue;
  }

  const importData = await importRes.json();
  const model = importData.model;
  const compat = model.compatibility?.status || 'unknown';

  // Run the model
  const runRes = await fetch(`${API}/models/${model.id}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });

  if (!runRes.ok) {
    const err = await runRes.text();
    console.log(`  △ ${file} — imported (${model.parameters.length}p/${model.outputs.length}o) but RUN FAILED: ${err.slice(0, 80)}`);
    results.push({ file, status: 'run-failed', modelId: model.id, params: model.parameters.length, outputs: model.outputs.length, error: err.slice(0, 80) });
    continue;
  }

  const runData = await runRes.json();
  const outputCount = Object.keys(runData.results || {}).length;
  const numericOutputs = Object.values(runData.results || {}).filter(v => typeof v === 'number' && isFinite(v)).length;

  console.log(`  ✓ ${file}`);
  console.log(`    Model: ${model.name} (${model.slug} v${model.semver})`);
  console.log(`    Params: ${model.parameters.length} | Outputs: ${model.outputs.length} | Computed: ${numericOutputs}/${outputCount}`);
  console.log(`    Compat: ${compat} | Graph: ${model.graph.nodes.length} nodes, ${model.graph.edges.length} edges`);

  results.push({ file, status: 'ok', modelId: model.id, slug: model.slug, params: model.parameters.length, outputs: model.outputs.length, computed: numericOutputs });
}

console.log('\n─── Summary ───');
const ok = results.filter(r => r.status === 'ok');
const failed = results.filter(r => r.status !== 'ok');
console.log(`  Passed: ${ok.length}/${results.length}`);
if (failed.length > 0) {
  console.log(`  Failed: ${failed.map(f => f.file).join(', ')}`);
}
