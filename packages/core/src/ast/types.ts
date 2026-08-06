export type ASTNode =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | ErrorLiteral
  | CellRef
  | RangeRef
  | UnaryOp
  | BinaryOp
  | FunctionCall
  | ArrayLiteral;

export interface NumberLiteral {
  type: 'number';
  value: number;
}

export interface StringLiteral {
  type: 'string';
  value: string;
}

export interface BooleanLiteral {
  type: 'boolean';
  value: boolean;
}

export interface ErrorLiteral {
  type: 'error';
  value: string; // #REF!, #VALUE!, #NUM!, etc.
}

export interface CellRef {
  type: 'cell';
  sheet?: string;
  col: string;
  row: number;
  absCol: boolean;
  absRow: boolean;
}

export interface RangeRef {
  type: 'range';
  start: CellRef;
  end: CellRef;
}

export interface UnaryOp {
  type: 'unary';
  op: '+' | '-' | '%';
  operand: ASTNode;
}

export interface BinaryOp {
  type: 'binary';
  op: '+' | '-' | '*' | '/' | '^' | '&' | '=' | '<>' | '<' | '>' | '<=' | '>=';
  left: ASTNode;
  right: ASTNode;
}

export interface FunctionCall {
  type: 'function';
  name: string;
  args: ASTNode[];
}

export interface ArrayLiteral {
  type: 'array';
  rows: ASTNode[][];
}
