import { describe, expect, it } from 'vitest';
import { compileNativeModel, getNativeTemplate, ModelRuntime, runModelTests } from '../index.js';

describe('native model compiler', () => {
  it('compiles semantic components into the canonical runtime without a source workbook', () => {
    const template = getNativeTemplate('unit-economics');
    expect(template).toBeDefined();

    const compiled = compileNativeModel(template!.definition, {
      id: '48a72f76-16f1-4ea8-9050-dccaf76b7cbb',
      createdAt: '2026-08-08T00:00:00.000Z',
    });
    const results = new ModelRuntime(compiled.model, compiled.workbook).run();

    expect(compiled.model.sourceKind).toBe('native');
    expect(compiled.model.workbookName).toBe('');
    expect(compiled.model.parameters.map((parameter) => parameter.semanticKey)).toEqual([
      'units', 'price', 'variable_cost', 'fixed_cost',
    ]);
    expect(compiled.model.calculations.map((calculation) => calculation.semanticKey)).toEqual([
      'revenue', 'contribution', 'operating_profit', 'operating_margin',
    ]);
    expect(Object.values(results)).toEqual([120000, 30000, 0.25]);
    expect(runModelTests(compiled.model, compiled.workbook, compiled.tests).every((result) => result.status === 'pass')).toBe(true);
    expect(compiled.model.contract?.rules).toHaveLength(2);
    expect(compiled.model.documentation).toContain('native operating model');
    expect(compiled.scenarios).toEqual([{ name: 'Higher volume', overrides: { units: 1250 } }]);
  });
});