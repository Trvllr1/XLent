export type FormulaTokenType = 'number' | 'string' | 'boolean' | 'error' | 'cellRef' | 'sheetRef' | 'function' | 'operator' | 'paren' | 'comma' | 'colon' | 'unknown';

export interface FormulaToken {
  type: FormulaTokenType;
  value: string;
  start: number;
}

const ERROR_LITERALS = ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#CALC!'];

export function tokenizeFormula(formula: string): FormulaToken[] {
  const tokens: FormulaToken[] = [];
  let i = 0;

  while (i < formula.length) {
    const ch = formula[i];

    if (ch === ' ' || ch === '\t') { i++; continue; }

    if (ch === '#') {
      const rest = formula.slice(i).toUpperCase();
      const err = ERROR_LITERALS.find((e) => rest.startsWith(e));
      if (err) { tokens.push({ type: 'error', value: err, start: i }); i += err.length; continue; }
    }

    if (ch === '"') {
      const start = i;
      i++;
      while (i < formula.length) {
        if (formula[i] === '"') {
          if (formula[i + 1] === '"') { i += 2; } else { i++; break; }
        } else { i++; }
      }
      tokens.push({ type: 'string', value: formula.slice(start, i), start });
      continue;
    }

    if (ch === "'") {
      const start = i;
      i++;
      while (i < formula.length && formula[i] !== "'") { i++; }
      i++;
      if (formula[i] === '!') { i++; }
      tokens.push({ type: 'sheetRef', value: formula.slice(start, i), start });
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      let ident = '';
      while (i < formula.length && /[A-Za-z0-9_ ]/.test(formula[i])) { ident += formula[i]; i++; }

      if (formula[i] === '!' && i < formula.length - 1 && /[$A-Z]/i.test(formula[i + 1])) {
        i++;
        tokens.push({ type: 'sheetRef', value: ident.trim() + '!', start });
        continue;
      }

      const upper = ident.trim().toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') { tokens.push({ type: 'boolean', value: upper, start }); continue; }

      if (formula[i] === '(') { tokens.push({ type: 'function', value: upper, start }); continue; }

      if (/^(\$?)([A-Z]+)(\$?)(\d+)$/i.test(ident)) { tokens.push({ type: 'cellRef', value: ident, start }); continue; }

      tokens.push({ type: 'cellRef', value: ident, start });
      continue;
    }

    if (ch === '$') {
      const start = i;
      let ref = '$';
      i++;
      while (i < formula.length && /[A-Z$0-9]/i.test(formula[i])) { ref += formula[i]; i++; }
      tokens.push({ type: 'cellRef', value: ref, start });
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      const start = i;
      let num = '';
      while (i < formula.length && /[0-9.eE+-]/.test(formula[i])) {
        if ((formula[i] === '+' || formula[i] === '-') && formula[i - 1] !== 'e' && formula[i - 1] !== 'E') break;
        num += formula[i]; i++;
      }
      tokens.push({ type: 'number', value: num, start });
      continue;
    }

    const start = i;
    switch (ch) {
      case '(': tokens.push({ type: 'paren', value: '(', start }); i++; break;
      case ')': tokens.push({ type: 'paren', value: ')', start }); i++; break;
      case ',': tokens.push({ type: 'comma', value: ',', start }); i++; break;
      case ':': tokens.push({ type: 'colon', value: ':', start }); i++; break;
      case ';': tokens.push({ type: 'comma', value: ';', start }); i++; break;
      case '{': tokens.push({ type: 'paren', value: '{', start }); i++; break;
      case '}': tokens.push({ type: 'paren', value: '}', start }); i++; break;
      default: tokens.push({ type: 'operator', value: ch, start }); i++; break;
    }
  }

  return tokens;
}

const TOKEN_CLASSES: Record<FormulaTokenType, string> = {
  number: 'text-amber-300',
  string: 'text-emerald-300',
  boolean: 'text-cyan-300',
  error: 'text-red-400',
  cellRef: 'text-indigo-300',
  sheetRef: 'text-purple-300',
  function: 'text-blue-300',
  operator: 'text-slate-400',
  paren: 'text-slate-300',
  comma: 'text-slate-500',
  colon: 'text-slate-500',
  unknown: 'text-slate-200',
};

export function formulaTokenClass(type: FormulaTokenType): string {
  return TOKEN_CLASSES[type];
}
