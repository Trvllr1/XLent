import type { Model, ModelDiff, DiffEntry, SuggestedBump } from './types.js';
import { parseFormula, normalizeFormula } from './ast/index.js';

export function diffModels(from: Model, to: Model): ModelDiff {
  const entries: DiffEntry[] = [];

  // Compare parameters
  const fromParams = new Map(from.parameters.map((p) => [p.id, p]));
  const toParams = new Map(to.parameters.map((p) => [p.id, p]));

  for (const [id, param] of toParams) {
    if (!fromParams.has(id)) {
      entries.push({ path: `parameters.${param.name}`, changeType: 'added', semantics: 'semantic', after: param.currentValue, description: `Parameter "${param.name}" added` });
    } else {
      const prev = fromParams.get(id)!;
      if (prev.name !== param.name) {
        entries.push({ path: `parameters.${prev.name}.name`, changeType: 'modified', semantics: 'semantic', before: prev.name, after: param.name, description: `Parameter "${prev.name}" renamed to "${param.name}"` });
      }
      if (prev.currentValue !== param.currentValue) {
        entries.push({ path: `parameters.${param.name}.value`, changeType: 'modified', semantics: 'semantic', before: prev.currentValue, after: param.currentValue, description: `Parameter "${param.name}" value changed` });
      }
    }
  }
  for (const [id, param] of fromParams) {
    if (!toParams.has(id)) {
      entries.push({ path: `parameters.${param.name}`, changeType: 'removed', semantics: 'semantic', before: param.currentValue, description: `Parameter "${param.name}" removed` });
    }
  }

  const fromParameterOrder = from.parameters.map((parameter) => parameter.id);
  const toParameterOrder = to.parameters.map((parameter) => parameter.id);
  if (fromParameterOrder.length === toParameterOrder.length
    && fromParameterOrder.every((id) => toParams.has(id))
    && fromParameterOrder.some((id, index) => toParameterOrder[index] !== id)) {
    entries.push({ path: 'parameters.order', changeType: 'modified', semantics: 'cosmetic', before: fromParameterOrder, after: toParameterOrder, description: 'Parameter display order changed' });
  }

  // Compare outputs
  const fromOutputs = new Map(from.outputs.map((o) => [o.name, o]));
  const toOutputs = new Map(to.outputs.map((o) => [o.name, o]));

  for (const [name, output] of toOutputs) {
    if (!fromOutputs.has(name)) {
      entries.push({ path: `outputs.${name}`, changeType: 'added', semantics: 'semantic', after: output.value, description: `Output "${name}" added` });
    } else {
      const prev = fromOutputs.get(name)!;
      if (prev.value !== output.value) {
        entries.push({ path: `outputs.${name}.value`, changeType: 'modified', semantics: 'semantic', before: prev.value, after: output.value, description: `Output "${name}" value changed` });
      }
    }
  }
  for (const [name] of fromOutputs) {
    if (!toOutputs.has(name)) {
      entries.push({ path: `outputs.${name}`, changeType: 'removed', semantics: 'semantic', before: fromOutputs.get(name)!.value, description: `Output "${name}" removed` });
    }
  }

  // Compare calculations (AST-canonical formula comparison, E0.4)
  const calcKey = (c: { sourceCell: { sheet: string; ref: string } }) => `${c.sourceCell.sheet}!${c.sourceCell.ref}`;
  const fromCalcs = new Map(from.calculations.map((c) => [calcKey(c), c]));
  const toCalcs = new Map(to.calculations.map((c) => [calcKey(c), c]));

  for (const [ref, calc] of toCalcs) {
    if (!fromCalcs.has(ref)) {
      entries.push({ path: `calculations.${ref}`, changeType: 'added', semantics: 'semantic', description: `Calculation at ${ref} added` });
    } else {
      const prev = fromCalcs.get(ref)!;
      if (prev.originalFormula !== calc.originalFormula) {
        const semantics = isCosmetic(prev, calc) ? 'cosmetic' : 'semantic';
        entries.push({ path: `calculations.${ref}.formula`, changeType: 'modified', semantics, before: prev.originalFormula, after: calc.originalFormula, description: `Formula at ${ref} changed` });
      }
    }
  }
  for (const [ref] of fromCalcs) {
    if (!toCalcs.has(ref)) {
      entries.push({ path: `calculations.${ref}`, changeType: 'removed', semantics: 'semantic', description: `Calculation at ${ref} removed` });
    }
  }

  const suggestedBump = determineBump(entries);
  const summary = generateSummary(entries, suggestedBump);

  return { fromVersion: from.semver, toVersion: to.semver, entries, suggestedBump, summary };
}

// Cosmetic change = formulas are identical in AST-canonical form (ref-style only,
// e.g. $A$1 vs A1). Semantic = the canonical structure differs.
function isCosmetic(a: { originalFormula: string; normalizedFormula?: string }, b: { originalFormula: string; normalizedFormula?: string }): boolean {
  return canonical(a) === canonical(b);
}

function canonical(c: { originalFormula: string; normalizedFormula?: string }): string {
  if (c.normalizedFormula) return c.normalizedFormula;
  try {
    return normalizeFormula(parseFormula(c.originalFormula));
  } catch {
    return c.originalFormula.replace(/\$/g, ''); // last-resort: strip ref style
  }
}

function determineBump(entries: DiffEntry[]): SuggestedBump {
  const hasRemoval = entries.some((e) => e.changeType === 'removed' && e.semantics === 'semantic');
  if (hasRemoval) return 'major';

  const hasSemanticChange = entries.some((e) => (e.changeType === 'added' || e.changeType === 'modified') && e.semantics === 'semantic');
  if (hasSemanticChange) return 'minor';

  return 'patch';
}

function generateSummary(entries: DiffEntry[], bump: SuggestedBump): string {
  if (entries.length === 0) return 'No changes detected.';

  const added = entries.filter((e) => e.changeType === 'added').length;
  const removed = entries.filter((e) => e.changeType === 'removed').length;
  const modified = entries.filter((e) => e.changeType === 'modified').length;
  const semantic = entries.filter((e) => e.semantics === 'semantic').length;
  const cosmetic = entries.filter((e) => e.semantics === 'cosmetic').length;

  const parts: string[] = [];
  if (added) parts.push(`${added} added`);
  if (removed) parts.push(`${removed} removed`);
  if (modified) parts.push(`${modified} modified`);
  parts.push(`(${semantic} semantic, ${cosmetic} cosmetic)`);

  return `${parts.join(', ')}. Suggested bump: ${bump}.`;
}

export function bumpSemver(semver: string, bump: SuggestedBump): string {
  const parts = semver.split('.').map(Number);
  switch (bump) {
    case 'major': return `${parts[0] + 1}.0.0`;
    case 'minor': return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch': return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}
