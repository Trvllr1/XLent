import * as XLSX from 'xlsx';
import type { Cell, CellAddress, CellType } from './types.js';

export interface ParsedWorkbook {
  name: string;
  sheets: ParsedSheet[];
  namedRanges: NamedRange[];
}

export interface ParsedSheet {
  name: string;
  cells: Cell[];
}

export interface NamedRange {
  name: string;
  ref: string;
  sheet?: string;
}

function cellType(cell: XLSX.CellObject): CellType {
  switch (cell.t) {
    case 'n': return 'number';
    case 's': return 'string';
    case 'b': return 'boolean';
    case 'd': return 'date';
    case 'e': return 'error';
    default: return 'blank';
  }
}

export function parseWorkbook(buffer: Buffer, filename: string): ParsedWorkbook {
  const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellStyles: true });

  const sheets: ParsedSheet[] = wb.SheetNames.map((sheetName) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return { name: sheetName, cells: [] };

    const cells: Cell[] = [];
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const ref = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = ws[ref] as XLSX.CellObject | undefined;
        if (!cell) continue;

        const address: CellAddress = { sheet: sheetName, ref };
        cells.push({
          address,
          value: cell.v,
          type: cellType(cell),
          formula: cell.f || undefined,
          format: cell.z != null ? String(cell.z) : undefined,
        });
      }
    }

    return { name: sheetName, cells };
  });

  const namedRanges: NamedRange[] = [];
  if (wb.Workbook?.Names) {
    for (const n of wb.Workbook.Names) {
      if (n.Name && n.Ref) {
        namedRanges.push({ name: n.Name, ref: n.Ref, sheet: n.Sheet != null ? wb.SheetNames[n.Sheet] : undefined });
      }
    }
  }

  return { name: filename, sheets, namedRanges };
}
