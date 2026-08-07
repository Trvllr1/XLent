import { describe, it, expect } from 'vitest';
import { parseFormula, FormulaInterpreter, type CellValue, type InterpreterContext } from '../ast/index.js';

/**
 * E11.2 — Function-coverage corpus. Each entry names a runtime function, a
 * known-answer formula, an optional data sheet it reads, and the expected
 * result (within tolerance for floats). The test parses and executes the
 * formula through the real FormulaInterpreter and compares to the known answer.
 * §53 rule 7: every supported function has a fixture proving its behavior.
 */

/** Build an interpreter over a small in-memory workbook. */
function interpreterOver(cells: Record<string, CellValue>, sheet = 'S'): FormulaInterpreter {
  const get = (ref: string): CellValue => cells[ref] ?? null;
  const ctx: InterpreterContext = {
    currentSheet: sheet,
    resolve: (_s, col, row) => get(`${col}${row}`),
    resolveRange: (_s, c1, r1, c2, r2) => {
      const out: CellValue[] = [];
      const colIdx = (c: string) => c.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
      const idxCol = (i: number) => { let s = ''; let n = i; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
      for (let ci = colIdx(c1); ci <= colIdx(c2); ci++) {
        for (let r = r1; r <= r2; r++) out.push(get(`${idxCol(ci)}${r}`));
      }
      return out;
    },
  };
  return new FormulaInterpreter(ctx);
}

/** Evaluate a formula string against the given cell data. */
function evalFormula(formula: string, cells: Record<string, CellValue> = {}): CellValue {
  const interp = interpreterOver(cells);
  const body = formula.startsWith('=') ? formula.slice(1) : formula;
  return interp.evaluate(parseFormula(body));
}

interface FnCase {
  fn: string;
  formula: string;
  cells?: Record<string, CellValue>;
  expect: CellValue;
  tol?: number; // relative tolerance for float compare
}

const CASES: FnCase[] = [
  // --- Math ---
  { fn: 'ABS', formula: '=ABS(-4)', expect: 4 },
  { fn: 'SQRT', formula: '=SQRT(16)', expect: 4 },
  { fn: 'SQRT(neg)', formula: '=SQRT(-1)', expect: '#NUM!' },
  { fn: 'LN', formula: '=LN(EXP(1))', expect: 1, tol: 1e-9 },
  { fn: 'POWER', formula: '=POWER(2,10)', expect: 1024 },
  { fn: 'MOD', formula: '=MOD(10,3)', expect: 1 },
  { fn: 'ROUND', formula: '=ROUND(3.14159,2)', expect: 3.14 },
  { fn: 'ROUNDUP', formula: '=ROUNDUP(3.141,2)', expect: 3.15 },
  { fn: 'ROUNDDOWN', formula: '=ROUNDDOWN(3.149,2)', expect: 3.14 },
  { fn: 'INT', formula: '=INT(3.9)', expect: 3 },
  { fn: 'SIGN', formula: '=SIGN(-7)', expect: -1 },
  { fn: 'FLOOR', formula: '=FLOOR(3.7,1)', expect: 3 },
  { fn: 'CEILING', formula: '=CEILING(3.2,1)', expect: 4 },
  { fn: 'PI', formula: '=PI()', expect: Math.PI, tol: 1e-12 },
  { fn: 'EXP', formula: '=EXP(0)', expect: 1 },

  // --- Aggregate ---
  { fn: 'SUM', formula: '=SUM(A1:A3)', cells: { A1: 1, A2: 2, A3: 3 }, expect: 6 },
  { fn: 'AVERAGE', formula: '=AVERAGE(A1:A3)', cells: { A1: 2, A2: 4, A3: 6 }, expect: 4 },
  { fn: 'MIN', formula: '=MIN(A1:A3)', cells: { A1: 5, A2: 2, A3: 8 }, expect: 2 },
  { fn: 'MAX', formula: '=MAX(A1:A3)', cells: { A1: 5, A2: 9, A3: 8 }, expect: 9 },
  { fn: 'COUNT', formula: '=COUNT(A1:A3)', cells: { A1: 1, A2: 'x', A3: 3 }, expect: 2 },
  { fn: 'MEDIAN(odd)', formula: '=MEDIAN(A1:A3)', cells: { A1: 1, A2: 5, A3: 2 }, expect: 2 },
  { fn: 'MEDIAN(even)', formula: '=MEDIAN(A1:A4)', cells: { A1: 1, A2: 5, A3: 2, A4: 8 }, expect: 3.5 },
  { fn: 'STDEV', formula: '=STDEV(A1:A3)', cells: { A1: 2, A2: 4, A3: 6 }, expect: 2, tol: 1e-9 },

  // --- Logical ---
  { fn: 'IF(true)', formula: '=IF(1>0,10,20)', expect: 10 },
  { fn: 'IF(false)', formula: '=IF(1<0,10,20)', expect: 20 },
  { fn: 'AND', formula: '=AND(1>0,2>1)', expect: true },
  { fn: 'OR', formula: '=OR(1<0,2>1)', expect: true },
  { fn: 'NOT', formula: '=NOT(1>0)', expect: false },
  { fn: 'IFERROR', formula: '=IFERROR(1/0,99)', expect: 99 },

  // --- Text ---
  { fn: 'LEFT', formula: '=LEFT("hello",2)', expect: 'he' },
  { fn: 'RIGHT', formula: '=RIGHT("hello",2)', expect: 'lo' },
  { fn: 'MID', formula: '=MID("hello",2,3)', expect: 'ell' },
  { fn: 'LEN', formula: '=LEN("hello")', expect: 5 },
  { fn: 'CONCATENATE', formula: '=CONCATENATE("a","b")', expect: 'ab' },
  { fn: 'TRIM', formula: '=TRIM("  x  ")', expect: 'x' },
  { fn: 'UPPER', formula: '=UPPER("abc")', expect: 'ABC' },
  { fn: 'LOWER', formula: '=LOWER("ABC")', expect: 'abc' },
  { fn: 'VALUE', formula: '=VALUE("3.5")', expect: 3.5 },

  // --- Lookup ---
  {
    fn: 'VLOOKUP', formula: '=VLOOKUP(2,A1:B3,2,FALSE)',
    cells: { A1: 1, B1: 'a', A2: 2, B2: 'b', A3: 3, B3: 'c' }, expect: 'b',
  },
  {
    fn: 'INDEX', formula: '=INDEX(A1:A3,2)',
    cells: { A1: 10, A2: 20, A3: 30 }, expect: 20,
  },
  {
    fn: 'MATCH', formula: '=MATCH(20,A1:A3,0)',
    cells: { A1: 10, A2: 20, A3: 30 }, expect: 2,
  },

  // --- Financial ---
  { fn: 'NPV', formula: '=NPV(0.1,-100,60,60)', expect: -100 / 1.1 + 60 / 1.21 + 60 / 1.331, tol: 1e-6 },
  { fn: 'PMT', formula: '=PMT(0.01,12,-1000)', expect: 88.8488, tol: 1e-3 },
  { fn: 'IRR', formula: '=IRR(A1:A4)', cells: { A1: -100, A2: 40, A3: 40, A4: 40 }, expect: 0.0971, tol: 1e-2 },
  { fn: 'PV', formula: '=PV(0.01,12,-88.8488)', expect: 1000, tol: 1e-2 },
  { fn: 'FV', formula: '=FV(0.01,12,-100)', cells: {}, expect: 1268.2503, tol: 1e-4 },

  // --- Operators / errors ---
  { fn: 'DIV0', formula: '=1/0', expect: '#DIV/0!' },
  { fn: 'POWER_OP', formula: '=2^8', expect: 256 },
];

describe('E11.2 function coverage corpus', () => {
  for (const c of CASES) {
    it(`${c.fn}: ${c.formula} => ${String(c.expect)}`, () => {
      const got = evalFormula(c.formula, c.cells);
      if (typeof c.expect === 'number' && typeof got === 'number') {
        const tol = c.tol ?? 1e-9;
        const denom = Math.max(1, Math.abs(c.expect));
        expect(Math.abs(got - c.expect) / denom, `${c.fn} drift`).toBeLessThanOrEqual(tol);
      } else {
        expect(got).toEqual(c.expect);
      }
    });
  }

  it('covers all major function families', () => {
    const fams = new Set(CASES.map((c) => c.fn.replace(/\(.*\)/, '').replace(/_OP|0$/, '')));
    for (const required of ['SUM', 'NPV', 'IRR', 'VLOOKUP', 'INDEX', 'MATCH', 'IF', 'LEFT']) {
      expect([...fams].some((f) => f.startsWith(required.slice(0, 4))), `family ${required}`).toBe(true);
    }
  });
});
