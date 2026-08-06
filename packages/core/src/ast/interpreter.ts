import type { ASTNode, CellRef, RangeRef } from './types.js';

export type CellValue = number | string | boolean | null;
export type CellResolver = (sheet: string, col: string, row: number) => CellValue;
export type RangeResolver = (sheet: string, startCol: string, startRow: number, endCol: string, endRow: number) => CellValue[];

export interface InterpreterContext {
  resolve: CellResolver;
  resolveRange: RangeResolver;
  currentSheet: string;
  stepLimit?: number;
}

export class FormulaInterpreter {
  private steps = 0;
  private stepLimit: number;

  constructor(private ctx: InterpreterContext) {
    this.stepLimit = ctx.stepLimit ?? 50000;
  }

  evaluate(node: ASTNode): CellValue {
    this.steps++;
    if (this.steps > this.stepLimit) return '#LIMIT!' as any;

    switch (node.type) {
      case 'number': return node.value;
      case 'string': return node.value;
      case 'boolean': return node.value;
      case 'error': return node.value;
      case 'cell': return this.resolveCell(node);
      case 'range': return this.resolveRangeFirst(node);
      case 'unary': return this.evalUnary(node);
      case 'binary': return this.evalBinary(node);
      case 'function': return this.evalFunction(node);
      case 'array': return this.evaluate(node.rows[0]?.[0] ?? { type: 'number', value: 0 });
      default: return '#VALUE!';
    }
  }

  // Evaluate node as array of values (for aggregate functions)
  evaluateAsArray(node: ASTNode): CellValue[] {
    if (node.type === 'range') {
      const start = node.start;
      const end = node.end;
      const sheet = start.sheet || this.ctx.currentSheet;
      return this.ctx.resolveRange(sheet, start.col, start.row, end.col, end.row);
    }
    if (node.type === 'array') {
      return node.rows.flat().map(n => this.evaluate(n));
    }
    return [this.evaluate(node)];
  }

  private resolveCell(ref: CellRef): CellValue {
    const sheet = ref.sheet || this.ctx.currentSheet;
    return this.ctx.resolve(sheet, ref.col, ref.row);
  }

  private resolveRangeFirst(range: RangeRef): CellValue {
    // When a range appears in scalar context, return first cell
    const sheet = range.start.sheet || this.ctx.currentSheet;
    return this.ctx.resolve(sheet, range.start.col, range.start.row);
  }

  private evalUnary(node: { op: string; operand: ASTNode }): CellValue {
    const val = this.evaluate(node.operand);
    const n = toNumber(val);
    if (n === null) return '#VALUE!';
    switch (node.op) {
      case '-': return -n;
      case '+': return n;
      case '%': return n / 100;
      default: return '#VALUE!';
    }
  }

  private evalBinary(node: { op: string; left: ASTNode; right: ASTNode }): CellValue {
    if (node.op === '&') {
      const l = this.evaluate(node.left);
      const r = this.evaluate(node.right);
      return String(l ?? '') + String(r ?? '');
    }

    const l = this.evaluate(node.left);
    const r = this.evaluate(node.right);

    // Comparison operators work on numbers and strings
    if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
      return this.evalComparison(node.op, l, r);
    }

    const ln = toNumber(l);
    const rn = toNumber(r);
    if (ln === null || rn === null) return '#VALUE!';

