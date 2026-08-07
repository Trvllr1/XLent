/**
 * Build a workbook with a deliberate pattern-breaking formula defect:
 * a row of cumulative cash-flow cells all reference the prior column, except
 * one that references the wrong row (the constitution's =G38*F39 case).
 */
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const wb = XLSX.utils.book_new();

// Revenue row (inputs) and cumulative cash flow row (formulas across columns)
// Columns B..F = years 2025..2029
const header = [['Metric', '2025', '2026', '2027', '2028', '2029']];
const ws = XLSX.utils.aoa_to_sheet(header);

// Row 2: Revenue inputs
XLSX.utils.sheet_add_aoa(ws, [['Revenue']], { origin: 'A2' });
[100, 120, 144, 173, 208].forEach((v, i) => {
  ws[XLSX.utils.encode_cell({ r: 1, c: 1 + i })] = { t: 'n', v };
});

// Row 3: Net income inputs
XLSX.utils.sheet_add_aoa(ws, [['Net Income']], { origin: 'A3' });
[20, 25, 31, 38, 46].forEach((v, i) => {
  ws[XLSX.utils.encode_cell({ r: 2, c: 1 + i })] = { t: 'n', v };
});

// Row 4: Cumulative cash flow — each = prior col cumulative + this col NI
// Correct pattern: C4 = B4 + C3 ; D4 = C4 + D3 ; E4 = D4 + E3 ; F4 = E4 + F3
// DEFECT in E4: references B3 (wrong row) instead of D4  -> =D4+B3 should be =D4+E3
XLSX.utils.sheet_add_aoa(ws, [['Cumulative FCF']], { origin: 'A4' });
ws['B4'] = { t: 'n', f: 'B3', v: 20 };
ws['C4'] = { t: 'n', f: 'B4+C3', v: 45 };
ws['D4'] = { t: 'n', f: 'C4+D3', v: 76 };
ws['E4'] = { t: 'n', f: 'D4+B3', v: 96 };   // <-- DEFECT: B3 should be E3
ws['F4'] = { t: 'n', f: 'E4+F3', v: 142 };

// Row 6: IRR-ish output that depends on the cumulative row
XLSX.utils.sheet_add_aoa(ws, [['IRR Proxy']], { origin: 'A6' });
ws['B6'] = { t: 'n', f: 'F4/B2-1', v: 0.42 };

// --- Extra defects to exercise the §14 detectors ---
// Row 8: hardcode inside a formula series (D8 breaks the =B8*2 pattern with a literal)
XLSX.utils.sheet_add_aoa(ws, [['Margin']], { origin: 'A8' });
ws['B8'] = { t: 'n', f: 'B3/B2', v: 0.2 };
ws['C8'] = { t: 'n', f: 'C3/C2', v: 0.208 };
ws['D8'] = { t: 'n', v: 0.25 };            // <-- hardcode in a formula row
ws['E8'] = { t: 'n', f: 'E3/E2', v: 0.22 };

// Column H: broken reference (formula points at empty Z99)
XLSX.utils.sheet_add_aoa(ws, [['Check']], { origin: 'H2' });
ws['H2'] = { t: 'n', f: 'Z99*2', v: 0 };   // <-- broken ref to empty Z99

XLSX.utils.book_append_sheet(wb, ws, 'Model');

const out = path.join(import.meta.dirname, 'test_defect.xlsx');
XLSX.writeFile(wb, out);
console.log('Created:', out);

// Upload
const buf = fs.readFileSync(out);
const form = new FormData();
form.append('file', new Blob([buf]), 'test_defect.xlsx');
const res = await fetch('http://localhost:4100/models/import', { method: 'POST', body: form });
const data = await res.json();
console.log('IMPORT', res.status, 'id:', data.model?.id);

// Findings
const f = await fetch(`http://localhost:4100/findings/${data.model.id}`).then((r) => r.json());
console.log('\n=== FINDINGS (' + f.count + ') ===');
for (const finding of f.findings) {
  console.log(`\n[${finding.severity}/${finding.category}] ${finding.explanation}`);
  if (finding.observedFormula) console.log('  observed:', finding.observedFormula);
  if (finding.expectedFormula) console.log('  expected:', finding.expectedFormula);
  if (finding.likelyCause) console.log('  cause:', finding.likelyCause);
  if (finding.impactChain?.length) console.log('  chain:', finding.impactChain.join(' → '));
  if (finding.impactEstimates?.length) {
    for (const e of finding.impactEstimates) {
      console.log(`  impact: ${e.outputName} ${e.observedValue} → ${e.expectedValue} (${e.percentDelta?.toFixed(1)}%)`);
    }
  }
}
