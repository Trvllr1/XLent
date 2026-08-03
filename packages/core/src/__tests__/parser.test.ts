import { describe, it, expect } from 'vitest';
import { parseWorkbook } from '../parser.js';
import * as XLSX from 'xlsx';

function makeTestWorkbook(sheets: Record<string, Record<string, any>>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, data] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(
      Object.entries(data).reduce((grid, [ref, val]) => {
        const col = ref.replace(/\d+/g, '').charCodeAt(0) - 65;
        const row = parseInt(ref.replace(/[A-Z]+/g, '')) - 1;
        while (grid.length <= row) grid.push([]);
        while (grid[row].length <= col) grid[row].push(undefined);
        grid[row][col] = val;
        return grid;
      }, [] as any[][]),
    );
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

describe('parseWorkbook', () => {
  it('extracts numeric cells', () => {
    const buf = makeTestWorkbook({ Sheet1: { A1: 10, B1: 20 } });
    const wb = parseWorkbook(buf, 'test.xlsx');
    expect(wb.sheets).toHaveLength(1);
    expect(wb.sheets[0].cells.length).toBeGreaterThanOrEqual(2);
    const a1 = wb.sheets[0].cells.find((c) => c.address.ref === 'A1');
    expect(a1?.value).toBe(10);
    expect(a1?.type).toBe('number');
  });

  it('extracts string cells', () => {
    const buf = makeTestWorkbook({ Sheet1: { A1: 'Label' } });
    const wb = parseWorkbook(buf, 'test.xlsx');
    const a1 = wb.sheets[0].cells.find((c) => c.address.ref === 'A1');
    expect(a1?.value).toBe('Label');
    expect(a1?.type).toBe('string');
  });

  it('sets workbook filename', () => {
    const buf = makeTestWorkbook({ Sheet1: { A1: 1 } });
    const wb = parseWorkbook(buf, 'model.xlsx');
    expect(wb.name).toBe('model.xlsx');
  });

  it('handles multiple sheets', () => {
    const buf = makeTestWorkbook({ Inputs: { A1: 5 }, Calc: { A1: 10 } });
    const wb = parseWorkbook(buf, 'multi.xlsx');
    expect(wb.sheets).toHaveLength(2);
    expect(wb.sheets[0].name).toBe('Inputs');
    expect(wb.sheets[1].name).toBe('Calc');
  });
});
