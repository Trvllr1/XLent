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
  const validationIssues = validateRequest(model, request, tests);
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
    if (operation.type === 'renameOutput') {
      const output = proposedModel.outputs.find((candidate) => candidate.id === operation.outputId)!;
      const previousName = output.name;
      output.name = operation.name.trim();
      renameContractReferences(proposedModel, previousName, output.name, 'output');
      renameTestReferences(proposedTests, previousName, output.name);
      continue;
    }
    if (operation.type === 'moveOutput') {
      const fromIndex = proposedModel.outputs.findIndex((candidate) => candidate.id === operation.outputId);
      const [moved] = proposedModel.outputs.splice(fromIndex, 1);
      proposedModel.outputs.splice(operation.toIndex, 0, moved);
      continue;
    }
    if (operation.type === 'removeOutput') {
      proposedModel.outputs = proposedModel.outputs.filter((candidate) => candidate.id !== operation.outputId);
      continue;
    }
    if (operation.type === 'restoreOutput') {
      proposedModel.outputs.splice(operation.index, 0, structuredClone(operation.output));
      continue;
    }
    if (operation.type === 'restoreParameter') {
      proposedModel.parameters.splice(operation.index, 0, structuredClone(operation.parameter));
      const cellId = `${operation.parameter.sourceCell.sheet}!${operation.parameter.sourceCell.ref}`;
      if (!proposedModel.graph.nodes.includes(cellId)) proposedModel.graph.nodes.splice(operation.graphIndex, 0, cellId);
      continue;
    }
    const parameter = proposedModel.parameters.find((candidate) => candidate.id === operation.parameterId)!;
    if (operation.type === 'setParameterValue') {
      parameter.currentValue = operation.value;
    } else if (operation.type === 'renameParameter') {
      const previousName = parameter.name;
      parameter.name = operation.name.trim();
      renameContractReferences(proposedModel, previousName, parameter.name, 'input');
      renameTestReferences(proposedTests, previousName, parameter.name);
    } else if (operation.type === 'removeParameter') {
      const cellId = `${parameter.sourceCell.sheet}!${parameter.sourceCell.ref}`;
      proposedModel.parameters = proposedModel.parameters.filter((candidate) => candidate.id !== parameter.id);
      proposedModel.graph.nodes = proposedModel.graph.nodes.filter((node) => node !== cellId);
      proposedModel.graph.edges = proposedModel.graph.edges.filter((edge) => edge.from !== cellId && edge.to !== cellId);
    } else {
      const fromIndex = proposedModel.parameters.findIndex((candidate) => candidate.id === parameter.id);
      const [moved] = proposedModel.parameters.splice(fromIndex, 1);
      proposedModel.parameters.splice(operation.toIndex, 0, moved);
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

function validateRequest(model: Model, request: MutationRequest, tests: ModelTestDefinition[]): MutationValidationIssue[] {
  if (request.operations.length === 0) {
    return [{ code: 'empty_batch', message: 'A mutation request must contain at least one operation.' }];
  }

  const issues: MutationValidationIssue[] = [];
  const targets = new Set<string>();
  const structuralConflicts = new Set(request.operations
    .filter((operation) => ['removeParameter', 'restoreParameter', 'removeOutput', 'restoreOutput'].includes(operation.type)
      && request.operations.some((candidate) => candidate !== operation && operationTargetId(candidate) === operationTargetId(operation)))
    .map(operationTargetId));
  const proposedNames = new Map(model.parameters.map((parameter) => [parameter.id, parameter.name.toLowerCase()]));
  const proposedOutputNames = new Map(model.outputs.map((output) => [output.id, output.name.toLowerCase()]));

  for (const operation of request.operations) {
    if (operation.type === 'renameParameter') proposedNames.set(operation.parameterId, operation.name.trim().toLowerCase());
    if (operation.type === 'restoreParameter') proposedNames.set(operation.parameterId, operation.parameter.name.toLowerCase());
    if (operation.type === 'renameOutput') proposedOutputNames.set(operation.outputId, operation.name.trim().toLowerCase());
    if (operation.type === 'restoreOutput') proposedOutputNames.set(operation.outputId, operation.output.name.toLowerCase());
  }

  request.operations.forEach((operation, operationIndex) => {
    const operationId = operationTargetId(operation);
    if (structuralConflicts.has(operationId)) {
      if (!issues.some((issue) => issue.code === 'duplicate_target' && issue.message.includes(operationId))) {
        issues.push({ code: 'duplicate_target', operationIndex, message: `Structural change for component "${operationId}" cannot be combined with another operation on that component.` });
      }
      return;
    }
    const target = `${operation.type}:${operationId}`;
    if (targets.has(target)) {
      issues.push({
        code: 'duplicate_target',
        operationIndex,
        message: `Component "${operationId}" may only be changed once per atomic mutation.`,
      });
      return;
    }
    targets.add(target);

    if (operation.type === 'restoreOutput') {
      if (model.outputs.some((candidate) => candidate.id === operation.outputId)) {
        issues.push({ code: 'output_already_exists', operationIndex, message: `Output "${operation.outputId}" already exists.` });
      }
      if ([...proposedOutputNames].some(([outputId, name]) => outputId !== operation.outputId && name === operation.output.name.toLowerCase())) {
        issues.push({ code: 'duplicate_name', operationIndex, message: `Output name "${operation.output.name}" is already in use.` });
      }
      if (!Number.isInteger(operation.index) || operation.index < 0 || operation.index > model.outputs.length) {
        issues.push({ code: 'invalid_index', operationIndex, message: `Output position must be between 0 and ${model.outputs.length}.` });
      }
      return;
    }

    if (operation.type === 'renameOutput' || operation.type === 'moveOutput' || operation.type === 'removeOutput') {
      const output = model.outputs.find((candidate) => candidate.id === operation.outputId);
      if (!output) {
        issues.push({ code: 'output_not_found', operationIndex, message: `Output "${operation.outputId}" was not found.` });
        return;
      }
      if (operation.type === 'renameOutput') {
        const name = operation.name.trim();
        if (!name) {
          issues.push({ code: 'invalid_name', operationIndex, message: 'Output name cannot be blank.' });
        } else if ([...proposedOutputNames].some(([outputId, proposedName]) => outputId !== output.id && proposedName === name.toLowerCase())) {
          issues.push({ code: 'duplicate_name', operationIndex, message: `Output name "${name}" is already in use.` });
        }
      } else if (operation.type === 'removeOutput') {
        if (contractReferencesName(model, output.name)) {
          issues.push({ code: 'output_has_contract_refs', operationIndex, message: `Output "${output.name}" cannot be removed while the model contract references it.` });
        }
        if (tests.some((test) => testReferencesOutput(test, output))) {
          issues.push({ code: 'output_has_test_refs', operationIndex, message: `Output "${output.name}" cannot be removed while model tests reference it.` });
        }
      } else if (!Number.isInteger(operation.toIndex) || operation.toIndex < 0 || operation.toIndex >= model.outputs.length) {
        issues.push({ code: 'invalid_index', operationIndex, message: `Output position must be between 0 and ${model.outputs.length - 1}.` });
      }
      return;
    }

    if (operation.type === 'restoreParameter') {
      if (model.parameters.some((candidate) => candidate.id === operation.parameterId)) {
        issues.push({ code: 'parameter_already_exists', operationIndex, message: `Parameter "${operation.parameterId}" already exists.` });
      }
      if ([...proposedNames].some(([parameterId, name]) => parameterId !== operation.parameterId && name === operation.parameter.name.toLowerCase())) {
        issues.push({ code: 'duplicate_name', operationIndex, message: `Parameter name "${operation.parameter.name}" is already in use.` });
      }
      return;
    }

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
    } else if (operation.type === 'renameParameter') {
      const name = operation.name.trim();
      if (!name) {
        issues.push({ code: 'invalid_name', operationIndex, message: 'Parameter name cannot be blank.' });
      } else if ([...proposedNames].some(([parameterId, proposedName]) => parameterId !== parameter.id && proposedName === name.toLowerCase())) {
        issues.push({ code: 'duplicate_name', operationIndex, message: `Parameter name "${name}" is already in use.` });
      }
    } else if (operation.type === 'removeParameter') {
      const cellId = `${parameter.sourceCell.sheet}!${parameter.sourceCell.ref}`;
      const consumers = model.graph.edges.filter((edge) => edge.from === cellId).map((edge) => edge.to);
      const isOutput = model.outputs.some((output) => `${output.sourceCell.sheet}!${output.sourceCell.ref}` === cellId);
      if (consumers.length > 0 || isOutput) {
        issues.push({ code: 'parameter_has_consumers', operationIndex, message: `Parameter "${parameter.name}" cannot be removed because ${consumers.length + (isOutput ? 1 : 0)} model component(s) consume it.` });
      }
      if (contractReferencesName(model, parameter.name)) {
        issues.push({ code: 'parameter_has_contract_refs', operationIndex, message: `Parameter "${parameter.name}" cannot be removed while the model contract references it.` });
      }
      if (tests.some((test) => testReferencesParameter(test, parameter))) {
        issues.push({ code: 'parameter_has_test_refs', operationIndex, message: `Parameter "${parameter.name}" cannot be removed while model tests reference it.` });
      }
    } else if (!Number.isInteger(operation.toIndex) || operation.toIndex < 0 || operation.toIndex >= model.parameters.length) {
      issues.push({ code: 'invalid_index', operationIndex, message: `Parameter position must be between 0 and ${model.parameters.length - 1}.` });
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
  const queue = request.operations.filter((operation) => operation.type !== 'moveParameter' && operation.type !== 'moveOutput').map((operation) => {
    if (operation.type === 'renameOutput' || operation.type === 'removeOutput' || operation.type === 'restoreOutput') {
      const output = operation.type === 'restoreOutput'
        ? operation.output
        : model.outputs.find((candidate) => candidate.id === operation.outputId)!;
      return `${output.sourceCell.sheet}!${output.sourceCell.ref}`;
    }
    const parameter = operation.type === 'restoreParameter'
      ? operation.parameter
      : model.parameters.find((candidate) => candidate.id === operation.parameterId)!;
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

function renameContractReferences(model: Model, previousName: string, nextName: string, declaration: 'input' | 'output'): void {
  if (!model.contract) return;
  const protectedNames = [
    ...model.contract.declaredInputs.map((input) => input.name),
    ...model.contract.declaredOutputs.map((output) => output.name),
  ].filter((name) => name !== previousName && name.includes(previousName));
  const declarations = declaration === 'input' ? model.contract.declaredInputs : model.contract.declaredOutputs;
  for (const item of declarations) {
    if (item.name === previousName) item.name = nextName;
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

function contractReferencesName(model: Model, name: string): boolean {
  if (!model.contract) return false;
  if (model.contract.declaredInputs.some((input) => input.name === name)) return true;
  if (model.contract.declaredOutputs.some((output) => output.name === name)) return true;
  const expressions = [
    ...model.contract.invariants.map((invariant) => invariant.expression),
    ...model.contract.rules.map((rule) => rule.expression),
    ...(model.contract.behaviors ?? []).map((behavior) => behavior.statement),
  ];
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return expressions.some((expression) => new RegExp(`\\b${escaped}\\b`).test(expression));
}

function testReferencesParameter(test: ModelTestDefinition, parameter: Parameter): boolean {
  const assertion = test.assertion;
  return assertion.left === parameter.name
    || assertion.right === parameter.name
    || assertion.consistencyPair?.includes(parameter.name) === true
    || assertion.boundaryParams?.some((boundary) => boundary.parameterId === parameter.id) === true;
}

function testReferencesOutput(test: ModelTestDefinition, output: Model['outputs'][number]): boolean {
  const assertion = test.assertion;
  return assertion.left === output.name
    || assertion.right === output.name
    || assertion.consistencyPair?.includes(output.name) === true;
}

function operationTargetId(operation: MutationRequest['operations'][number]): string {
  return operation.type === 'renameOutput' || operation.type === 'moveOutput' || operation.type === 'removeOutput' || operation.type === 'restoreOutput'
    ? operation.outputId
    : operation.parameterId;
}