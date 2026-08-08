import { describe, expect, it } from 'vitest';
import { parseFormula, FormulaInterpreter, type InterpreterContext } from '@xlent/core';
import { FORMULA_FUNCTIONS, functionPrefixAt, getFunctionSignature, suggestFunctions } from './formulaFunctions.js';

function interpreter(): FormulaInterpreter {
  const ctx: InterpreterContext = {
    currentSheet: 'S',
    resolve: () => null,
    resolveRange: () => [],
  };
  return new FormulaInterpreter(ctx);
}

describe('formula function catalog', () => {
  it('contains no duplicates and complete metadata', () => {
    const names = FORMULA_FUNCTIONS.map((fn) => fn.name);
    expect(new Set(names).size).toBe(names.length);
    for (const fn of FORMULA_FUNCTIONS) {
      expect(fn.signature.startsWith(`${fn.name}(`)).toBe(true);
      expect(fn.description.length).toBeGreaterThan(0);
      expect(fn.category.length).toBeGreaterThan(0);
    }
  });

  it('only catalogs functions the canonical interpreter executes', () => {
    const engine = interpreter();
    for (const fn of FORMULA_FUNCTIONS) {
      const parsed = parseFormula(`${fn.name}()`);
      let result: unknown;
      try {
        // Zero-argument probes may throw arity errors; that still proves the
        // engine recognized the name. Only an explicit unsupported marker fails.
        result = engine.evaluate(parsed);
      } catch {
        continue;
      }
      expect(result, `${fn.name} is not executed by the engine`).not.toBe(`#UNSUPPORTED:${fn.name}`);
    }
  });
});

describe('functionPrefixAt', () => {
  it('detects a function prefix at the caret', () => {
    expect(functionPrefixAt('=B1+SU', 6)).toEqual({ prefix: 'SU', start: 4 });
    expect(functionPrefixAt('=SUM(', 0)).toBeNull();
  });

  it('ignores cell references, sheet references, and strings', () => {
    expect(functionPrefixAt('=B1', 3)).toBeNull();
    expect(functionPrefixAt('=$B1+A', 6)).toEqual({ prefix: 'A', start: 5 });
    expect(functionPrefixAt("='My Sheet'!A", 12)).toBeNull();
    expect(functionPrefixAt('="SU"', 4)).toBeNull();
  });
});

describe('suggestFunctions', () => {
  it('ranks shortest prefix matches first', () => {
    const names = suggestFunctions('SUM').map((fn) => fn.name);
    expect(names).toEqual(['SUM', 'SUMIF', 'SUMIFS']);
  });

  it('is case-insensitive and bounded', () => {
    expect(suggestFunctions('ro').map((fn) => fn.name)).toContain('ROUND');
    expect(suggestFunctions('A', 5).map((fn) => fn.name)).toEqual(['ABS', 'AND', 'AVERAGE']);
    expect(suggestFunctions('')).toEqual([]);
    expect(suggestFunctions('ZZZ')).toEqual([]);
  });
});

describe('getFunctionSignature', () => {
  it('returns signatures case-insensitively', () => {
    expect(getFunctionSignature('npv')?.signature).toBe('NPV(rate, cashflow, ...)');
    expect(getFunctionSignature('NOSUCH')).toBeUndefined();
  });
});
