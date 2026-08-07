import type { Model, ModelContract } from './types.js';

/**
 * §11.3 Inferred Intent — build a draft ModelContract from the discovered model.
 * Everything here is workbook-derived inference (authority level 4) and is marked
 * as such: the caller is expected to surface it as INFERRED until a steward
 * confirms. It is a starting point, never authoritative on its own.
 */
export function inferContract(model: Model): ModelContract & { _inferred: true; _authority: 'workbook-inference' } {
  const declaredInputs = model.parameters.map((p) => ({
    name: p.name,
    description: `Discovered input at ${p.sourceCell.sheet}!${p.sourceCell.ref}`,
  }));

  const declaredOutputs = model.outputs.map((o) => ({
    name: o.name,
    meaning: `Discovered output at ${o.sourceCell.sheet}!${o.sourceCell.ref}`,
    // Infer a coarse expectation from the observed value's sign
    expectation:
      typeof o.value === 'number' && o.value >= 0 ? 'non-negative' : undefined,
  }));

  // Purpose: derive from workbook name + the dominant output label
  const primaryOutput = model.outputs[0]?.name;
  const purpose = primaryOutput
    ? `Computes ${primaryOutput} (inferred from ${model.workbookName})`
    : `Model inferred from ${model.workbookName}`;

  return {
    _inferred: true,
    _authority: 'workbook-inference',
    purpose,
    declaredInputs,
    declaredOutputs,
    invariants: [],
    rules: [],
    behaviors: [],
    version: '0.1.0-inferred',
  };
}
