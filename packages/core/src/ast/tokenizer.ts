export type TokenType =
  | 'NUMBER' | 'STRING' | 'BOOLEAN' | 'ERROR'
  | 'CELL_REF' | 'SHEET_PREFIX'
  | 'FUNC_NAME'
  | 'LPAREN' | 'RPAREN' | 'COMMA' | 'COLON' | 'SEMICOLON'
  | 'LBRACE' | 'RBRACE'
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'CARET' | 'PERCENT' | 'AMP'
  | 'EQ' | 'NEQ' | 'LT' | 'GT' | 'LTE' | 'GTE'
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const ERRORS = ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A', '#CALC!'];

export function tokenize(formula: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < formula.length) {
    const ch = formula[i];

    // Whitespace
    if (ch === ' ' || ch === '\t') { i++; continue; }

    // Error literals
    if (ch === '#') {
      const rest = formula.slice(i);
      const err = ERRORS.find(e => rest.toUpperCase().startsWith(e));
      if (err) { tokens.push({ type: 'ERROR', value: err, pos: i }); i += err.length; continue; }
    }

    // String literal
    if (ch === '"') {
      let str = '';
      i++;
      while (i < formula.length) {
        if (formula[i] === '"') {
          if (formula[i + 1] === '"') { str += '"'; i += 2; } // escaped quote
          else { i++; break; }
        } else { str += formula[i]; i++; }
      }
      tokens.push({ type: 'STRING', value: str, pos: i });
      continue;
    }

    // Sheet prefix: 'Sheet Name'! or SheetName!
    if (ch === "'") {
      let name = '';
      i++;
      while (i < formula.length && formula[i] !== "'") { name += formula[i]; i++; }
      i++; // skip closing '
      if (formula[i] === '!') { i++; }
      tokens.push({ type: 'SHEET_PREFIX', value: name, pos: i });
      continue;
    }

    // Check for unquoted sheet prefix: letters/digits/underscore followed by !
    // But only if followed by a cell ref pattern
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      let ident = '';
      while (i < formula.length && /[A-Za-z0-9_ ]/.test(formula[i])) { ident += formula[i]; i++; }

      if (formula[i] === '!' && i < formula.length - 1 && /[$A-Z]/i.test(formula[i + 1])) {
        i++; // skip !
        tokens.push({ type: 'SHEET_PREFIX', value: ident.trim(), pos: start });
        continue;
      }

      // Boolean literals
      if (ident.toUpperCase() === 'TRUE') { tokens.push({ type: 'BOOLEAN', value: 'TRUE', pos: start }); continue; }
      if (ident.toUpperCase() === 'FALSE') { tokens.push({ type: 'BOOLEAN', value: 'FALSE', pos: start }); continue; }

      // Function name (followed by opening paren)
      if (formula[i] === '(') {
        tokens.push({ type: 'FUNC_NAME', value: ident.trim().toUpperCase(), pos: start });
        continue;
      }

      // Cell reference (e.g., A1, AB123) — must be letters then digits
      const cellMatch = ident.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/i);
      if (cellMatch) {
        tokens.push({ type: 'CELL_REF', value: ident, pos: start });
        continue;
      }

      // Named range / identifier — treat as cell ref for now
      tokens.push({ type: 'CELL_REF', value: ident, pos: start });
      continue;
    }

    // $ prefix for absolute refs
    if (ch === '$') {
      const start = i;
      let ref = '$';
      i++;
      while (i < formula.length && /[A-Z$0-9]/i.test(formula[i])) { ref += formula[i]; i++; }
      tokens.push({ type: 'CELL_REF', value: ref, pos: start });
      continue;
    }

    // Number
    if (/[0-9.]/.test(ch)) {
      const start = i;
      let num = '';
      while (i < formula.length && /[0-9.eE+-]/.test(formula[i])) {
        if ((formula[i] === '+' || formula[i] === '-') && formula[i - 1] !== 'e' && formula[i - 1] !== 'E') break;
        num += formula[i]; i++;
      }
      tokens.push({ type: 'NUMBER', value: num, pos: start });
      continue;
    }

    // Operators and punctuation
    const start = i;
    switch (ch) {
      case '(': tokens.push({ type: 'LPAREN', value: '(', pos: start }); i++; break;
      case ')': tokens.push({ type: 'RPAREN', value: ')', pos: start }); i++; break;
      case ',': tokens.push({ type: 'COMMA', value: ',', pos: start }); i++; break;
      case ':': tokens.push({ type: 'COLON', value: ':', pos: start }); i++; break;
      case ';': tokens.push({ type: 'SEMICOLON', value: ';', pos: start }); i++; break;
      case '{': tokens.push({ type: 'LBRACE', value: '{', pos: start }); i++; break;
      case '}': tokens.push({ type: 'RBRACE', value: '}', pos: start }); i++; break;
      case '+': tokens.push({ type: 'PLUS', value: '+', pos: start }); i++; break;
      case '-': tokens.push({ type: 'MINUS', value: '-', pos: start }); i++; break;
      case '*': tokens.push({ type: 'STAR', value: '*', pos: start }); i++; break;
      case '/': tokens.push({ type: 'SLASH', value: '/', pos: start }); i++; break;
      case '^': tokens.push({ type: 'CARET', value: '^', pos: start }); i++; break;
      case '%': tokens.push({ type: 'PERCENT', value: '%', pos: start }); i++; break;
      case '&': tokens.push({ type: 'AMP', value: '&', pos: start }); i++; break;
      case '=': tokens.push({ type: 'EQ', value: '=', pos: start }); i++; break;
      case '<':
        if (formula[i + 1] === '>') { tokens.push({ type: 'NEQ', value: '<>', pos: start }); i += 2; }
        else if (formula[i + 1] === '=') { tokens.push({ type: 'LTE', value: '<=', pos: start }); i += 2; }
        else { tokens.push({ type: 'LT', value: '<', pos: start }); i++; }
        break;
      case '>':
        if (formula[i + 1] === '=') { tokens.push({ type: 'GTE', value: '>=', pos: start }); i += 2; }
        else { tokens.push({ type: 'GT', value: '>', pos: start }); i++; }
        break;
      default:
        i++; // skip unknown characters
    }
  }

  tokens.push({ type: 'EOF', value: '', pos: i });
  return tokens;
}
