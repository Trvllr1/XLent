import crypto from 'crypto';
import { bumpSemver, diffModels } from '../diff.js';
import { reconcileContract } from '../contractReconcile.js';
import { buildCalculations, discoverModel, isUnsupportedFunction } from '../discovery.js';
import { buildGraph, detectCycles, extractDependencies, traceUpstream } from '../graph.js';
import { collectFunctionCalls, parseFormula } from '../ast/index.js';
import type { ParsedWorkbook } from '../parser.js';
import { ModelRuntime } from '../runtime.js';
import { runModelTests } from '../testRunner.js';
import type { DependencyGraph, Model, ModelTestDefinition, Parameter } from '../types.js';
import type { BreakpointOperator, MutationBreakpointResult, MutationPreview, MutationRequest, MutationValidationIssue } from './types.js';

export function previewMutation(
  model: Model,
  workbook: ParsedWorkbook,
  request: MutationRequest,
  tests: ModelTestDefinition[] = [],
): MutationPreview {
  const validationIssues = validateRequest(model, workbook, request, tests);
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
  const hasFormulaOps = request.operations.some((operation) => ['setCellFormula', 'setParameterSource', 'restoreParameterSource', 'extractFormula'].includes(operation.type));
  const proposedWorkbook = hasFormulaOps ? structuredClone(workbook) : undefined;
  for (const operation of request.operations) {
    if (operation.type === 'extractFormula') {
      const componentSheetName = 'XLent Components';
      let componentSheet = proposedWorkbook!.sheets.find((sheet) => sheet.name === componentSheetName);
      if (!componentSheet) {
        componentSheet = { name: componentSheetName, cells: [] };
        proposedWorkbook!.sheets.push(componentSheet);
      }
      const componentRef = `A${componentSheet.cells.length + 1}`;
      const qualifiedFormula = qualifyFormula(operation.formula.trim().replace(/^=+/, ''), operation.retargetCell.sheet);
      componentSheet.cells.push({
        address: { sheet: componentSheetName, ref: componentRef },
        value: undefined,
        type: 'number',
        formula: qualifiedFormula,
      });
      const retargetSheet = proposedWorkbook!.sheets.find((sheet) => sheet.name === operation.retargetCell.sheet)!;
      const retargetTarget = retargetSheet.cells.find((cell) => cell.address.ref === operation.retargetCell.ref)!;
      retargetTarget.formula = `'${componentSheetName}'!${componentRef}`;
      continue;
    }
    if (operation.type === 'restoreParameterSource') {
      const parameter = proposedModel.parameters.find((candidate) => candidate.id === operation.parameterId)!;
      const sheet = proposedWorkbook!.sheets.find((candidate) => candidate.name === parameter.sourceCell.sheet)!;
      const cell = sheet.cells.find((candidate) => candidate.address.ref === parameter.sourceCell.ref)!;
      delete cell.formula;
      parameter.source = 'CLIENT_MODEL';
      continue;
    }
    if (operation.type === 'setParameterSource') {
      const parameter = proposedModel.parameters.find((candidate) => candidate.id === operation.parameterId)!;
      const sheet = proposedWorkbook!.sheets.find((candidate) => candidate.name === parameter.sourceCell.sheet)!;
      const cell = sheet.cells.find((candidate) => candidate.address.ref === parameter.sourceCell.ref)!;
      cell.formula = operation.formula.trim().replace(/^=+/, '');
      parameter.source = 'EXTERNAL_DATA';
      continue;
    }
    if (operation.type === 'setCellFormula') {
      const sheet = proposedWorkbook!.sheets.find((candidate) => candidate.name === operation.sourceCell.sheet)!;
      const cell = sheet.cells.find((candidate) => candidate.address.ref === operation.sourceCell.ref)!;
      cell.formula = operation.formula.trim().replace(/^=+/, '');
      continue;
    }
    if (operation.type === 'addParameter') {
      const sourceCell = nextVirtualParameterCell(proposedModel);
      proposedModel.parameters.push({
        id: operation.parameterId,
        name: operation.name.trim(),
        type: operation.parameterType,
        currentValue: operation.value,
        originalValue: operation.value,
        sourceCell,
        source: 'USER_OVERRIDE',
        confidence: 'HIGH',
        confirmed: true,
      });
      proposedModel.graph.nodes.push(`${sourceCell.sheet}!${sourceCell.ref}`);
      continue;
    }
    if (operation.type === 'addOutput') {
      const source = workbook.sheets.find((sheet) => sheet.name === operation.sourceCell.sheet)?.cells.find((cell) => cell.address.ref === operation.sourceCell.ref)!;
      const upstream = new Set(traceUpstream(proposedModel.graph, `${operation.sourceCell.sheet}!${operation.sourceCell.ref}`));
      proposedModel.outputs.push({
        id: operation.outputId,
        name: operation.name.trim(),
        value: source.value,
        format: source.format,
        sourceCell: structuredClone(operation.sourceCell),
        dependsOn: proposedModel.parameters.filter((parameter) => upstream.has(`${parameter.sourceCell.sheet}!${parameter.sourceCell.ref}`)).map((parameter) => parameter.id),
        confidence: 'HIGH',
        confirmed: true,
      });
      continue;
    }
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

  let effectiveWorkbook = workbook;
  if (proposedWorkbook) {
    // Prune the virtual component sheet if no formula references it after edits.
    const componentSheetName = 'XLent Components';
    const componentRefs = proposedWorkbook.sheets
      .filter((sheet) => sheet.name !== componentSheetName)
      .flatMap((sheet) => sheet.cells)
      .filter((cell) => cell.formula?.includes(componentSheetName))
      .length;
    if (componentRefs === 0) {
      proposedWorkbook.sheets = proposedWorkbook.sheets.filter((sheet) => sheet.name !== componentSheetName);
    }
    const proposedGraph = buildGraph(proposedWorkbook);
    const cycles = detectCycles(proposedGraph);
    if (cycles.length > 0) {
      return {
        valid: false,
        baseVersion: model.version,
        affectedComponents: [],
        affectedOutputs: [],
        evidenceRefs: [],
        testResults: [],
        allTestsPass: false,
        contractFindings: [],
        validationIssues: [{ code: 'formula_introduces_cycle', message: `Proposed formula introduces a circular dependency: ${cycles[0].join(' → ')}.` }],
      };
    }
    proposedModel.graph = proposedGraph;
    proposedModel.calculations = buildCalculations(proposedWorkbook, proposedGraph);
    proposedModel.discovery = discoverModel(proposedWorkbook);
    proposedModel.compatibility = {
      status: proposedModel.discovery.compatibility,
      supportedFormulas: proposedModel.discovery.formulaCells - proposedModel.discovery.unsupportedFunctions,
      totalFormulas: proposedModel.discovery.formulaCells,
      issues: [],
    };
    effectiveWorkbook = proposedWorkbook;
  }
  // Legacy models persisted before the canonical calculation inventory existed
  // derive it from the workbook of record so formula diffs stay precise.
  const baseForDiff = hasFormulaOps && model.calculations.length === 0
    ? { ...model, calculations: buildCalculations(workbook, model.graph) }
    : model;

  // Source replacement moves the parameter's value authority to the formula;
  // its currentValue must follow the proposed computation, not the old constant.
  const overriddenParameters = new Set(request.operations
    .filter((operation) => operation.type === 'setParameterValue' || operation.type === 'addParameter')
    .map((operation) => operation.parameterId));
  const overrides = proposedModel.parameters
    .filter((parameter) => overriddenParameters.has(parameter.id))
    .map((parameter) => ({
      parameterId: parameter.id,
      value: parameter.currentValue,
    }));
  const runtime = new ModelRuntime(proposedModel, effectiveWorkbook);
  runtime.run(overrides);
  for (const operation of request.operations) {
    if (operation.type === 'setParameterSource') {
      const parameter = proposedModel.parameters.find((candidate) => candidate.id === operation.parameterId)!;
      parameter.currentValue = runtime.getCellValue(parameter.sourceCell.sheet, parameter.sourceCell.ref);
    }
    if (operation.type === 'restoreParameterSource') {
      const parameter = proposedModel.parameters.find((candidate) => candidate.id === operation.parameterId)!;
      const setValue = request.operations.find((candidate) => candidate.type === 'setParameterValue' && candidate.parameterId === operation.parameterId);
      parameter.currentValue = setValue?.type === 'setParameterValue' ? setValue.value : parameter.currentValue;
    }
  }
  const results = new ModelRuntime(proposedModel, effectiveWorkbook).run(overrides);
  proposedModel.outputs = proposedModel.outputs.map((output) => ({
    ...output,
    value: results[output.id],
  }));

  const initialDiff = diffModels(baseForDiff, proposedModel);
  proposedModel.semver = bumpSemver(model.semver, initialDiff.suggestedBump);
  const impact = findImpact(model, request, proposedModel.graph);
  const testResults = runModelTests(proposedModel, effectiveWorkbook, proposedTests, overrides);
  const relevantTestIds = selectRelevantTestIds(model, proposedModel, proposedTests, impact.components, impact.outputs);
  const relevantTestIdSet = new Set(relevantTestIds);
  const relevantTestResults = testResults.filter((result) => relevantTestIdSet.has(result.testId));
  const contractFindings = proposedModel.contract
    ? reconcileContract(proposedModel, proposedModel.contract)
    : [];
  const diff = diffModels(baseForDiff, proposedModel);
  const baseRuntime = new ModelRuntime(model, workbook);
  baseRuntime.run();
  const proposedRuntime = new ModelRuntime(proposedModel, effectiveWorkbook);
  proposedRuntime.run(overrides);
  const watchValues = Object.fromEntries(impact.components.map((cellId) => {
    const [sheet, ref] = splitCellId(cellId);
    return [cellId, {
      before: baseRuntime.getCellValue(sheet, ref),
      after: proposedRuntime.getCellValue(sheet, ref),
    }];
  }));
  const breakpointResults = evaluateBreakpoints(request, model, proposedModel, baseRuntime, proposedRuntime);
  const outputTraces = impact.outputs.map((outputId) => {
    const output = proposedModel.outputs.find((candidate) => candidate.id === outputId)
      ?? model.outputs.find((candidate) => candidate.id === outputId)!;
    const outputCell = `${output.sourceCell.sheet}!${output.sourceCell.ref}`;
    const dependencies = traceUpstream(proposedModel.graph, outputCell);
    const traceCells = [...dependencies, outputCell];
    return {
      outputId,
      outputCell,
      dependencies,
      rootCauses: dependencies.filter((cellId) => !proposedModel.graph.edges.some((edge) => edge.to === cellId)),
      values: Object.fromEntries(traceCells.map((cellId) => {
        const [sheet, ref] = splitCellId(cellId);
        return [cellId, { before: baseRuntime.getCellValue(sheet, ref), after: proposedRuntime.getCellValue(sheet, ref) }];
      })),
    };
  });
  const previewId = crypto.createHash('sha256').update(JSON.stringify({
    baseVersion: model.version,
    request,
    diff,
    affectedComponents: impact.components,
    affectedOutputs: impact.outputs,
    proposedTests,
    relevantTestIds,
    testResults: testResults.map(({ executedAt: _, ...result }) => result),
    contractFindings,
    watchValues,
    breakpointResults,
    outputTraces,
  })).digest('hex');

  return {
    valid: true,
    baseVersion: model.version,
    previewId,
    proposedModel,
    proposedWorkbook,
    proposedTests,
    diff,
    affectedComponents: impact.components,
    affectedOutputs: impact.outputs,
    affectedComponentValues: Object.fromEntries(Object.entries(watchValues).map(([cellId, values]) => [cellId, values.after])),
    watchValues,
    breakpointResults,
    outputTraces,
    evidenceRefs: [{ kind: 'preview', checksum: previewId }],
    testResults,
    relevantTestIds,
    relevantTestResults,
    allTestsPass: testResults.every((result) => result.status === 'pass' || result.status === 'skip'),
    contractFindings,
    validationIssues: [],
  };
}

function selectRelevantTestIds(
  model: Model,
  proposedModel: Model,
  tests: ModelTestDefinition[],
  affectedComponents: string[],
  affectedOutputs: string[],
): string[] {
  const affected = new Set<string>([...affectedComponents, ...affectedOutputs]);
  for (const output of [...model.outputs, ...proposedModel.outputs]) {
    if (affectedOutputs.includes(output.id) || affectedComponents.includes(`${output.sourceCell.sheet}!${output.sourceCell.ref}`)) {
      affected.add(output.id);
      affected.add(output.name);
    }
  }
  for (const parameter of [...model.parameters, ...proposedModel.parameters]) {
    if (affectedComponents.includes(`${parameter.sourceCell.sheet}!${parameter.sourceCell.ref}`)) {
      affected.add(parameter.id);
      affected.add(parameter.name);
    }
  }

  return tests.filter((test) => testReferences(test).some((reference) => affected.has(reference))).map((test) => test.id);
}

function testReferences(test: ModelTestDefinition): string[] {
  const references = [test.assertion.left];
  if (test.assertion.type === 'balance' && typeof test.assertion.right === 'string') references.push(test.assertion.right);
  references.push(...Object.keys(test.assertion.baseline ?? {}));
  references.push(...(test.assertion.boundaryParams ?? []).map((parameter) => parameter.parameterId));
  references.push(...(test.assertion.consistencyPair ?? []));
  return references;
}

function splitCellId(cellId: string): [string, string] {
  const separator = cellId.lastIndexOf('!');
  return [cellId.slice(0, separator), cellId.slice(separator + 1)];
}

function evaluateBreakpoints(
  request: MutationRequest,
  model: Model,
  proposedModel: Model,
  baseRuntime: ModelRuntime,
  proposedRuntime: ModelRuntime,
): MutationBreakpointResult[] {
  const changedParameters = proposedModel.parameters
    .filter((parameter) => {
      const before = model.parameters.find((candidate) => candidate.id === parameter.id);
      return !before || before.currentValue !== parameter.currentValue || before.source !== parameter.source;
    })
    .map((parameter) => parameter.id)
    .concat(model.parameters.filter((parameter) => !proposedModel.parameters.some((candidate) => candidate.id === parameter.id)).map((parameter) => parameter.id));

  return (request.breakpoints ?? []).map((breakpoint) => {
    if (breakpoint.kind === 'assumptionChanged') {
      const matches = breakpoint.parameterId
        ? changedParameters.filter((parameterId) => parameterId === breakpoint.parameterId)
        : changedParameters;
      return { breakpoint, hit: matches.length > 0, changedParameters: matches };
    }
    const [sheet, ref] = splitCellId(breakpoint.cellId);
    const before = baseRuntime.getCellValue(sheet, ref);
    const after = proposedRuntime.getCellValue(sheet, ref);
    return { breakpoint, hit: compareBreakpoint(after, breakpoint.operator, breakpoint.value), before, after };
  });
}

function compareBreakpoint(actual: unknown, operator: BreakpointOperator, expected: number | boolean): boolean {
  if (typeof actual !== typeof expected) return false;
  if (operator === '==') return actual === expected;
  if (operator === '!=') return actual !== expected;
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;
  if (operator === '<') return actual < expected;
  if (operator === '<=') return actual <= expected;
  if (operator === '>') return actual > expected;
  return actual >= expected;
}

function validateRequest(model: Model, workbook: ParsedWorkbook, request: MutationRequest, tests: ModelTestDefinition[]): MutationValidationIssue[] {
  if (request.operations.length === 0) {
    return [{ code: 'empty_batch', message: 'A mutation request must contain at least one operation.' }];
  }

  const issues: MutationValidationIssue[] = [];
  const targets = new Set<string>();
  const structuralConflicts = new Set(request.operations
    .filter((operation) => ['addParameter', 'removeParameter', 'restoreParameter', 'restoreParameterSource', 'addOutput', 'removeOutput', 'restoreOutput'].includes(operation.type)
      && request.operations.some((candidate) => candidate !== operation && operationTargetId(candidate) === operationTargetId(operation)
        && !(operation.type === 'restoreParameterSource' && candidate.type === 'setParameterValue')))
    .map(operationTargetId));
  const proposedNames = new Map(model.parameters.map((parameter) => [parameter.id, parameter.name.toLowerCase()]));
  const proposedOutputNames = new Map(model.outputs.map((output) => [output.id, output.name.toLowerCase()]));
  const proposedOutputSources = new Map(model.outputs.map((output) => [output.id, `${output.sourceCell.sheet}!${output.sourceCell.ref}`]));

  for (const operation of request.operations) {
    if (operation.type === 'addParameter') proposedNames.set(operation.parameterId, operation.name.trim().toLowerCase());
    if (operation.type === 'renameParameter') proposedNames.set(operation.parameterId, operation.name.trim().toLowerCase());
    if (operation.type === 'restoreParameter') proposedNames.set(operation.parameterId, operation.parameter.name.toLowerCase());
    if (operation.type === 'renameOutput') proposedOutputNames.set(operation.outputId, operation.name.trim().toLowerCase());
    if (operation.type === 'addOutput') {
      proposedOutputNames.set(operation.outputId, operation.name.trim().toLowerCase());
      proposedOutputSources.set(operation.outputId, `${operation.sourceCell.sheet}!${operation.sourceCell.ref}`);
    }
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

    if (operation.type === 'restoreParameterSource') {
      const parameter = model.parameters.find((candidate) => candidate.id === operation.parameterId);
      if (!parameter) {
        issues.push({ code: 'parameter_not_found', operationIndex, message: `Parameter "${operation.parameterId}" was not found.` });
        return;
      }
      const cell = workbook.sheets.find((sheet) => sheet.name === parameter.sourceCell.sheet)?.cells.find((candidate) => candidate.address.ref === parameter.sourceCell.ref);
      if (!cell?.formula) {
        issues.push({ code: 'formula_cell_not_formula', operationIndex, message: `Parameter "${parameter.name}" is not currently formula-driven.` });
      }
      return;
    }

    if (operation.type === 'extractFormula') {
      const componentName = operation.componentName.trim();
      if (!componentName) {
        issues.push({ code: 'invalid_name', operationIndex, message: 'Component name cannot be blank.' });
        return;
      }
      if (model.parameters.some((parameter) => parameter.name.toLowerCase() === componentName.toLowerCase())) {
        issues.push({ code: 'duplicate_name', operationIndex, message: `Component name "${componentName}" is already in use by an input.` });
        return;
      }
      const retargetCell = workbook.sheets.find((sheet) => sheet.name === operation.retargetCell.sheet)?.cells.find((cell) => cell.address.ref === operation.retargetCell.ref);
      if (!retargetCell) {
        issues.push({ code: 'retarget_cell_not_found', operationIndex, message: `Retarget cell "${operation.retargetCell.sheet}!${operation.retargetCell.ref}" was not found in the canonical workbook.` });
        return;
      }
      if (!retargetCell.formula) {
        issues.push({ code: 'retarget_cell_not_formula', operationIndex, message: `Retarget cell "${operation.retargetCell.sheet}!${operation.retargetCell.ref}" is not an existing formula component.` });
        return;
      }
      const formula = operation.formula.trim().replace(/^=+/, '');
      try {
        const unsupported = collectFunctionCalls(parseFormula(formula)).filter((name) => isUnsupportedFunction(name));
        if (unsupported.length > 0) {
          issues.push({ code: 'unsupported_function', operationIndex, message: `Formula uses unsupported function(s): ${unsupported.join(', ')}.` });
        }
      } catch {
        issues.push({ code: 'invalid_formula', operationIndex, message: `Formula could not be parsed: ${operation.formula.slice(0, 60)}.` });
      }
      return;
    }

    if (operation.type === 'setParameterSource') {
      const parameter = model.parameters.find((candidate) => candidate.id === operation.parameterId);
      if (!parameter) {
        issues.push({ code: 'parameter_not_found', operationIndex, message: `Parameter "${operation.parameterId}" was not found.` });
        return;
      }
      const cellId = `${parameter.sourceCell.sheet}!${parameter.sourceCell.ref}`;
      const cell = workbook.sheets.find((sheet) => sheet.name === parameter.sourceCell.sheet)?.cells.find((candidate) => candidate.address.ref === parameter.sourceCell.ref);
      if (!cell) {
        issues.push({ code: 'formula_cell_not_found', operationIndex, message: `Parameter source "${cellId}" was not found in the canonical workbook.` });
        return;
      }
      if (cell.formula) {
        issues.push({ code: 'parameter_source_already_formula', operationIndex, message: `Parameter "${parameter.name}" is already formula-driven; use formula edit instead.` });
        return;
      }
      const formula = operation.formula.trim().replace(/^=+/, '');
      try {
        const unsupported = collectFunctionCalls(parseFormula(formula)).filter((name) => isUnsupportedFunction(name));
        if (unsupported.length > 0) {
          issues.push({ code: 'unsupported_function', operationIndex, message: `Formula uses unsupported function(s): ${unsupported.join(', ')}.` });
        }
        const unknownSheet = extractDependencies(formula, parameter.sourceCell.sheet)
          .map((ref) => ref.split('!')[0])
          .find((sheet) => !workbook.sheets.some((candidate) => candidate.name === sheet));
        if (unknownSheet) {
          issues.push({ code: 'invalid_formula', operationIndex, message: `Formula references unknown sheet "${unknownSheet}".` });
        }
      } catch {
        issues.push({ code: 'invalid_formula', operationIndex, message: `Formula could not be parsed: ${operation.formula.slice(0, 60)}.` });
      }
      return;
    }

    if (operation.type === 'setCellFormula') {
      const cellId = `${operation.sourceCell.sheet}!${operation.sourceCell.ref}`;
      const cell = workbook.sheets.find((sheet) => sheet.name === operation.sourceCell.sheet)?.cells.find((candidate) => candidate.address.ref === operation.sourceCell.ref);
      if (!cell) {
        issues.push({ code: 'formula_cell_not_found', operationIndex, message: `Formula target "${cellId}" was not found in the canonical workbook.` });
        return;
      }
      if (!cell.formula) {
        issues.push({ code: 'formula_cell_not_formula', operationIndex, message: `Formula target "${cellId}" is not an existing formula component; creating formulas on constants is not supported yet.` });
        return;
      }
      const formula = operation.formula.trim().replace(/^=+/, '');
      try {
        const unsupported = collectFunctionCalls(parseFormula(formula)).filter((name) => isUnsupportedFunction(name));
        if (unsupported.length > 0) {
          issues.push({ code: 'unsupported_function', operationIndex, message: `Formula uses unsupported function(s): ${unsupported.join(', ')}.` });
        }
        const unknownSheet = extractDependencies(formula, operation.sourceCell.sheet)
          .map((ref) => ref.split('!')[0])
          .find((sheet) => !workbook.sheets.some((candidate) => candidate.name === sheet));
        if (unknownSheet) {
          issues.push({ code: 'invalid_formula', operationIndex, message: `Formula references unknown sheet "${unknownSheet}".` });
        }
      } catch {
        issues.push({ code: 'invalid_formula', operationIndex, message: `Formula could not be parsed: ${operation.formula.slice(0, 60)}.` });
      }
      return;
    }

    if (operation.type === 'addParameter') {
      const name = operation.name.trim();
      if (model.parameters.some((candidate) => candidate.id === operation.parameterId)) {
        issues.push({ code: 'parameter_already_exists', operationIndex, message: `Parameter "${operation.parameterId}" already exists.` });
      }
      if (!name) {
        issues.push({ code: 'invalid_name', operationIndex, message: 'Parameter name cannot be blank.' });
      } else if ([...proposedNames].some(([parameterId, proposedName]) => parameterId !== operation.parameterId && proposedName === name.toLowerCase())) {
        issues.push({ code: 'duplicate_name', operationIndex, message: `Parameter name "${name}" is already in use.` });
      }
      const expectedType = operation.parameterType === 'date' ? 'string' : operation.parameterType;
      if (expectedType !== 'blank' && expectedType !== 'error' && typeof operation.value !== expectedType) {
        issues.push({ code: 'invalid_type', operationIndex, message: `Parameter "${operation.parameterId}" requires a ${expectedType} value.` });
      }
      return;
    }

    if (operation.type === 'addOutput') {
      const name = operation.name.trim();
      const cellId = `${operation.sourceCell.sheet}!${operation.sourceCell.ref}`;
      const source = workbook.sheets.find((sheet) => sheet.name === operation.sourceCell.sheet)?.cells.find((cell) => cell.address.ref === operation.sourceCell.ref);
      if (model.outputs.some((candidate) => candidate.id === operation.outputId)) {
        issues.push({ code: 'output_already_exists', operationIndex, message: `Output "${operation.outputId}" already exists.` });
      }
      if (!name) {
        issues.push({ code: 'invalid_name', operationIndex, message: 'Output name cannot be blank.' });
      } else if ([...proposedOutputNames].some(([outputId, proposedName]) => outputId !== operation.outputId && proposedName === name.toLowerCase())) {
        issues.push({ code: 'duplicate_name', operationIndex, message: `Output name "${name}" is already in use.` });
      }
      if (!source || !model.graph.nodes.includes(cellId)) {
        issues.push({ code: 'output_source_not_found', operationIndex, message: `Output source "${cellId}" was not found in the canonical model.` });
      } else if (!source.formula) {
        issues.push({ code: 'output_source_not_formula', operationIndex, message: `Output source "${cellId}" must be an existing formula component.` });
      }
      if ([...proposedOutputSources].some(([outputId, sourceCell]) => outputId !== operation.outputId && sourceCell === cellId)) {
        issues.push({ code: 'output_source_already_exposed', operationIndex, message: `Formula component "${cellId}" is already exposed as an output.` });
      }
      return;
    }

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

function findImpact(model: Model, request: MutationRequest, graph: DependencyGraph = model.graph): { components: string[]; outputs: string[] } {
  let virtualParameterOffset = 0;
  const queue = request.operations.filter((operation) => operation.type !== 'moveParameter' && operation.type !== 'moveOutput').map((operation) => {
    if (operation.type === 'setCellFormula') return `${operation.sourceCell.sheet}!${operation.sourceCell.ref}`;
    if (operation.type === 'extractFormula') return `XLent Components!A${request.operations.filter((candidate) => candidate.type === 'extractFormula').indexOf(operation) + 1}`;
    if (operation.type === 'addParameter') {
      const sourceCell = nextVirtualParameterCell(model, virtualParameterOffset++);
      return `${sourceCell.sheet}!${sourceCell.ref}`;
    }
    if (operation.type === 'addOutput') return `${operation.sourceCell.sheet}!${operation.sourceCell.ref}`;
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
    for (const edge of graph.edges) {
      if (edge.from === current && !visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }

  const outputs = model.outputs
    .filter((output) => visited.has(`${output.sourceCell.sheet}!${output.sourceCell.ref}`))
    .map((output) => output.id);
  for (const operation of request.operations) {
    if (operation.type === 'addOutput' && visited.has(`${operation.sourceCell.sheet}!${operation.sourceCell.ref}`)) outputs.push(operation.outputId);
  }
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
  if (operation.type === 'setCellFormula') return `${operation.sourceCell.sheet}!${operation.sourceCell.ref}`;
  if (operation.type === 'extractFormula') return operation.componentId;
  if (operation.type === 'setParameterSource' || operation.type === 'restoreParameterSource') return operation.parameterId;
  return operation.type === 'addOutput' || operation.type === 'renameOutput' || operation.type === 'moveOutput' || operation.type === 'removeOutput' || operation.type === 'restoreOutput'
    ? operation.outputId
    : operation.parameterId;
}

function nextVirtualParameterCell(model: Model, offset = 0): Parameter['sourceCell'] {
  const highestRow = model.parameters.reduce((highest, parameter) => {
    if (parameter.sourceCell.sheet !== 'XLent Inputs') return highest;
    const match = /^A(\d+)$/.exec(parameter.sourceCell.ref);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return { sheet: 'XLent Inputs', ref: `A${highestRow + offset + 1}` };
}

/** Qualify unqualified cell references in an extracted component formula with the source sheet. */
function qualifyFormula(formula: string, sourceSheet: string): string {
  return formula.replace(/(?<![A-Za-z0-9_!'])\$?([A-Z]{1,3})\$?(\d+)(?![A-Za-z0-9_])/g, (match, col, row) => {
    return `'${sourceSheet}'!${col}${row}`;
  });
}