    switch (node.op) {
      case '+': return ln + rn;
      case '-': return ln - rn;
      case '*': return ln * rn;
      case '/': return rn === 0 ? '#DIV/0!' : ln / rn;
      case '^': return Math.pow(ln, rn);
      default: return '#VALUE!';
    }
  }

  private evalComparison(op: string, l: CellValue, r: CellValue): boolean {
    const ln = typeof l === 'number' ? l : null;
    const rn = typeof r === 'number' ? r : null;
    if (ln !== null && rn !== null) {
      switch (op) {
        case '=': return ln === rn;
        case '<>': return ln !== rn;
        case '<': return ln < rn;
        case '>': return ln > rn;
        case '<=': return ln <= rn;
        case '>=': return ln >= rn;
      }
    }
    // String comparison
    const ls = String(l ?? '').toLowerCase();
    const rs = String(r ?? '').toLowerCase();
    switch (op) {
      case '=': return ls === rs;
      case '<>': return ls !== rs;
      case '<': return ls < rs;
      case '>': return ls > rs;
      case '<=': return ls <= rs;
      case '>=': return ls >= rs;
    }
    return false;
  }

  private evalFunction(node: { name: string; args: ASTNode[] }): CellValue {
    const name = node.name;
    const args = node.args;

    switch (name) {
      // Math
      case 'ABS': return Math.abs(this.num(args[0]));
      case 'SQRT': { const n = this.num(args[0]); return n < 0 ? '#NUM!' : Math.sqrt(n); }
      case 'LN': { const n = this.num(args[0]); return n <= 0 ? '#NUM!' : Math.log(n); }
      case 'LOG10': { const n = this.num(args[0]); return n <= 0 ? '#NUM!' : Math.log10(n); }
      case 'LOG': {
        const n = this.num(args[0]);
        const base = args.length > 1 ? this.num(args[1]) : 10;
        if (n <= 0 || base <= 0 || base === 1) return '#NUM!';
        return Math.log(n) / Math.log(base);
      }
      case 'EXP': return Math.exp(this.num(args[0]));
      case 'INT': return Math.floor(this.num(args[0]));
      case 'MOD': { const n = this.num(args[0]); const d = this.num(args[1]); return d === 0 ? '#DIV/0!' : n - d * Math.floor(n / d); }
      case 'POWER': return Math.pow(this.num(args[0]), this.num(args[1]));
      case 'SIGN': { const n = this.num(args[0]); return n > 0 ? 1 : n < 0 ? -1 : 0; }
      case 'PI': return Math.PI;
      case 'RAND': return Math.random(); // Deterministic seed TODO
      case 'ROUND': { const n = this.num(args[0]); const d = this.num(args[1] ?? { type: 'number', value: 0 }); const f = 10 ** d; return Math.round(n * f) / f; }
      case 'ROUNDUP': { const n = this.num(args[0]); const d = this.num(args[1] ?? { type: 'number', value: 0 }); const f = 10 ** d; return n >= 0 ? Math.ceil(n * f) / f : Math.floor(n * f) / f; }
      case 'ROUNDDOWN': case 'TRUNC': { const n = this.num(args[0]); const d = this.num(args[1] ?? { type: 'number', value: 0 }); const f = 10 ** d; return Math.trunc(n * f) / f; }
      case 'FLOOR': { const n = this.num(args[0]); const s = this.num(args[1] ?? { type: 'number', value: 1 }); return s === 0 ? 0 : Math.floor(n / s) * s; }
      case 'CEILING': { const n = this.num(args[0]); const s = this.num(args[1] ?? { type: 'number', value: 1 }); return s === 0 ? 0 : Math.ceil(n / s) * s; }

      // Aggregates
      case 'SUM': return this.aggregate(args, vals => vals.reduce((a, b) => a + b, 0));
      case 'AVERAGE': return this.aggregate(args, vals => vals.length === 0 ? '#DIV/0!' as any : vals.reduce((a, b) => a + b, 0) / vals.length);
      case 'MIN': return this.aggregate(args, vals => vals.length === 0 ? 0 : Math.min(...vals));
      case 'MAX': return this.aggregate(args, vals => vals.length === 0 ? 0 : Math.max(...vals));
      case 'COUNT': { const vals = this.flattenNumeric(args); return vals.length; }
      case 'COUNTA': { const vals = this.flattenAll(args); return vals.filter(v => v !== null && v !== '').length; }

      // Logic
      case 'IF': {
        const cond = this.evaluate(args[0]);
        const truthy = toBool(cond);
        return truthy ? this.evaluate(args[1] ?? { type: 'number', value: 0 }) : this.evaluate(args[2] ?? { type: 'boolean', value: false });
      }
      case 'AND': { const vals = args.map(a => toBool(this.evaluate(a))); return vals.every(v => v); }
      case 'OR': { const vals = args.map(a => toBool(this.evaluate(a))); return vals.some(v => v); }
      case 'NOT': return !toBool(this.evaluate(args[0]));
      case 'IFERROR': case 'IFNA': {
        const val = this.evaluate(args[0]);
        if (typeof val === 'string' && val.startsWith('#')) return this.evaluate(args[1] ?? { type: 'number', value: 0 });
        return val;
      }

      // Lookup
      case 'VLOOKUP': return this.vlookup(args);
      case 'INDEX': return this.indexFn(args);
      case 'MATCH': return this.matchFn(args);

      // Text
      case 'LEFT': { const s = String(this.evaluate(args[0]) ?? ''); const n = args.length > 1 ? this.num(args[1]) : 1; return s.slice(0, n); }
      case 'RIGHT': { const s = String(this.evaluate(args[0]) ?? ''); const n = args.length > 1 ? this.num(args[1]) : 1; return s.slice(-n); }
      case 'MID': { const s = String(this.evaluate(args[0]) ?? ''); const start = this.num(args[1]); const len = this.num(args[2]); return s.slice(start - 1, start - 1 + len); }
      case 'LEN': return String(this.evaluate(args[0]) ?? '').length;
      case 'CONCATENATE': case 'CONCAT': return args.map(a => String(this.evaluate(a) ?? '')).join('');
      case 'TRIM': return String(this.evaluate(args[0]) ?? '').trim();
      case 'UPPER': return String(this.evaluate(args[0]) ?? '').toUpperCase();
      case 'LOWER': return String(this.evaluate(args[0]) ?? '').toLowerCase();
      case 'VALUE': { const n = parseFloat(String(this.evaluate(args[0]) ?? '')); return isNaN(n) ? '#VALUE!' : n; }
      case 'TEXT': return String(this.evaluate(args[0]) ?? ''); // Simplified — ignores format string

      // Financial
      case 'NPV': return this.npv(args);
      case 'IRR': return this.irr(args);
      case 'PMT': return this.pmt(args);
      case 'PV': return this.pvFn(args);
      case 'FV': return this.fvFn(args);
      case 'RATE': return this.rateFn(args);
      case 'NPER': return this.nperFn(args);

      // Statistical
      case 'MEDIAN': { const vals = this.flattenNumeric(args).sort((a, b) => a - b); const m = vals.length; if (m === 0) return '#NUM!'; return m % 2 === 1 ? vals[(m - 1) / 2] : (vals[m / 2 - 1] + vals[m / 2]) / 2; }
      case 'STDEV': case 'STDEV.S': { const vals = this.flattenNumeric(args); if (vals.length < 2) return '#DIV/0!'; const mean = vals.reduce((a, b) => a + b, 0) / vals.length; const ss = vals.reduce((a, v) => a + (v - mean) ** 2, 0); return Math.sqrt(ss / (vals.length - 1)); }

      // Conditional aggregates
      case 'SUMIF': return this.sumif(args);
      case 'COUNTIF': return this.countif(args);
      case 'SUMIFS': return this.sumifs(args);

      // Date (simplified — returns serial numbers)
      case 'YEAR': case 'MONTH': case 'DAY': case 'DATE': case 'TODAY': case 'NOW':
        return this.num(args[0] ?? { type: 'number', value: 0 }); // Placeholder

      // Info
      case 'ISBLANK': { const v = this.evaluate(args[0]); return v === null || v === '' || v === 0; }
      case 'ISERROR': { const v = this.evaluate(args[0]); return typeof v === 'string' && v.startsWith('#'); }
      case 'ISNUMBER': { const v = this.evaluate(args[0]); return typeof v === 'number'; }

      default:
        return `#UNSUPPORTED:${name}`;
    }
  }

  // Helpers
  private num(node: ASTNode): number {
    const val = this.evaluate(node);
    return toNumber(val) ?? 0;
  }

  private flattenNumeric(args: ASTNode[]): number[] {
    const result: number[] = [];
    for (const arg of args) {
      const vals = this.evaluateAsArray(arg);
      for (const v of vals) {
        const n = toNumber(v);
        if (n !== null) result.push(n);
      }
    }
    return result;
  }

  private flattenAll(args: ASTNode[]): CellValue[] {
    const result: CellValue[] = [];
    for (const arg of args) { result.push(...this.evaluateAsArray(arg)); }
    return result;
  }

  private aggregate(args: ASTNode[], fn: (vals: number[]) => number | string): CellValue {
    const vals = this.flattenNumeric(args);
    return fn(vals);
  }

  // Financial implementations
  private npv(args: ASTNode[]): CellValue {
    const rate = this.num(args[0]);
    const cashflows: number[] = [];
    for (let i = 1; i < args.length; i++) {
      cashflows.push(...this.evaluateAsArray(args[i]).map(v => toNumber(v) ?? 0));
    }
    let npv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      npv += cashflows[t] / Math.pow(1 + rate, t + 1);
    }
    return npv;
  }

  private irr(args: ASTNode[]): CellValue {
    const cashflows = this.evaluateAsArray(args[0]).map(v => toNumber(v) ?? 0);
    const guess = args.length > 1 ? this.num(args[1]) : 0.1;
    let rate = guess;
    for (let iter = 0; iter < 200; iter++) {
      let npv = 0, dnpv = 0;
      for (let t = 0; t < cashflows.length; t++) {
        const factor = Math.pow(1 + rate, t);
        npv += cashflows[t] / factor;
        dnpv -= t * cashflows[t] / Math.pow(1 + rate, t + 1);
      }
      if (Math.abs(npv) < 1e-10) return rate;
      if (dnpv === 0) return '#NUM!';
      rate -= npv / dnpv;
      if (!isFinite(rate)) return '#NUM!';
    }
    return '#NUM!';
  }

  private pmt(args: ASTNode[]): CellValue {
    const rate = this.num(args[0]);
    const nper = this.num(args[1]);
    const pv = this.num(args[2]);
    const fv = args.length > 3 ? this.num(args[3]) : 0;
    const type = args.length > 4 ? this.num(args[4]) : 0;
    if (rate === 0) return -(pv + fv) / nper;
    const pvif = Math.pow(1 + rate, nper);
    let pmt = rate * (pv * pvif + fv) / (pvif - 1);
    if (type === 1) pmt /= (1 + rate);
    return -pmt;
  }

  private pvFn(args: ASTNode[]): CellValue {
    const rate = this.num(args[0]);
    const nper = this.num(args[1]);
    const pmt = this.num(args[2]);
    const fv = args.length > 3 ? this.num(args[3]) : 0;
    const type = args.length > 4 ? this.num(args[4]) : 0;
    if (rate === 0) return -(pmt * nper + fv);
    const pvif = Math.pow(1 + rate, nper);
    const pmtAdj = type === 1 ? pmt * (1 + rate) : pmt;
    return -(pmtAdj * (pvif - 1) / (rate * pvif) + fv / pvif);
  }

  private fvFn(args: ASTNode[]): CellValue {
    const rate = this.num(args[0]);
    const nper = this.num(args[1]);
    const pmt = this.num(args[2]);
    const pv = args.length > 3 ? this.num(args[3]) : 0;
    const type = args.length > 4 ? this.num(args[4]) : 0;
    if (rate === 0) return -(pv + pmt * nper);
    const pvif = Math.pow(1 + rate, nper);
    const pmtAdj = type === 1 ? pmt * (1 + rate) : pmt;
    return -(pv * pvif + pmtAdj * (pvif - 1) / rate);
  }

  private rateFn(args: ASTNode[]): CellValue {
    const nper = this.num(args[0]);
    const pmt = this.num(args[1]);
    const pv = this.num(args[2]);
    const fv = args.length > 3 ? this.num(args[3]) : 0;
    const type = args.length > 4 ? this.num(args[4]) : 0;
    let rate = 0.1;
    for (let i = 0; i < 200; i++) {
      const pvif = Math.pow(1 + rate, nper);
      const pmtAdj = type === 1 ? pmt * (1 + rate) : pmt;
      const f = pv * pvif + pmtAdj * (pvif - 1) / rate + fv;
      const df = pv * nper * Math.pow(1 + rate, nper - 1) + pmtAdj * ((nper * Math.pow(1 + rate, nper - 1) * rate - (pvif - 1)) / (rate * rate));
      if (Math.abs(f) < 1e-10) return rate;
      if (df === 0) return '#NUM!';
      rate -= f / df;
      if (!isFinite(rate) || rate <= -1) return '#NUM!';
    }
    return '#NUM!';
  }

  private nperFn(args: ASTNode[]): CellValue {
    const rate = this.num(args[0]);
    const pmt = this.num(args[1]);
    const pv = this.num(args[2]);
    const fv = args.length > 3 ? this.num(args[3]) : 0;
    const type = args.length > 4 ? this.num(args[4]) : 0;
    if (rate === 0) return -(pv + fv) / pmt;
    const pmtAdj = type === 1 ? pmt * (1 + rate) : pmt;
    const num = pmtAdj - fv * rate;
    const den = pv * rate + pmtAdj;
    if (num / den <= 0) return '#NUM!';
    return Math.log(num / den) / Math.log(1 + rate);
  }

  // Lookup functions
  private vlookup(args: ASTNode[]): CellValue {
    const lookupVal = this.evaluate(args[0]);
    const tableRange = args[1];
    const colIndex = this.num(args[2]);
    const exactMatch = args.length > 3 ? !toBool(this.evaluate(args[3])) : false;

    if (tableRange.type !== 'range') return '#VALUE!';
    const range = tableRange as RangeRef;
    const sheet = range.start.sheet || this.ctx.currentSheet;
    const startCol = colToIndex(range.start.col);
    const endCol = colToIndex(range.end.col);
    const targetCol = startCol + colIndex - 1;
    if (targetCol > endCol) return '#REF!';

    for (let row = range.start.row; row <= range.end.row; row++) {
      const cellVal = this.ctx.resolve(sheet, range.start.col, row);
      const match = exactMatch
        ? cellVal === lookupVal || (typeof cellVal === 'number' && cellVal === toNumber(lookupVal))
        : typeof cellVal === 'number' && typeof lookupVal === 'number' && cellVal <= lookupVal;
      if (exactMatch && match) {
        return this.ctx.resolve(sheet, indexToCol(targetCol), row);
      }
    }
    return '#N/A';
  }

  private indexFn(args: ASTNode[]): CellValue {
    const range = args[0];
    const rowNum = this.num(args[1]);
    const colNum = args.length > 2 ? this.num(args[2]) : 1;
    if (range.type !== 'range') return '#VALUE!';
    const r = range as RangeRef;
    const sheet = r.start.sheet || this.ctx.currentSheet;
    const targetRow = r.start.row + rowNum - 1;
    const targetCol = colToIndex(r.start.col) + colNum - 1;
    return this.ctx.resolve(sheet, indexToCol(targetCol), targetRow);
  }

  private matchFn(args: ASTNode[]): CellValue {
    const lookupVal = this.evaluate(args[0]);
    const range = args[1];
    const matchType = args.length > 2 ? this.num(args[2]) : 1;
    if (range.type !== 'range') return '#VALUE!';
    const r = range as RangeRef;
    const sheet = r.start.sheet || this.ctx.currentSheet;
    const isCol = r.start.col !== r.end.col && r.start.row === r.end.row;

    const count = isCol
      ? colToIndex(r.end.col) - colToIndex(r.start.col) + 1
      : r.end.row - r.start.row + 1;

    for (let i = 0; i < count; i++) {
      const col = isCol ? indexToCol(colToIndex(r.start.col) + i) : r.start.col;
      const row = isCol ? r.start.row : r.start.row + i;
      const val = this.ctx.resolve(sheet, col, row);
      if (matchType === 0 && (val === lookupVal || (typeof val === 'number' && val === toNumber(lookupVal)))) {
        return i + 1;
      }
    }
    return '#N/A';
  }

  // Conditional aggregates
  private sumif(args: ASTNode[]): CellValue {
    const criteriaRange = args[0];
    const criteria = this.evaluate(args[1]);
    const sumRange = args.length > 2 ? args[2] : args[0];
    if (criteriaRange.type !== 'range') return '#VALUE!';
    const cr = criteriaRange as RangeRef;
    const sr = sumRange.type === 'range' ? sumRange as RangeRef : cr;
    const sheet = cr.start.sheet || this.ctx.currentSheet;
    let sum = 0;
    for (let row = cr.start.row; row <= cr.end.row; row++) {
      const val = this.ctx.resolve(sheet, cr.start.col, row);
      if (matchesCriteria(val, criteria)) {
        const sSheet = sr.start.sheet || this.ctx.currentSheet;
        const sVal = this.ctx.resolve(sSheet, sr.start.col, sr.start.row + (row - cr.start.row));
        sum += toNumber(sVal) ?? 0;
      }
    }
    return sum;
  }

  private countif(args: ASTNode[]): CellValue {
    const range = args[0];
    const criteria = this.evaluate(args[1]);
    if (range.type !== 'range') return '#VALUE!';
    const r = range as RangeRef;
    const sheet = r.start.sheet || this.ctx.currentSheet;
    let count = 0;
    for (let row = r.start.row; row <= r.end.row; row++) {
      const val = this.ctx.resolve(sheet, r.start.col, row);
      if (matchesCriteria(val, criteria)) count++;
    }
    return count;
  }

  private sumifs(args: ASTNode[]): CellValue {
    const sumRange = args[0];
    if (sumRange.type !== 'range') return '#VALUE!';
    const sr = sumRange as RangeRef;
    const sheet = sr.start.sheet || this.ctx.currentSheet;
    const rowCount = sr.end.row - sr.start.row + 1;

    // Build pass/fail array
    const pass = new Array(rowCount).fill(true);
    for (let i = 1; i < args.length - 1; i += 2) {
      const critRange = args[i] as RangeRef;
      const criteria = this.evaluate(args[i + 1]);
      if (critRange.type !== 'range') continue;
      const cSheet = critRange.start.sheet || this.ctx.currentSheet;
      for (let row = 0; row < rowCount; row++) {
        if (!pass[row]) continue;
        const val = this.ctx.resolve(cSheet, critRange.start.col, critRange.start.row + row);
        if (!matchesCriteria(val, criteria)) pass[row] = false;
      }
    }

    let sum = 0;
    for (let row = 0; row < rowCount; row++) {
      if (pass[row]) {
        const val = this.ctx.resolve(sheet, sr.start.col, sr.start.row + row);
        sum += toNumber(val) ?? 0;
      }
    }
    return sum;
  }
}

