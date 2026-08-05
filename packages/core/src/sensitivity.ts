import type { Model, ScenarioOverride } from './types.js';
import type { ParsedWorkbook } from './parser.js';
import { ModelRuntime } from './runtime.js';

export interface SensitivityConfig {
  parameterIds?: string[];
  outputIds?: string[];
  steps?: number;
  range?: number[];
}

export interface ParameterImpact {
  parameterId: string;
  parameterName: string;
  outputId: string;
  outputName: string;
  baseValue: unknown;
  sweepValues: { factor: number; paramValue: number; outputValue: unknown }[];
  absoluteImpact: number;
  relativeImpact: number;
}

export interface SensitivityResult {
  modelId: string;
  baselineOutputs: Record<string, unknown>;
  impacts: ParameterImpact[];
  ranking: { parameterId: string; parameterName: string; totalImpact: number }[];
}

const DEFAULT_RANGE = [-0.5, -0.25, -0.1, 0.1, 0.25, 0.5];

export function runSensitivity(
  model: Model,
  workbook: ParsedWorkbook,
  config: SensitivityConfig = {},
): SensitivityResult {
  const steps = config.range || DEFAULT_RANGE;
  const params = config.parameterIds
    ? model.parameters.filter((p) => config.parameterIds!.includes(p.id))
    : model.parameters.filter((p) => typeof p.currentValue === 'number');
  const outputs = config.outputIds
    ? model.outputs.filter((o) => config.outputIds!.includes(o.id))
    : model.outputs;

  // Baseline run
  const baseRuntime = new ModelRuntime(model, workbook);
  const baselineOutputs = baseRuntime.run();

  const impacts: ParameterImpact[] = [];

  for (const param of params) {
    const baseParamVal = param.currentValue as number;
    if (typeof baseParamVal !== 'number' || baseParamVal === 0) continue;

    for (const output of outputs) {
      const baseOutputVal = baselineOutputs[output.id];
      if (typeof baseOutputVal !== 'number') continue;

      const sweepValues: ParameterImpact['sweepValues'] = [];
      let maxDelta = 0;

      for (const factor of steps) {
        const newParamVal = baseParamVal * (1 + factor);
        const override: ScenarioOverride = { parameterId: param.id, value: newParamVal };
        const runtime = new ModelRuntime(model, workbook);
        const results = runtime.run([override]);
        const outputVal = results[output.id];
        const numOut = typeof outputVal === 'number' ? outputVal : 0;

        sweepValues.push({ factor, paramValue: newParamVal, outputValue: numOut });
        const delta = Math.abs(numOut - baseOutputVal);
        if (delta > maxDelta) maxDelta = delta;
      }

      const relativeImpact = baseOutputVal !== 0 ? maxDelta / Math.abs(baseOutputVal) : maxDelta;

      impacts.push({
        parameterId: param.id,
        parameterName: param.name,
        outputId: output.id,
        outputName: output.name,
        baseValue: baseOutputVal,
        sweepValues,
        absoluteImpact: maxDelta,
        relativeImpact,
      });
    }
  }

  // Rank parameters by total absolute impact across all outputs
  const impactByParam = new Map<string, { name: string; total: number }>();
  for (const imp of impacts) {
    const entry = impactByParam.get(imp.parameterId) || { name: imp.parameterName, total: 0 };
    entry.total += imp.relativeImpact;
    impactByParam.set(imp.parameterId, entry);
  }

  const ranking = Array.from(impactByParam.entries())
    .map(([parameterId, { name, total }]) => ({ parameterId, parameterName: name, totalImpact: total }))
    .sort((a, b) => b.totalImpact - a.totalImpact);

  return { modelId: model.id, baselineOutputs, impacts, ranking };
}
