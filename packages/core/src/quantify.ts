import type { Model, Output, ImpactEstimate } from './types.js';
import type { ParsedWorkbook } from './parser.js';
import { ModelRuntime } from './runtime.js';

/**
 * Quantify a defect's impact by running the model with the observed formula,
 * then again with the expected (corrected) formula injected, and diffing outputs.
 */
export function quantifyFormulaImpact(
  model: Model,
  workbook: ParsedWorkbook,
  cellId: string,
  expectedFormula: string,
): ImpactEstimate[] {
  const corrected = injectFormula(workbook, cellId, expectedFormula);

  const observedResults = new ModelRuntime(model, workbook).run();
  let expectedResults: Record<string, unknown>;
  try {
    expectedResults = new ModelRuntime(model, corrected).run();
  } catch {
    return []; // corrected formula didn't evaluate — can't quantify
  }

  const estimates: ImpactEstimate[] = [];
  for (const output of model.outputs) {
    const obs = observedResults[output.id];
    const exp = expectedResults[output.id];
    if (obs == null && exp == null) continue;
    if (obs === exp) continue;

    const obsNum = typeof obs === 'number' ? obs : null;
    const expNum = typeof exp === 'number' ? exp : null;
    const delta = obsNum != null && expNum != null ? expNum - obsNum : null;
    const percentDelta = delta != null && obsNum !== 0 ? (delta / obsNum!) * 100 : null;

    estimates.push({
      outputId: output.id,
      outputName: output.name,
      observedValue: obs,
      expectedValue: exp,
      delta,
      percentDelta,
    });
  }
  return estimates;
}

/** Return a copy of the workbook with one cell's formula replaced. */
function injectFormula(workbook: ParsedWorkbook, cellId: string, formula: string): ParsedWorkbook {
  const [sheet, ref] = cellId.split('!');
  const bare = formula.startsWith('=') ? formula.slice(1) : formula;
  return {
    ...workbook,
    sheets: workbook.sheets.map((s) =>
      s.name !== sheet
        ? s
        : {
            ...s,
            cells: s.cells.map((c) =>
              c.address.ref === ref ? { ...c, formula: bare } : c,
            ),
          },
    ),
  };
}

/** Build the ordered downstream chain (cell labels) for the impact narrative. */
export function impactChain(
  graph: { nodes: string[]; edges: { from: string; to: string }[] },
  cellId: string,
  labelOf: (cellId: string) => string,
  maxDepth = 6,
): string[] {
  const outEdges = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!outEdges.has(e.from)) outEdges.set(e.from, []);
    outEdges.get(e.from)!.push(e.to);
  }
  const chain: string[] = [];
  const seen = new Set<string>([cellId]);
  let frontier = [cellId];
  while (frontier.length && chain.length < maxDepth) {
    const next: string[] = [];
    for (const cur of frontier) {
      for (const n of outEdges.get(cur) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          chain.push(labelOf(n));
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return chain;
}
