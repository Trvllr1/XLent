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

  return tests.map((test) => runSingleTest(test, results, model));
}

function runSingleTest(
  test: ModelTestDefinition,
  results: Record<string, unknown>,
  model: Model,
): ModelTestResult {
  const now = new Date().toISOString();
  const base = { testId: test.id, name: test.name, category: test.category, executedAt: now };

  try {
    const actual = resolveValue(test.assertion.left, results, model);
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
      case 'custom': {
        status = 'skip';
        break;
      }
      default:
        status = 'error';
    }

    return { ...base, status, actual, expected, message: status === 'fail' ? `Expected ${expected}, got ${actual}` : undefined };
  } catch (err: any) {
    return { ...base, status: 'error', message: err.message };
  }
}

function resolveValue(ref: string, results: Record<string, unknown>, model: Model): unknown {
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
