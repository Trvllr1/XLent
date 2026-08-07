import type { ParsedWorkbook } from './parser.js';
import type { ModelDiscovery, CompatibilityStatus, CompatibilityIssue, Calculation, DependencyGraph } from './types.js';
import { parseFormula, normalizeFormula, collectFunctionCalls } from './ast/index.js';
import crypto from 'crypto';

const UNSUPPORTED_FUNCTIONS = new Set([
  'GETPIVOTDATA', 'CUBE', 'RTD', 'WEBSERVICE', 'FILTERXML',
  'REGISTER.ID', 'CALL', 'SQL.REQUEST',
]);

/** Analyze a parsed workbook and produce the discovery report. */
export function discoverModel(workbook: ParsedWorkbook): ModelDiscovery {
  let formulaCells = 0;
  let crossSheetRefs = 0;
  let externalRefs = 0;
  let unsupportedFunctions = 0;
  let circularDeps = 0;
  const inputCandidates = new Set<string>();
  const outputCandidates = new Set<string>();
  const issues: CompatibilityIssue[] = [];

  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      if (cell.formula) {
        formulaCells++;

        // Cross-sheet references (contains '!')
        if (cell.formula.includes('!')) {
          crossSheetRefs++;
        }

        // External references (contains '[')
        if (cell.formula.includes('[')) {
          externalRefs++;
          issues.push({
            type: 'external_reference',
            cell: cell.address,
            detail: `External reference in formula: ${cell.formula}`,
            severity: 'warning',
          });
        }

        // Check for unsupported functions via the AST inventory (E0.4) —
        // parse the formula and walk real function calls, not regex keywords.
        try {
          for (const fn of collectFunctionCalls(parseFormula(cell.formula))) {
            if (UNSUPPORTED_FUNCTIONS.has(fn)) {
              unsupportedFunctions++;
              issues.push({
                type: 'unsupported_function',
                cell: cell.address,
                detail: `Unsupported function: ${fn}`,
                severity: 'warning',
              });
            }
          }
        } catch {
          // Unparseable formula — record as a compatibility issue
          issues.push({
            type: 'error',
            cell: cell.address,
            detail: `Formula could not be parsed: ${cell.formula.slice(0, 60)}`,
            severity: 'error',
          });
        }

        // Output candidate: formula cell with no formula cells depending on it (approximation)
        outputCandidates.add(`${cell.address.sheet}!${cell.address.ref}`);
      } else if (cell.type === 'number') {
        // Input candidate: hardcoded numeric values
        inputCandidates.add(`${cell.address.sheet}!${cell.address.ref}`);
      }
    }
  }

  // Refine: remove cells referenced by formulas from output candidates,
  // add them to input candidates if they are numeric
  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      if (!cell.formula) continue;
      const refs = extractRefs(cell.formula, cell.address.sheet);
      for (const ref of refs) {
        outputCandidates.delete(ref);
      }
    }
  }

  let status: CompatibilityStatus = 'VALID';
  if (issues.some((i) => i.severity === 'error')) status = 'INVALID';
  else if (issues.length > 0) status = 'PARTIAL';

  return {
    workbookName: workbook.name,
    sheets: workbook.sheets.length,
    formulaCells,
    inputCandidates: inputCandidates.size,
    outputCandidates: outputCandidates.size,
    crossSheetReferences: crossSheetRefs,
    externalReferences: externalRefs,
    namedRanges: workbook.namedRanges.length,
    unsupportedFunctions,
    circularDependencies: circularDeps,
    compatibility: status,
  };
}

/** Extract cell references from a formula string. */
function extractRefs(formula: string, currentSheet: string): string[] {
  const refs: string[] = [];
  // Match patterns like Sheet1!A1, A1, $A$1, Sheet1!A1:B2
  const refPattern = /(?:([A-Za-z0-9_ ]+)!)?\$?([A-Z]+)\$?(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = refPattern.exec(formula)) !== null) {
    const sheet = match[1] || currentSheet;
    const col = match[2];
    const row = match[3];
    refs.push(`${sheet}!${col}${row}`);
  }
  return refs;
}

/**
 * E0.4 — Build Calculation records for every formula cell, with the
 * AST-canonical normalizedFormula and the functionCalls inventory.
 */
export function buildCalculations(workbook: ParsedWorkbook, graph: DependencyGraph): Calculation[] {
  const downstream = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!downstream.has(e.from)) downstream.set(e.from, []);
    downstream.get(e.from)!.push(e.to);
  }
  const upstream = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!upstream.has(e.to)) upstream.set(e.to, []);
    upstream.get(e.to)!.push(e.from);
  }

  const out: Calculation[] = [];
  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      if (!cell.formula) continue;
      const cellId = `${cell.address.sheet}!${cell.address.ref}`;
      let normalizedFormula: string | undefined;
      let functionCalls: string[] | undefined;
      try {
        const ast = parseFormula(cell.formula);
        normalizedFormula = normalizeFormula(ast);
        functionCalls = collectFunctionCalls(ast);
      } catch {
        // Unparseable formula — leave fields undefined
      }
      out.push({
        id: crypto.createHash('sha1').update(cellId).digest('hex').slice(0, 12),
        sourceCell: cell.address,
        originalFormula: cell.formula,
        normalizedFormula,
        functionCalls,
        dependencies: upstream.get(cellId) ?? [],
        downstreamOutputs: downstream.get(cellId) ?? [],
      });
    }
  }
  return out;
}

/** Aggregate the distinct function inventory across the workbook (for compatibility). */
export function functionInventory(workbook: ParsedWorkbook): string[] {
  const fns = new Set<string>();
  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      if (!cell.formula) continue;
      try {
        for (const f of collectFunctionCalls(parseFormula(cell.formula))) fns.add(f);
      } catch { /* skip */ }
    }
  }
  return [...fns].sort();
}
