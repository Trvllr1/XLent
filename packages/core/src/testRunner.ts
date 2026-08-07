import type { Model, ModelTestDefinition, ModelTestResult, TestStatus, ScenarioOverride } from './types.js';
import { ModelRuntime } from './runtime.js';
import { resolveMetaValue } from './autoTests.js';
import type { ParsedWorkbook } from './parser.js';

export function runModelTests(
  model: Model,
  workbook: ParsedWorkbook,
  tests: ModelTestDefinition[],
  overrides?: ScenarioOverride[],
): ModelTestResult[] {
  const runtime = new ModelRuntime(model, workbook);
  const results = runtime.run(overrides);

  return tests.map((test) => runSingleTest(test, results, model, runtime, workbook));
}

function runSingleTest(
  test: ModelTestDefinition,
  results: Record<string, unknown>,
  model: Model,
  runtime?: ModelRuntime,
  workbook?: ParsedWorkbook,
): ModelTestResult {
  const now = new Date().toISOString();
  const base = { testId: test.id, name: test.name, category: test.category, executedAt: now };

  try {
    const actual = resolveValue(test.assertion.left, results, model, runtime);
    const tolerance = test.assertion.tolerance ?? 1e-10;

    let status: TestStatus;
    let expected: unknown = test.assertion.right;

    switch (test.assertion.type) {
      case 'equals': {
        status = approxEqual(actual, expected, tolerance) ? 'pass' : 'fail';
        break;
      }
      case 'gt': {
        status = toNum(actual) > toNum(expected) ? 'pass' : 'fail';
        break;
      }
      case 'lt': {
        status = toNum(actual) < toNum(expected) ? 'pass' : 'fail';
        break;
      }
      case 'gte': {
        status = toNum(actual) >= toNum(expected) ? 'pass' : 'fail';
        break;
      }
      case 'lte': {
        status = toNum(actual) <= toNum(expected) ? 'pass' : 'fail';
        break;
      }
      case 'between': {
        const v = toNum(actual);
        const lo = toNum(test.assertion.rightB);
        const hi = toNum(expected);
        status = v >= lo && v <= hi ? 'pass' : 'fail';
        expected = `[${lo}, ${hi}]`;
        break;
      }
      case 'balance': {
        const right = resolveValue(test.assertion.right as string, results, model);
        status = approxEqual(actual, right, tolerance) ? 'pass' : 'fail';
        expected = right;
        break;
      }
      case 'non_negative': {
        status = toNum(actual) >= 0 ? 'pass' : 'fail';
        expected = '>= 0';
        break;
      }
      case 'is_numeric': {
        status = typeof actual === 'number' && isFinite(actual) ? 'pass' : 'fail';
        expected = 'finite number';
        break;
      }
      case 'custom': {
        status = 'skip';
        break;
      }

      // E10.1 — behavioral test types
      case 'regression_baseline': {
        // Snapshot comparison: each baseline output must match within tolerance.
        const baseline = test.assertion.baseline ?? {};
        const drifts: string[] = [];
        for (const [key, baseVal] of Object.entries(baseline)) {
          const cur = resolveValue(key, results, model, runtime);
          const bNum = typeof baseVal === 'number' ? baseVal : NaN;
          const cNum = typeof cur === 'number' ? cur : NaN;
          if (Number.isNaN(bNum) || Number.isNaN(cNum)) {
            if (cur !== baseVal) drifts.push(`${key}: ${baseVal} → ${cur}`);
          } else if (!approxEqual(cNum, bNum, tolerance)) {
            drifts.push(`${key}: ${baseVal} → ${cur}`);
          }
        }
        status = drifts.length === 0 ? 'pass' : 'fail';
        expected = 'baseline unchanged';
        return { ...base, status, actual: drifts.length ? drifts.join('; ') : 'within tolerance', expected, message: status === 'fail' ? `Outputs drifted from baseline: ${drifts.join('; ')}` : undefined };
      }
      case 'boundary': {
        // Run with min and max parameter values; assert no error outputs.
        if (!workbook) { status = 'skip'; expected = 'workbook required'; break; }
        const params = test.assertion.boundaryParams ?? [];
        const errs: string[] = [];
        for (const bp of params) {
          for (const v of [bp.min, bp.max]) {
            const fresh = new ModelRuntime(model, workbook).run([{ parameterId: bp.parameterId, value: v }]);
            for (const [oid, val] of Object.entries(fresh)) {
              const bad = (typeof val === 'string' && val.startsWith('#')) || (typeof val === 'number' && !isFinite(val));
              if (bad) errs.push(`${bp.parameterId}=${v} → ${oid}=${val}`);
            }
          }
        }
        status = errs.length === 0 ? 'pass' : 'fail';
        expected = 'no errors at parameter bounds';
        return { ...base, status, actual: errs.length ? errs.join('; ') : 'clean at bounds', expected, message: status === 'fail' ? `Errors at boundary: ${errs.join('; ')}` : undefined };
      }
      case 'consistency': {
        // Two related outputs must maintain a relationship (e.g. ratio in [lo,hi]).
        const pair = test.assertion.consistencyPair;
        if (!pair) { status = 'error'; return { ...base, status, message: 'consistencyPair required' }; }
        const a = toNum(resolveValue(pair[0], results, model, runtime));
        const b = toNum(resolveValue(pair[1], results, model, runtime));
        if (b === 0) { status = 'skip'; expected = 'denominator non-zero'; break; }
        const ratio = a / b;
        const lo = toNum(test.assertion.rightB ?? 0);
        const hi = toNum(test.assertion.right ?? Infinity);
        status = ratio >= lo && ratio <= hi ? 'pass' : 'fail';
        expected = `ratio ${pair[0]}/${pair[1]} ∈ [${lo}, ${hi}]`;
        return { ...base, status, actual: ratio, expected, message: status === 'fail' ? `Ratio ${ratio.toFixed(4)} outside [${lo}, ${hi}]` : undefined };
      }
      default:
        status = 'error';
    }

    return { ...base, status, actual, expected, message: status === 'fail' ? `Expected ${expected}, got ${actual}` : undefined };
  } catch (err: any) {
    return { ...base, status: 'error', message: err.message };
  }
}

function resolveValue(ref: string, results: Record<string, unknown>, model: Model, runtime?: ModelRuntime): unknown {
  // Meta-values for structural tests
  if (ref.startsWith('__meta_')) return resolveMetaValue(ref, model);
  // Try as output ID first
  if (ref in results) return results[ref];
  // Try as output name
  const output = model.outputs.find((o) => o.name === ref || o.id === ref);
  if (output && output.id in results) return results[output.id];
  // Try as parameter value
  const param = model.parameters.find((p) => p.id === ref || p.name === ref);
  if (param) return param.currentValue;
  // Try as a bare cell reference (Sheet!A1) against computed cell values
  if (runtime && ref.includes('!')) {
    const [sheet, cellRef] = ref.split('!');
    return runtime.getCellValue(sheet, cellRef);
  }
  return undefined;
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  const n = Number(v);
  if (isNaN(n)) throw new Error(`Cannot convert ${JSON.stringify(v)} to number`);
  return n;
}

function approxEqual(a: unknown, b: unknown, tolerance: number): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= tolerance;
  }
  return a === b;
}
