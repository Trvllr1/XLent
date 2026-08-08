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
      affectedOutputs: [],
      testResults: [],
      allTestsPass: false,
      contractFindings: [],
      validationIssues,
    };
  }

  const proposedModel = structuredClone(model);
  for (const operation of request.operations) {
    const parameter = proposedModel.parameters.find((candidate) => candidate.id === operation.parameterId)!;
    parameter.currentValue = operation.value;
  }

  const overrides = request.operations.map((operation) => ({
    parameterId: operation.parameterId,
    value: operation.value,
  }));
  const results = new ModelRuntime(proposedModel, workbook).run(overrides);
  proposedModel.outputs = proposedModel.outputs.map((output) => ({
    ...output,
    value: results[output.id],
  }));

  const initialDiff = diffModels(model, proposedModel);
  proposedModel.semver = bumpSemver(model.semver, initialDiff.suggestedBump);
  const testResults = runModelTests(proposedModel, workbook, tests);
  const contractFindings = proposedModel.contract
    ? reconcileContract(proposedModel, proposedModel.contract)
    : [];

  return {
    valid: true,
    baseVersion: model.version,
    proposedModel,
    diff: diffModels(model, proposedModel),
    affectedOutputs: findAffectedOutputs(model, request),
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

  request.operations.forEach((operation, operationIndex) => {
    if (targets.has(operation.parameterId)) {
      issues.push({
        code: 'duplicate_target',
        operationIndex,
        message: `Parameter "${operation.parameterId}" may only be changed once per atomic mutation.`,
      });
      return;
    }
    targets.add(operation.parameterId);

    const parameter = model.parameters.find((candidate) => candidate.id === operation.parameterId);
    if (!parameter) {
      issues.push({
        code: 'parameter_not_found',
        operationIndex,
        message: `Parameter "${operation.parameterId}" was not found.`,
      });
      return;
    }

    issues.push(...validateValue(parameter, operation.value, operationIndex));
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

function findAffectedOutputs(model: Model, request: MutationRequest): string[] {
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

  return model.outputs
    .filter((output) => visited.has(`${output.sourceCell.sheet}!${output.sourceCell.ref}`))
    .map((output) => output.id);
}