export interface FunctionSignature {
  name: string;
  signature: string;
  description: string;
  category: 'Math' | 'Aggregate' | 'Logical' | 'Text' | 'Lookup' | 'Financial' | 'Date' | 'Information';
}

/**
 * E12.2 — Formula editor autocomplete catalog.
 *
 * Every entry corresponds to a function the canonical FormulaInterpreter
 * executes (packages/core/src/ast/interpreter.ts). The catalog is the
 * product-surface projection of the engine's supported-function set; the
 * function corpus test suite proves each behavior.
 */
export const FORMULA_FUNCTIONS: readonly FunctionSignature[] = [
  // Math
  { name: 'ABS', signature: 'ABS(number)', description: 'Absolute value of a number.', category: 'Math' },
  { name: 'SQRT', signature: 'SQRT(number)', description: 'Square root; #NUM! for negatives.', category: 'Math' },
  { name: 'LN', signature: 'LN(number)', description: 'Natural logarithm.', category: 'Math' },
  { name: 'LOG', signature: 'LOG(number, [base])', description: 'Logarithm in the given base (default 10).', category: 'Math' },
  { name: 'LOG10', signature: 'LOG10(number)', description: 'Base-10 logarithm.', category: 'Math' },
  { name: 'EXP', signature: 'EXP(number)', description: 'e raised to the given power.', category: 'Math' },
  { name: 'POWER', signature: 'POWER(number, power)', description: 'Number raised to a power.', category: 'Math' },
  { name: 'MOD', signature: 'MOD(number, divisor)', description: 'Remainder after division.', category: 'Math' },
  { name: 'ROUND', signature: 'ROUND(number, digits)', description: 'Round to the given decimal places.', category: 'Math' },
  { name: 'ROUNDUP', signature: 'ROUNDUP(number, digits)', description: 'Round away from zero.', category: 'Math' },
  { name: 'ROUNDDOWN', signature: 'ROUNDDOWN(number, digits)', description: 'Round toward zero.', category: 'Math' },
  { name: 'INT', signature: 'INT(number)', description: 'Round down to the nearest integer.', category: 'Math' },
  { name: 'SIGN', signature: 'SIGN(number)', description: '1, 0, or -1 for positive, zero, or negative.', category: 'Math' },
  { name: 'FLOOR', signature: 'FLOOR(number, significance)', description: 'Round down to a multiple.', category: 'Math' },
  { name: 'CEILING', signature: 'CEILING(number, significance)', description: 'Round up to a multiple.', category: 'Math' },
  { name: 'PI', signature: 'PI()', description: 'The constant pi.', category: 'Math' },
  { name: 'RAND', signature: 'RAND()', description: 'Random number in [0, 1). Non-deterministic; avoid in governed models.', category: 'Math' },

  // Aggregate
  { name: 'SUM', signature: 'SUM(range, ...)', description: 'Sum of values or ranges.', category: 'Aggregate' },
  { name: 'AVERAGE', signature: 'AVERAGE(range, ...)', description: 'Arithmetic mean.', category: 'Aggregate' },
  { name: 'MIN', signature: 'MIN(range, ...)', description: 'Smallest value.', category: 'Aggregate' },
  { name: 'MAX', signature: 'MAX(range, ...)', description: 'Largest value.', category: 'Aggregate' },
  { name: 'COUNT', signature: 'COUNT(range, ...)', description: 'Count of numeric values.', category: 'Aggregate' },
  { name: 'COUNTA', signature: 'COUNTA(range, ...)', description: 'Count of non-blank values.', category: 'Aggregate' },
  { name: 'COUNTIF', signature: 'COUNTIF(range, criteria)', description: 'Count of values matching a criterion.', category: 'Aggregate' },
  { name: 'SUMIF', signature: 'SUMIF(range, criteria, [sum_range])', description: 'Sum values matching a criterion.', category: 'Aggregate' },
  { name: 'SUMIFS', signature: 'SUMIFS(sum_range, criteria_range, criteria, ...)', description: 'Sum values matching all criteria.', category: 'Aggregate' },
  { name: 'MEDIAN', signature: 'MEDIAN(range, ...)', description: 'Middle value of a set.', category: 'Aggregate' },
  { name: 'STDEV', signature: 'STDEV(range, ...)', description: 'Sample standard deviation.', category: 'Aggregate' },

  // Logical
  { name: 'IF', signature: 'IF(condition, value_if_true, value_if_false)', description: 'Branch on a condition.', category: 'Logical' },
  { name: 'AND', signature: 'AND(condition, ...)', description: 'True when every condition holds.', category: 'Logical' },
  { name: 'OR', signature: 'OR(condition, ...)', description: 'True when any condition holds.', category: 'Logical' },
  { name: 'NOT', signature: 'NOT(condition)', description: 'Logical negation.', category: 'Logical' },
  { name: 'IFERROR', signature: 'IFERROR(value, value_if_error)', description: 'Fallback when the expression errors.', category: 'Logical' },

  // Text
  { name: 'LEFT', signature: 'LEFT(text, [count])', description: 'Leading characters of text.', category: 'Text' },
  { name: 'RIGHT', signature: 'RIGHT(text, [count])', description: 'Trailing characters of text.', category: 'Text' },
  { name: 'MID', signature: 'MID(text, start, count)', description: 'Substring from a position.', category: 'Text' },
  { name: 'LEN', signature: 'LEN(text)', description: 'Text length.', category: 'Text' },
  { name: 'TRIM', signature: 'TRIM(text)', description: 'Remove extra whitespace.', category: 'Text' },
  { name: 'UPPER', signature: 'UPPER(text)', description: 'Uppercase text.', category: 'Text' },
  { name: 'LOWER', signature: 'LOWER(text)', description: 'Lowercase text.', category: 'Text' },
  { name: 'CONCATENATE', signature: 'CONCATENATE(text, ...)', description: 'Join text values.', category: 'Text' },
  { name: 'TEXT', signature: 'TEXT(value, format)', description: 'Format a value as text.', category: 'Text' },
  { name: 'VALUE', signature: 'VALUE(text)', description: 'Parse text as a number.', category: 'Text' },

  // Lookup
  { name: 'VLOOKUP', signature: 'VLOOKUP(key, range, column, [approximate])', description: 'Find a row by key and return a column.', category: 'Lookup' },
  { name: 'INDEX', signature: 'INDEX(range, row, [column])', description: 'Value at a position in a range.', category: 'Lookup' },
  { name: 'MATCH', signature: 'MATCH(key, range, [type])', description: 'Position of a value in a range.', category: 'Lookup' },

  // Financial
  { name: 'NPV', signature: 'NPV(rate, cashflow, ...)', description: 'Net present value of periodic cash flows.', category: 'Financial' },
  { name: 'IRR', signature: 'IRR(cashflows, [guess])', description: 'Internal rate of return.', category: 'Financial' },
  { name: 'PV', signature: 'PV(rate, nper, pmt, [fv], [type])', description: 'Present value of an annuity.', category: 'Financial' },
  { name: 'FV', signature: 'FV(rate, nper, pmt, [pv], [type])', description: 'Future value of an annuity.', category: 'Financial' },
  { name: 'PMT', signature: 'PMT(rate, nper, pv, [fv], [type])', description: 'Periodic loan payment.', category: 'Financial' },
  { name: 'NPER', signature: 'NPER(rate, pmt, pv, [fv], [type])', description: 'Number of periods.', category: 'Financial' },
  { name: 'RATE', signature: 'RATE(nper, pmt, pv, [fv], [type])', description: 'Interest rate per period.', category: 'Financial' },

  // Date
  { name: 'YEAR', signature: 'YEAR(date)', description: 'Year of a date.', category: 'Date' },

  // Information
  { name: 'ISBLANK', signature: 'ISBLANK(value)', description: 'True when the value is blank.', category: 'Information' },
  { name: 'ISERROR', signature: 'ISERROR(value)', description: 'True when the value is an error.', category: 'Information' },
  { name: 'ISNUMBER', signature: 'ISNUMBER(value)', description: 'True when the value is numeric.', category: 'Information' },
];

