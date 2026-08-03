import type { ParsedWorkbook } from './parser.js';
import type { Model, Parameter, Calculation, Output, ScenarioOverride } from './types.js';
import { buildGraph, traceUpstream } from './graph.js';

/**
 * Deterministic model runtime.
 * Evaluates formulas using topological sort of the dependency graph.
 * AI must NOT be used for calculation — this is the authoritative engine.
 */
export class ModelRuntime {
  private cellValues: Map<string, unknown>;
  private formulas: Map<string, string>;
  private model: Model;
  private topoOrder: string[];

  constructor(model: Model, workbook: ParsedWorkbook) {
    this.model = model;
    this.cellValues = new Map();
    this.formulas = new Map();

    // Initialize cell values from workbook
    for (const sheet of workbook.sheets) {
      for (const cell of sheet.cells) {
        const id = `${cell.address.sheet}!${cell.address.ref}`;
        this.cellValues.set(id, cell.value);
        if (cell.formula) {
          this.formulas.set(id, cell.formula);
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
          this.cellValues.set(cellId, override.value);
        }
      }
    }

    // Evaluate in topological order
    for (const cellId of this.topoOrder) {
      const formula = this.formulas.get(cellId);
      if (formula) {
        const value = this.evaluateFormula(formula, cellId);
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

  private evaluateFormula(formula: string, contextCell: string): unknown {
    // Resolve cell references to their current values
    const sheet = contextCell.split('!')[0];
    const resolved = formula.replace(
      /(?:([A-Za-z0-9_ ]+)!)?\$?([A-Z]+)\$?(\d+)/g,
      (_, refSheet, col, row) => {
        const targetSheet = refSheet || sheet;
        const val = this.cellValues.get(`${targetSheet}!${col}${row}`);
        if (val === undefined || val === null) return '0';
        if (typeof val === 'string') return `"${val}"`;
        return String(val);
      },
    );

    try {
      // Safe numeric evaluation for arithmetic formulas
      return this.safeEval(resolved);
    } catch {
      return '#CALC!';
    }
  }

  /** Evaluate simple arithmetic expressions without full eval(). */
  private safeEval(expr: string): unknown {
    // Handle common Excel functions
    let normalized = expr
      // Math constants and zero-arg functions
      .replace(/PI\(\)/gi, String(Math.PI))
      .replace(/TRUE\(\)/gi, '1')
      .replace(/FALSE\(\)/gi, '0')
      // Single-arg math functions
      .replace(/ABS\(([^)]+)\)/gi, (_, a: string) => String(Math.abs(parseFloat(a.trim()) || 0)))
      .replace(/SQRT\(([^)]+)\)/gi, (_, a: string) => String(Math.sqrt(parseFloat(a.trim()) || 0)))
      .replace(/LN\(([^)]+)\)/gi, (_, a: string) => String(Math.log(parseFloat(a.trim()) || 0)))
      .replace(/LOG10\(([^)]+)\)/gi, (_, a: string) => String(Math.log10(parseFloat(a.trim()) || 0)))
      .replace(/LOG\(([^,]+),([^)]+)\)/gi, (_, a: string, b: string) => {
        const val = parseFloat(a.trim()) || 0;
        const base = parseFloat(b.trim()) || 10;
        return String(Math.log(val) / Math.log(base));
      })
      .replace(/EXP\(([^)]+)\)/gi, (_, a: string) => String(Math.exp(parseFloat(a.trim()) || 0)))
      .replace(/FLOOR\(([^,]+),([^)]+)\)/gi, (_, a: string, sig: string) => {
        const val = parseFloat(a.trim()) || 0;
        const s = parseFloat(sig.trim()) || 1;
        return String(Math.floor(val / s) * s);
      })
      .replace(/CEILING\(([^,]+),([^)]+)\)/gi, (_, a: string, sig: string) => {
        const val = parseFloat(a.trim()) || 0;
        const s = parseFloat(sig.trim()) || 1;
        return String(Math.ceil(val / s) * s);
      })
      .replace(/INT\(([^)]+)\)/gi, (_, a: string) => String(Math.trunc(parseFloat(a.trim()) || 0)))
      .replace(/MOD\(([^,]+),([^)]+)\)/gi, (_, a: string, b: string) => {
        const num = parseFloat(a.trim()) || 0;
        const div = parseFloat(b.trim()) || 1;
        return String(num - div * Math.floor(num / div));
      })
      .replace(/POWER\(([^,]+),([^)]+)\)/gi, (_, a: string, b: string) => {
        return String(Math.pow(parseFloat(a.trim()) || 0, parseFloat(b.trim()) || 0));
      })
      // Aggregate functions
      .replace(/SUM\(([^)]+)\)/gi, (_, args: string) => {
        const nums = args.split(',').map((s: string) => parseFloat(s.trim()) || 0);
        return String(nums.reduce((a: number, b: number) => a + b, 0));
      })
      .replace(/AVERAGE\(([^)]+)\)/gi, (_, args: string) => {
        const nums = args.split(',').map((s: string) => parseFloat(s.trim()) || 0);
        return String(nums.reduce((a: number, b: number) => a + b, 0) / nums.length);
      })
      .replace(/MIN\(([^)]+)\)/gi, (_, args: string) => {
        const nums = args.split(',').map((s: string) => parseFloat(s.trim()) || 0);
        return String(Math.min(...nums));
      })
      .replace(/MAX\(([^)]+)\)/gi, (_, args: string) => {
        const nums = args.split(',').map((s: string) => parseFloat(s.trim()) || 0);
        return String(Math.max(...nums));
      })
      .replace(/COUNT\(([^)]+)\)/gi, (_, args: string) => {
        return String(args.split(',').filter((s: string) => !isNaN(parseFloat(s.trim()))).length);
      })
      .replace(/IF\(([^,]+),([^,]+),([^)]+)\)/gi, (_, cond: string, t: string, f: string) => {
        return this.evalCondition(cond) ? t.trim() : f.trim();
      })
      .replace(/ROUND\(([^,]+),([^)]+)\)/gi, (_, num: string, digits: string) => {
        const n = parseFloat(num.trim()) || 0;
        const d = parseInt(digits.trim()) || 0;
        return String(Math.round(n * 10 ** d) / 10 ** d);
      });

    // Evaluate pure arithmetic (only numbers, operators, parens)
    if (/^[\d\s+\-*/().,%^]+$/.test(normalized)) {
      // Replace percentage notation
      normalized = normalized.replace(/([\d.]+)%/g, (_, n) => String(parseFloat(n) / 100));
      // Replace ^ with ** for exponentiation
      normalized = normalized.replace(/\^/g, '**');
      const fn = new Function(`return (${normalized})`);
      return fn();
    }

    // If it's a pure number
    const num = parseFloat(normalized);
    if (!isNaN(num)) return num;

    return normalized;
  }

  private evalCondition(cond: string): boolean {
    const match = cond.match(/(.+?)\s*(>=|<=|<>|>|<|=)\s*(.+)/);
    if (!match) return false;
    const left = parseFloat(match[1].trim()) || 0;
    const right = parseFloat(match[3].trim()) || 0;
    switch (match[2]) {
      case '>': return left > right;
      case '<': return left < right;
      case '>=': return left >= right;
      case '<=': return left <= right;
      case '=': return left === right;
      case '<>': return left !== right;
      default: return false;
    }
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
