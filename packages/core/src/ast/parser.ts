import { tokenize, type Token } from './tokenizer.js';
import type { ASTNode, CellRef, RangeRef, FunctionCall } from './types.js';

export class FormulaParser {
  private tokens: Token[] = [];
  private pos = 0;

  parse(formula: string): ASTNode {
    this.tokens = tokenize(formula);
    this.pos = 0;
    const node = this.parseExpression();
    return node;
  }

  private peek(): Token { return this.tokens[this.pos]; }
  private advance(): Token { return this.tokens[this.pos++]; }

  private expect(type: string): Token {
    const tok = this.peek();
    if (tok.type !== type) throw new Error(`Expected ${type}, got ${tok.type} ("${tok.value}") at pos ${tok.pos}`);
    return this.advance();
  }

  // Expression = Comparison
  private parseExpression(): ASTNode {
    return this.parseComparison();
  }

  // Comparison = Concat (('=' | '<>' | '<' | '>' | '<=' | '>=') Concat)?
  private parseComparison(): ASTNode {
    let left = this.parseConcat();
    const t = this.peek();
    if (t.type === 'EQ' || t.type === 'NEQ' || t.type === 'LT' || t.type === 'GT' || t.type === 'LTE' || t.type === 'GTE') {
      const op = this.advance().value as any;
      const right = this.parseConcat();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  // Concat = Addition ('&' Addition)*
  private parseConcat(): ASTNode {
    let left = this.parseAddition();
    while (this.peek().type === 'AMP') {
      this.advance();
      const right = this.parseAddition();
      left = { type: 'binary', op: '&', left, right };
    }
    return left;
  }

  // Addition = Multiplication (('+' | '-') Multiplication)*
  private parseAddition(): ASTNode {
    let left = this.parseMultiplication();
    while (this.peek().type === 'PLUS' || this.peek().type === 'MINUS') {
      const op = this.advance().value as '+' | '-';
      const right = this.parseMultiplication();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  // Multiplication = Exponent (('*' | '/') Exponent)*
  private parseMultiplication(): ASTNode {
    let left = this.parseExponent();
    while (this.peek().type === 'STAR' || this.peek().type === 'SLASH') {
      const op = this.advance().value as '*' | '/';
      const right = this.parseExponent();
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  // Exponent = Unary ('^' Unary)*
  private parseExponent(): ASTNode {
    let left = this.parseUnary();
    while (this.peek().type === 'CARET') {
      this.advance();
      const right = this.parseUnary();
      left = { type: 'binary', op: '^', left, right };
    }
    return left;
  }

  // Unary = ('-' | '+') Unary | Postfix
  private parseUnary(): ASTNode {
    if (this.peek().type === 'MINUS') {
      this.advance();
      const operand = this.parseUnary();
      return { type: 'unary', op: '-', operand };
    }
    if (this.peek().type === 'PLUS') {
      this.advance();
      return this.parseUnary();
    }
    return this.parsePostfix();
  }

  // Postfix = Primary '%'?
  private parsePostfix(): ASTNode {
    let node = this.parsePrimary();
    if (this.peek().type === 'PERCENT') {
      this.advance();
      node = { type: 'unary', op: '%', operand: node };
    }
    return node;
  }

  // Primary = Number | String | Boolean | Error | FunctionCall | CellRef/Range | '(' Expr ')' | Array
  private parsePrimary(): ASTNode {
    const tok = this.peek();

    switch (tok.type) {
      case 'NUMBER': {
        this.advance();
        return { type: 'number', value: parseFloat(tok.value) };
      }
      case 'STRING': {
        this.advance();
        return { type: 'string', value: tok.value };
      }
      case 'BOOLEAN': {
        this.advance();
        return { type: 'boolean', value: tok.value === 'TRUE' };
      }
      case 'ERROR': {
        this.advance();
        return { type: 'error', value: tok.value };
      }
      case 'FUNC_NAME': {
        return this.parseFunctionCall();
      }
      case 'SHEET_PREFIX': {
        return this.parseCellOrRange();
      }
      case 'CELL_REF': {
        return this.parseCellOrRange();
      }
      case 'LPAREN': {
        this.advance();
        const expr = this.parseExpression();
        this.expect('RPAREN');
        return expr;
      }
      case 'LBRACE': {
        return this.parseArray();
      }
      default:
        throw new Error(`Unexpected token: ${tok.type} ("${tok.value}") at pos ${tok.pos}`);
    }
  }

  private parseFunctionCall(): FunctionCall {
    const name = this.advance().value;
    this.expect('LPAREN');
    const args: ASTNode[] = [];
    if (this.peek().type !== 'RPAREN') {
      args.push(this.parseExpression());
      while (this.peek().type === 'COMMA' || this.peek().type === 'SEMICOLON') {
        this.advance();
        args.push(this.parseExpression());
      }
    }
    this.expect('RPAREN');
    return { type: 'function', name, args };
  }

  private parseCellOrRange(): ASTNode {
    const cell = this.parseCellRef();
    if (this.peek().type === 'COLON') {
      this.advance();
      const end = this.parseCellRef();
      return { type: 'range', start: cell, end } as RangeRef;
    }
    return cell;
  }

  private parseCellRef(): CellRef {
    let sheet: string | undefined;
    if (this.peek().type === 'SHEET_PREFIX') {
      sheet = this.advance().value;
    }

    const tok = this.advance();
    const ref = tok.value;

    // Parse $A$1 style references
    const match = ref.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/i);
    if (match) {
      return {
        type: 'cell',
        sheet,
        absCol: match[1] === '$',
        col: match[2].toUpperCase(),
        absRow: match[3] === '$',
        row: parseInt(match[4]),
      };
    }

    // Named range or identifier — treat as col=name, row=0 sentinel
    return { type: 'cell', sheet, col: ref, row: 0, absCol: false, absRow: false };
  }

  private parseArray(): ASTNode {
    this.expect('LBRACE');
    const rows: ASTNode[][] = [];
    let currentRow: ASTNode[] = [];

    currentRow.push(this.parseExpression());
    while (this.peek().type !== 'RBRACE') {
      if (this.peek().type === 'COMMA') {
        this.advance();
        currentRow.push(this.parseExpression());
      } else if (this.peek().type === 'SEMICOLON') {
        this.advance();
        rows.push(currentRow);
        currentRow = [];
        currentRow.push(this.parseExpression());
      } else break;
    }
    rows.push(currentRow);
    this.expect('RBRACE');
    return { type: 'array', rows };
  }
}

export function parseFormula(formula: string): ASTNode {
  const parser = new FormulaParser();
  return parser.parse(formula);
}