const BY_NAME = new Map(FORMULA_FUNCTIONS.map((fn) => [fn.name, fn]));

/**
 * Extract the function identifier currently being typed at the caret.
 * Returns null when the caret is not positioned after a bare identifier that
 * could become a function call (e.g. inside a cell reference or string).
 */
export function functionPrefixAt(formula: string, caret: number): { prefix: string; start: number } | null {
  let inString = false;
  for (let i = 0; i < caret; i++) {
    if (formula[i] === '"') inString = !inString;
  }
  if (inString) return null;

  let start = caret;
  while (start > 0 && /[A-Za-z]/.test(formula[start - 1])) start--;
  if (start === caret) return null;

  const prefix = formula.slice(start, caret);
  const before = formula[start - 1];
  // A preceding digit, $, or ! means this identifier is part of a cell or
  // sheet reference rather than a function name.
  if (before && /[0-9$!]/.test(before)) return null;
  return { prefix, start };
}

/** Ranked autocomplete suggestions for a prefix. Exact prefix first, then alphabetical. */
export function suggestFunctions(prefix: string, limit = 8): FunctionSignature[] {
  const upper = prefix.trim().toUpperCase();
  if (!upper) return [];
  return FORMULA_FUNCTIONS
    .filter((fn) => fn.name.startsWith(upper))
    .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Full signature for a function name, or undefined when unsupported. */
export function getFunctionSignature(name: string): FunctionSignature | undefined {
  return BY_NAME.get(name.trim().toUpperCase());
}
