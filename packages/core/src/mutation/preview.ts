import crypto from 'crypto';
import { bumpSemver, diffModels } from '../diff.js';
import { reconcileContract } from '../contractReconcile.js';
import type { ParsedWorkbook } from '../parser.js';
import { ModelRuntime } from '../runtime.js';
import { runModelTests } from '../testRunner.js';
import type { Model, ModelTestDefinition, Parameter } from '../types.js';
import type { MutationPreview, MutationRequest, MutationValidationIssue } from './types.js';

export function previewMutation(
  model: Model,
  workbook: ParsedWorkbook,
  request: MutationRequest,
  tests: ModelTestDefinition[] = [],
): MutationPreview {
  const validationIssues = validateRequest(model, request);
  if (validationIssues.length > 0) {
    return {
      valid: false,
      baseVersion: model.version,
      affectedComponents: [],
      affectedOutputs: [],
      evidenceRefs: [],
      testResults: [],
      allTestsPass: false,
      contractFindings: [],
      validationIssues,
    };
  }

  const proposedModel = structuredClone(model);
  const proposedTests = structuredClone(tests);
  for (const operation of request.operations) {
    const parameter = proposedModel.parameters.find((candidate) => candidate.id === operation.parameterId)!;
    if (operation.type === 'setParameterValue') {
      parameter.currentValue = operation.value;
    } else {
      const previousName = parameter.name;
      parameter.name = operation.name.trim();
      renameContractReferences(proposedModel, previousName, parameter.name);
      renameTestReferences(proposedTests, previousName, parameter.name);
    }
  }

  const overrides = proposedModel.parameters.map((parameter) => ({
    parameterId: parameter.id,
    value: parameter.currentValue,
  }));
  const results = new ModelRuntime(proposedModel, workbook).run(overrides);
  proposedModel.outputs = proposedModel.outputs.map((output) => ({
    ...output,
    value: results[output.id],
  }));

  const initialDiff = diffModels(model, proposedModel);
  proposedModel.semver = bumpSemver(model.semver, initialDiff.suggestedBump);
  const testResults = runModelTests(proposedModel, workbook, proposedTests, overrides);
  const contractFindings = proposedModel.contract
    ? reconcileContract(proposedModel, proposedModel.contract)
    : [];
  const impact = findImpact(model, request);
  const diff = diffModels(model, proposedModel);
  const previewId = crypto.createHash('sha256').update(JSON.stringify({
    baseVersion: model.version,
    request,
    diff,
    affectedComponents: impact.components,
    affectedOutputs: impact.outputs,
    proposedTests,
    testResults: testResults.map(({ executedAt: _, ...result }) => result),
    contractFindings,
  })).digest('hex');

  return {
    valid: true,
    baseVersion: model.version,
    previewId,
    proposedModel,
    proposedTests,
    diff,
    affectedComponents: impact.components,
    affectedOutputs: impact.outputs,
    evidenceRefs: [{ kind: 'preview', checksum: previewId }],
    testResults,
    allTestsPass: testResults.every((result) => result.status === 'pass' || result.status === 'skip'),
    contractFindings,
    validationIssues: [],
  };
}

function validateRequest(model: Model, request: MutationRequest): MutationValidationIssue[] {
  if (request.operations.length === 0) {
    return [{ code: 'empty_batch', message: 'A mutation request must contain at least one operation.' }];
  }

  const issues: MutationValidationIssue[] = [];
  const targets = new Set<string>();
  const proposedNames = new Map(model.parameters.map((parameter) => [parameter.id, parameter.name.toLowerCase()]));

  for (const operation of request.operations) {
    if (operation.type === 'renameParameter') proposedNames.set(operation.parameterId, operation.name.trim().toLowerCase());
  }

  request.operations.forEach((operation, operationIndex) => {
    const target = `${operation.type}:${operation.parameterId}`;
    if (targets.has(target)) {
      issues.push({
        code: 'duplicate_target',
        operationIndex,
        message: `Parameter "${operation.parameterId}" may only be changed once per atomic mutation.`,
      });
      return;
    }
    targets.add(target);

    const parameter = model.parameters.find((candidate) => candidate.id === operation.parameterId);
    if (!parameter) {
      issues.push({
        code: 'parameter_not_found',
        operationIndex,
        message: `Parameter "${operation.parameterId}" was not found.`,
      });
      return;
    }

    if (operation.type === 'setParameterValue') {
      issues.push(...validateValue(parameter, operation.value, operationIndex));
    } else {
      const name = operation.name.trim();
      if (!name) {
        issues.push({ code: 'invalid_name', operationIndex, message: 'Parameter name cannot be blank.' });
      } else if ([...proposedNames].some(([parameterId, proposedName]) => parameterId !== parameter.id && proposedName === name.toLowerCase())) {
        issues.push({ code: 'duplicate_name', operationIndex, message: `Parameter name "${name}" is already in use.` });
      }
    }
  });

  return issues;
}

