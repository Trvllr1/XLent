import crypto from 'crypto';
import type { ParsedWorkbook, ParsedSheet } from './parser.js';
import type { DebugFinding } from './types.js';

function fid(...parts: unknown[]): string {
  return crypto.createHash('sha1').update(parts.map(String).join('|')).digest('hex').slice(0, 12);
}

interface FormulaCell {
  cellId: string;
  ref: string;
  col: number; // 0-based
  row: number; // 0-based
  formula: string;
}

const REF_RE = /(\$?)([A-Z]{1,3})(\$?)(\d+)/g;

/** Normalize a formula to a relative shape: A1-style refs become col/row offsets. */
function toShape(formula: string, col: number, row: number): string {
  return formula.replace(REF_RE, (_m, cd, cl, rd, rn) => {
    const absC = cd === '$';
    const absR = rd === '$';
    const cIdx = colLetterToIndex(cl);
    const rIdx = parseInt(rn, 10) - 1;
    const cPart = absC ? `C${cl}` : `C[${cIdx - col}]`;
    const rPart = absR ? `R${rn}` : `R[${rIdx - row}]`;
    return `${cPart}${rPart}`;
  });
}

function colLetterToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function colIndexToLetter(idx: number): string {
  let s = '';
  let n = idx + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Re-render a shape as a concrete formula at a given position. */
function shapeToFormula(shape: string, col: number, row: number): string {
  return shape.replace(/C\[(-?\d+)\]R\[(-?\d+)\]|C([A-Z]{1,3})R(\d+)/g, (_m, co, ro, ac, ar) => {
    if (ac) return `${ac}${ar}`; // absolute ref preserved
    const c = col + parseInt(co, 10);
    const r = row + parseInt(ro, 10) + 1;
    return `${colIndexToLetter(c)}${r}`;
  });
}

/**
 * E7.4 — Pattern-consistency detection.
 * Within each row and column band of formula cells, find the dominant relative
 * formula shape and flag outliers (a cell whose formula breaks the series).
 */
export function detectPatternBreaks(workbook: ParsedWorkbook): DebugFinding[] {
  const findings: DebugFinding[] = [];

  for (const sheet of workbook.sheets) {
    const cells = collectFormulaCells(sheet);
    findings.push(...detectInBands(cells, sheet.name, 'row'));
    findings.push(...detectInBands(cells, sheet.name, 'col'));
  }

  // De-dupe: same cell may be flagged by both its row and column band; keep the
  // one with the clearer expected formula (prefer row-band).
  const byCell = new Map<string, DebugFinding>();
  for (const f of findings) {
    if (!f.sourceRef) continue;
    if (!byCell.has(f.sourceRef)) byCell.set(f.sourceRef, f);
  }
  return [...byCell.values()];
}

function collectFormulaCells(sheet: ParsedSheet): FormulaCell[] {
  const out: FormulaCell[] = [];
  for (const c of sheet.cells) {
    if (!c.formula) continue;
    const colMatch = c.address.ref.replace(/[0-9]/g, '');
    const rowMatch = c.address.ref.replace(/[A-Z]/g, '');
    out.push({
      cellId: `${sheet.name}!${c.address.ref}`,
      ref: c.address.ref,
      col: colLetterToIndex(colMatch),
      row: parseInt(rowMatch, 10) - 1,
      formula: c.formula,
    });
  }
  return out;
}

function detectInBands(cells: FormulaCell[], sheetName: string, axis: 'row' | 'col'): DebugFinding[] {
  const findings: DebugFinding[] = [];
  // Group cells into contiguous bands along the axis
  const bandKey = (c: FormulaCell) => (axis === 'row' ? c.row : c.col);
  const bandPos = (c: FormulaCell) => (axis === 'row' ? c.col : c.row);

  const bands = new Map<number, FormulaCell[]>();
  for (const c of cells) {
    if (!bands.has(bandKey(c))) bands.set(bandKey(c), []);
    bands.get(bandKey(c))!.push(c);
  }

  for (const band of bands.values()) {
    if (band.length < 3) continue; // need at least 3 to establish a pattern
    band.sort((a, b) => bandPos(a) - bandPos(b));

    // Shape histogram
    const shapeCounts = new Map<string, number>();
    for (const c of band) {
      const s = toShape(c.formula, c.col, c.row);
      shapeCounts.set(s, (shapeCounts.get(s) ?? 0) + 1);
    }
    // Dominant shape (most common)
    let dominant = '';
    let dominantCount = 0;
    for (const [s, n] of shapeCounts) {
      if (n > dominantCount) { dominant = s; dominantCount = n; }
    }
    // Only meaningful if a clear majority share the dominant shape
    if (dominantCount < Math.ceil(band.length * 0.6)) continue;

    // The first cell in a band legitimately starts the series (e.g. =B3 with no
    // left neighbor) — its shape differs by design. Only flag interior cells
    // that share the dominant shape's reference structure but diverge.
    for (let i = 1; i < band.length; i++) {
      const c = band[i];
      const shape = toShape(c.formula, c.col, c.row);
      if (shape === dominant) continue;
      // Require the dominant shape to actually propagate across the band boundary
      // (i.e. reference a prior band position). Anchor/seed formulas are skipped.
      const dominantSpansBoundary = /C\[-1\]/.test(dominant) || /R\[-1\]/.test(dominant);
      if (!dominantSpansBoundary) continue;

      const expected = shapeToFormula(dominant, c.col, c.row);
      const observed = c.formula;
      const likelyCause = inferCause(dominant, shape, axis);

      findings.push({
        id: fid('pattern', c.cellId),
        severity: 'critical',
        category: 'structural',
        sourceRef: c.cellId,
        explanation: `Formula breaks the ${axis} pattern shared by ${dominantCount} adjacent cell${dominantCount === 1 ? '' : 's'}`,
        expectedFormula: `=${expected}`,
        observedFormula: `=${observed}`,
        likelyCause,
        autoGenerated: true,
      });
    }
  }

  return findings;
}

/** Infer a human-readable likely cause from the shape difference. */
function inferCause(dominantShape: string, observedShape: string, axis: 'row' | 'col'): string {
  const getRefs = (s: string) => [...s.matchAll(/C\[(-?\d+)\]R\[(-?\d+)\]/g)].map((m) => [parseInt(m[1], 10), parseInt(m[2], 10)]);
  const d = getRefs(dominantShape);
  const o = getRefs(observedShape);
  if (d.length === o.length) {
    for (let i = 0; i < d.length; i++) {
      const dRowDelta = o[i][1] - d[i][1];
      const dColDelta = o[i][0] - d[i][0];
      if (dRowDelta !== 0 && dColDelta === 0) {
        return dRowDelta < 0
          ? `Reference points ${-dRowDelta} row(s) too high — possible off-by-one or prior-period reference`
          : `Reference points ${dRowDelta} row(s) too low — possible off-by-one or wrong-period reference`;
      }
      if (dColDelta !== 0 && dRowDelta === 0) {
        return dColDelta < 0
          ? `Reference points ${-dColDelta} column(s) left — possible prior-column/period reference`
          : `Reference points ${dColDelta} column(s) right — possible wrong-column reference`;
      }
    }
  }
  return axis === 'row'
    ? 'Inconsistent formula across a row series'
    : 'Inconsistent formula down a column series';
}