// Utility functions
function toNumber(val: CellValue): number | null {
  if (typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? 1 : 0;
  if (typeof val === 'string') {
    if (val.startsWith('#')) return null;
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
  }
  return 0; // null → 0
}

function toBool(val: CellValue): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val !== 0;
  if (typeof val === 'string') return val !== '' && !val.startsWith('#');
  return false;
}

function colToIndex(col: string): number {
  let idx = 0;
  for (let i = 0; i < col.length; i++) {
    idx = idx * 26 + (col.charCodeAt(i) - 64);
  }
  return idx;
}

function indexToCol(idx: number): string {
  let col = '';
  while (idx > 0) {
    const r = (idx - 1) % 26;
    col = String.fromCharCode(65 + r) + col;
    idx = Math.floor((idx - 1) / 26);
  }
  return col;
}

function matchesCriteria(val: CellValue, criteria: CellValue): boolean {
  if (typeof criteria === 'string') {
    const m = criteria.match(/^([<>=!]+)(.+)$/);
    if (m) {
      const op = m[1];
      const target = parseFloat(m[2]);
      const n = toNumber(val);
      if (n === null || isNaN(target)) return false;
      switch (op) {
        case '>': return n > target;
        case '<': return n < target;
        case '>=': return n >= target;
        case '<=': return n <= target;
        case '<>': case '!=': return n !== target;
        case '=': return n === target;
      }
    }
    return String(val ?? '').toLowerCase() === criteria.toLowerCase();
  }
  if (typeof criteria === 'number') return toNumber(val) === criteria;
  return val === criteria;
}