function validateValue(parameter: Parameter, value: unknown, operationIndex: number): MutationValidationIssue[] {
  const expectedType = parameter.type === 'date' ? 'string' : parameter.type;
  if (expectedType !== 'blank' && expectedType !== 'error' && typeof value !== expectedType) {
    return [{
      code: 'invalid_type',
      operationIndex,
      message: `Parameter "${parameter.id}" requires a ${expectedType} value.`,
    }];
  }

  if (typeof value === 'number' && parameter.allowedRange) {
    if (parameter.allowedRange.min !== undefined && value < parameter.allowedRange.min) {
      return [{
        code: 'outside_allowed_range',
        operationIndex,
        message: `Parameter "${parameter.id}" must be at least ${parameter.allowedRange.min}.`,
      }];
    }
    if (parameter.allowedRange.max !== undefined && value > parameter.allowedRange.max) {
      return [{
        code: 'outside_allowed_range',
        operationIndex,
        message: `Parameter "${parameter.id}" must be at most ${parameter.allowedRange.max}.`,
      }];
    }
  }

  return [];
}

function findImpact(model: Model, request: MutationRequest): { components: string[]; outputs: string[] } {
  const queue = request.operations.map((operation) => {
    const parameter = model.parameters.find((candidate) => candidate.id === operation.parameterId)!;
    return `${parameter.sourceCell.sheet}!${parameter.sourceCell.ref}`;
  });
  const visited = new Set(queue);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of model.graph.edges) {
      if (edge.from === current && !visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }

  const outputs = model.outputs
    .filter((output) => visited.has(`${output.sourceCell.sheet}!${output.sourceCell.ref}`))
    .map((output) => output.id);
  return { components: [...visited], outputs };
}

function renameContractReferences(model: Model, previousName: string, nextName: string): void {
  if (!model.contract) return;
  const protectedNames = [
    ...model.contract.declaredInputs.map((input) => input.name),
    ...model.contract.declaredOutputs.map((output) => output.name),
  ].filter((name) => name !== previousName && name.includes(previousName));
  for (const input of model.contract.declaredInputs) {
    if (input.name === previousName) input.name = nextName;
  }
  for (const invariant of model.contract.invariants) invariant.expression = replaceName(invariant.expression, previousName, nextName, protectedNames);
  for (const rule of model.contract.rules) rule.expression = replaceName(rule.expression, previousName, nextName, protectedNames);
  for (const behavior of model.contract.behaviors ?? []) behavior.statement = replaceName(behavior.statement, previousName, nextName, protectedNames);
}

function renameTestReferences(tests: ModelTestDefinition[], previousName: string, nextName: string): void {
  for (const test of tests) {
    if (test.assertion.left === previousName) test.assertion.left = nextName;
    if (test.assertion.right === previousName) test.assertion.right = nextName;
    if (test.assertion.consistencyPair) {
      test.assertion.consistencyPair = test.assertion.consistencyPair.map((name) => name === previousName ? nextName : name) as [string, string];
    }
  }
}

function replaceName(value: string, previousName: string, nextName: string, protectedNames: string[]): string {
  const replacements = protectedNames
    .sort((left, right) => right.length - left.length)
    .map((name, index) => ({ name, placeholder: `__XLENT_SYMBOL_${index}__` }));
  let result = value;
  for (const replacement of replacements) result = result.replaceAll(replacement.name, replacement.placeholder);
  const escaped = previousName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  result = result.replace(new RegExp(`\\b${escaped}\\b`, 'g'), nextName);
  for (const replacement of replacements) result = result.replaceAll(replacement.placeholder, replacement.name);
  return result;
}