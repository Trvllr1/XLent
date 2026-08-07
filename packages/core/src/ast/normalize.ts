import type { ASTNode } from './types.js';

/**
 * E0.4 — Render an AST to a canonical formula string.
 * - Refs always A1 style, no $ (absolute/relative is cosmetic, not semantic).
 * - Function names uppercased.
 * - Consistent operator spacing removed.
 * Two formulas that differ only in ref-style produce identical normalizedFormula.
 */
export function normalizeFormula(node: ASTNode): string {
  return render(node);
}

function render(node: ASTNode): string {
  switch (node.type) {
    case 'number':
      return String(node.value);
    case 'string':
      return `"${node.value}"`;
    case 'boolean':
      return node.value ? 'TRUE' : 'FALSE';
    case 'error':
      return node.value;
    case 'cell':
      return `${node.sheet ? `${node.sheet}!` : ''}${node.col}${node.row}`;
    case 'range':
      return `${render(node.start)}:${render(node.end)}`;
    case 'unary':
      return node.op === '%' ? `(${render(node.operand)}%)` : `(${node.op}${render(node.operand)})`;
    case 'binary':
      return `${render(node.left)}${node.op}${render(node.right)}`;
    case 'function':
      return `${node.name.toUpperCase()}(${node.args.map(render).join(',')})`;
    case 'array':
      return `{${node.rows.map((r) => r.map(render).join(',')).join(';')}}`;
  }
}

/** Collect the distinct set of function names used in a formula AST. */
export function collectFunctionCalls(node: ASTNode): string[] {
  const out = new Set<string>();
  walk(node, out);
  return [...out].sort();
}

function walk(node: ASTNode, out: Set<string>): void {
  switch (node.type) {
    case 'function':
      out.add(node.name.toUpperCase());
      for (const a of node.args) walk(a, out);
      break;
    case 'binary':
      walk(node.left, out);
      walk(node.right, out);
      break;
    case 'unary':
      walk(node.operand, out);
      break;
    case 'range':
      walk(node.start, out);
      walk(node.end, out);
      break;
    case 'array':
      for (const r of node.rows) for (const el of r) walk(el, out);
      break;
    default:
      break;
  }
}
