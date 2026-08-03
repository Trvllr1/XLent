import type { Model, Scenario, ScenarioOverride, Comparison, ComparisonRow } from './types.js';
import type { ParsedWorkbook } from './parser.js';
import { ModelRuntime } from './runtime.js';

/** Create and execute a scenario against a model. Never mutates the underlying model. */
export function runScenario(
  model: Model,
  workbook: ParsedWorkbook,
  name: string,
  overrides: ScenarioOverride[],
): Scenario {
  const runtime = new ModelRuntime(model, workbook);
  const results = runtime.run(overrides);

  return {
    id: crypto.randomUUID(),
    modelId: model.id,
    modelVersion: model.version,
    name,
    overrides,
    results,
    createdAt: new Date().toISOString(),
  };
}

/** Compare two sets of results (baseline vs scenario). */
export function compareScenarios(
  model: Model,
  workbook: ParsedWorkbook,
  baselineOverrides: ScenarioOverride[] | null,
  scenarioOverrides: ScenarioOverride[],
  scenarioId: string,
): Comparison {
  const runtime = new ModelRuntime(model, workbook);

  const baselineResults = runtime.run(baselineOverrides || undefined);
  const scenarioRuntime = new ModelRuntime(model, workbook);
  const scenarioResults = scenarioRuntime.run(scenarioOverrides);

  const rows: ComparisonRow[] = model.outputs.map((output) => {
    const base = baselineResults[output.id];
    const scen = scenarioResults[output.id];
    const baseNum = typeof base === 'number' ? base : null;
    const scenNum = typeof scen === 'number' ? scen : null;

    let delta: number | null = null;
    let percentDelta: number | null = null;
    if (baseNum !== null && scenNum !== null) {
      delta = scenNum - baseNum;
      percentDelta = baseNum !== 0 ? (delta / baseNum) * 100 : null;
    }

    return {
      outputId: output.id,
      outputName: output.name,
      baseline: base,
      scenario: scen,
      delta,
      percentDelta,
    };
  });

  return {
    modelId: model.id,
    baselineScenarioId: null,
    comparedScenarioId: scenarioId,
    rows,
  };
}
