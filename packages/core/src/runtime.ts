import type { ParsedWorkbook } from './parser.js';
import type { Model, Parameter, Calculation, Output, ScenarioOverride } from './types.js';
import { buildGraph, traceUpstream } from './graph.js';
import { parseFormula, FormulaInterpreter, type CellValue, type InterpreterContext } from './ast/index.js';
import type { ASTNode } from './ast/index.js';

/**
 * Deterministic model runtime.
 * Evaluates formulas using topological sort of the dependency graph.
 * AI must NOT be used for calculation — this is the authoritative engine.
 */
export class ModelRuntime {
  private cellValues: Map<string, CellValue>;
  private formulas: Map<string, string>;
  private parsedFormulas: Map<string, ASTNode>;
  private model: Model;
  private topoOrder: string[];

  constructor(model: Model, workbook: ParsedWorkbook) {
    this.model = model;
    this.cellValues = new Map();
    this.formulas = new Map();
    this.parsedFormulas = new Map();

    // Initialize cell values from workbook
    for (const sheet of workbook.sheets) {
      for (const cell of sheet.cells) {
        const id = `${cell.address.sheet}!${cell.address.ref}`;
        this.cellValues.set(id, cell.value as CellValue);
        if (cell.formula) {
          this.formulas.set(id, cell.formula);
          try {
            this.parsedFormulas.set(id, parseFormula(cell.formula));
          } catch {
            // If parsing fails, formula will return #CALC! at eval time
          }
        }
      }
    }

    this.topoOrder = this.topologicalSort();
  }

  /** Run the model with optional parameter overrides. Returns output values. */
  run(overrides?: ScenarioOverride[]): Record<string, unknown> {
    // Apply parameter overrides
    if (overrides) {
      for (const override of overrides) {
        const param = this.model.parameters.find((p) => p.id === override.parameterId);
        if (param) {
          const cellId = `${param.sourceCell.sheet}!${param.sourceCell.ref}`;
          this.cellValues.set(cellId, override.value as CellValue);
        }
      }
    }

    // Evaluate in topological order using AST interpreter
    for (const cellId of this.topoOrder) {
      const ast = this.parsedFormulas.get(cellId);
      if (ast) {
        const sheet = cellId.split('!')[0];
        const ctx: InterpreterContext = {
          currentSheet: sheet,
          resolve: (s, col, row) => this.cellValues.get(`${s}!${col}${row}`) ?? null,
          resolveRange: (s, startCol, startRow, endCol, endRow) => this.expandRange(s, startCol, startRow, endCol, endRow),
          stepLimit: 50000,
        };
        const interp = new FormulaInterpreter(ctx);
        const value = interp.evaluate(ast);
        this.cellValues.set(cellId, value);
      }
    }

    // Collect outputs
    const results: Record<string, unknown> = {};
    for (const output of this.model.outputs) {
      const cellId = `${output.sourceCell.sheet}!${output.sourceCell.ref}`;
      const val = this.cellValues.get(cellId);
      results[output.id] = typeof val === 'number' && !isFinite(val) ? null : val;
    }

    return results;
  }

  /** Get the current value of any cell. */
  getCellValue(sheet: string, ref: string): unknown {
    return this.cellValues.get(`${sheet}!${ref}`);
  }

  /** Explain how an output is calculated — trace its dependency path. */
  explain(outputId: string): { output: Output; dependencies: string[]; values: Record<string, unknown> } {
    const output = this.model.outputs.find((o) => o.id === outputId);
    if (!output) throw new Error(`Output not found: ${outputId}`);

    const cellId = `${output.sourceCell.sheet}!${output.sourceCell.ref}`;
    const deps = traceUpstream(this.model.graph, cellId);
    const values: Record<string, unknown> = {};
    for (const dep of deps) {
      values[dep] = this.cellValues.get(dep);
    }
    values[cellId] = this.cellValues.get(cellId);

    return { output, dependencies: deps, values };
  }

  private expandRange(sheet: string, startCol: string, startRow: number, endCol: string, endRow: number): CellValue[] {
    const values: CellValue[] = [];
    const sc = colToIndex(startCol);
    const ec = colToIndex(endCol);
    for (let row = startRow; row <= endRow; row++) {
      for (let c = sc; c <= ec; c++) {
        const col = indexToCol(c);
        values.push(this.cellValues.get(`${sheet}!${col}${row}`) ?? null);
      }
    }
    return values;
  }

  private topologicalSort(): string[] {
    const { nodes, edges } = this.model.graph;
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node, 0);
      adjacency.set(node, []);
    }
    for (const edge of edges) {
      inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
      adjacency.get(edge.from)?.push(edge.to);
    }

    const queue = nodes.filter((n) => (inDegree.get(n) || 0) === 0);
    const order: string[] = [];

    while (queue.length > 0) {
      const node = queue.shift()!;
      order.push(node);
      for (const neighbor of adjacency.get(node) || []) {
        const deg = (inDegree.get(neighbor) || 1) - 1;
        inDegree.set(neighbor, deg);
        if (deg === 0) queue.push(neighbor);
      }
    }

    return order;
  }
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
