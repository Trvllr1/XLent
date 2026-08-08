import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildGraph } from '../graph.js';
import { previewMutation } from '../mutation/index.js';
import { parseWorkbook } from '../parser.js';
import type { Model } from '../types.js';

function buildFixture(): { model: Model; workbook: ReturnType<typeof parseWorkbook> } {
  const source = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(source, XLSX.utils.aoa_to_sheet([[10], [{ t: 'n', f: 'A1*2' }]]), 'Model');
  const workbook = parseWorkbook(Buffer.from(XLSX.write(source, { type: 'buffer', bookType: 'xlsx' })), 'mutation.xlsx');
  const graph = buildGraph(workbook);
  const model: Model = {
    id: 'model-1',
    name: 'Mutation fixture',
    slug: 'mutation-fixture',
    semver: '1.0.0',
    version: 1,
    status: 'draft',
    createdAt: '2026-08-07T00:00:00.000Z',
    workbookName: 'mutation.xlsx',
    parameters: [{
      id: 'revenue',
      name: 'Revenue',
      type: 'number',
      currentValue: 10,
      originalValue: 10,
      allowedRange: { min: 0, max: 100 },
      sourceCell: { sheet: 'Model', ref: 'A1' },
      source: 'CLIENT_MODEL',
      confidence: 'HIGH',
      confirmed: true,
    }],
    calculations: [],
    outputs: [{
      id: 'double-revenue',
      name: 'Double Revenue',
      value: 20,
      sourceCell: { sheet: 'Model', ref: 'A2' },
      dependsOn: ['revenue'],
      confidence: 'HIGH',
      confirmed: true,
    }],
    graph,
    compatibility: { status: 'VALID', supportedFormulas: 1, totalFormulas: 1, issues: [] },
    discovery: { workbookName: 'mutation.xlsx', sheets: 1, formulaCells: 1, inputCandidates: 1, outputCandidates: 1, crossSheetReferences: 0, externalReferences: 0, namedRanges: 0, unsupportedFunctions: 0, circularDependencies: 0, compatibility: 'VALID' },
  };
  return { model, workbook };
}

describe('previewMutation', () => {
  it('previews a deterministic parameter mutation without changing the source model', () => {
    const { model, workbook } = buildFixture();
    const preview = previewMutation(model, workbook, {
      actor: { id: 'user-1', type: 'human' },
      rationale: 'Test the governed mutation path',
      operations: [{ type: 'setParameterValue', parameterId: 'revenue', value: 25 }],
    });

    expect(preview.valid).toBe(true);
    expect(preview.proposedModel?.parameters[0].currentValue).toBe(25);
    expect(preview.proposedModel?.outputs[0].value).toBe(50);
    expect(preview.proposedModel?.semver).toBe('1.1.0');
    expect(preview.affectedOutputs).toEqual(['double-revenue']);
    expect(preview.testResults).toEqual([]);
    expect(preview.allTestsPass).toBe(true);
    expect(preview.contractFindings).toEqual([]);
    expect(preview.diff?.entries.map((entry) => entry.path)).toEqual([
      'parameters.Revenue.value',
      'outputs.Double Revenue.value',
    ]);
    expect(model.parameters[0].currentValue).toBe(10);
    expect(model.outputs[0].value).toBe(20);
    expect(model.semver).toBe('1.0.0');
  });

  it('rejects the entire batch when a value violates the parameter contract', () => {
    const { model, workbook } = buildFixture();
    const preview = previewMutation(model, workbook, {
      actor: { id: 'agent-1', type: 'agent' },
      rationale: 'Invalid proposal',
      operations: [{ type: 'setParameterValue', parameterId: 'revenue', value: 101 }],
    });

    expect(preview.valid).toBe(false);
    expect(preview.proposedModel).toBeUndefined();
    expect(preview.allTestsPass).toBe(false);
    expect(preview.validationIssues).toEqual([expect.objectContaining({ code: 'outside_allowed_range' })]);
    expect(model.parameters[0].currentValue).toBe(10);
  });
});