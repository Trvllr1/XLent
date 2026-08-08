import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { buildGraph } from '../graph.js';
import { getNativeTemplate, compileNativeModel } from '../native.js';
import { parseWorkbook } from '../parser.js';
import { writeWorkbookXlsx } from '../xlsxWriter.js';

function semanticProjection(workbook: ReturnType<typeof parseWorkbook>) {
  return {
    sheets: workbook.sheets.map((sheet) => ({
      name: sheet.name,
      cells: sheet.cells.map((cell) => ({
        ref: cell.address.ref,
        semanticValue: cell.formula ?? cell.value,
      })),
    })),
    namedRanges: workbook.namedRanges,
  };
}

describe('writeWorkbookXlsx', () => {
  it('round-trips a native canonical workbook with formulas and provenance', () => {
    const template = getNativeTemplate('unit-economics')!;
    const compiled = compileNativeModel(template.definition, {
      id: 'model-export-1',
      slug: 'unit-economics-export',
      createdAt: '2026-08-08T00:00:00.000Z',
    });
    const exported = writeWorkbookXlsx(compiled.workbook, {
      model: compiled.model,
      evidenceIds: ['evidence-1'],
    });
    const reparsed = parseWorkbook(exported.buffer, 'unit-economics-export.xlsx');
    const raw = XLSX.read(exported.buffer, { type: 'buffer' });

    expect(reparsed.sheets.map((sheet) => ({
      name: sheet.name,
      cells: sheet.cells.map((cell) => ({ address: cell.address, formula: cell.formula })),
    }))).toEqual(compiled.workbook.sheets.map((sheet) => ({
      name: sheet.name,
      cells: sheet.cells.map((cell) => ({ address: cell.address, formula: cell.formula })),
    })));
    expect(buildGraph(reparsed)).toEqual(compiled.model.graph);
    expect(reparsed.sheets[0].cells.find((cell) => cell.address.ref === 'B5')?.value).toBe(120000);
    expect(reparsed.namedRanges).toEqual(compiled.workbook.namedRanges);
    expect(exported.report).toEqual(expect.objectContaining({
      modelId: compiled.model.id,
      formulaCount: 4,
      losses: [],
    }));
    expect(raw.Custprops).toEqual(expect.objectContaining({
      XLentModelId: compiled.model.id,
      XLentSemver: '1.0.0',
      XLentEvidenceIds: 'evidence-1',
    }));
  });

  it('round-trips an imported artifact with zero computational semantic diff', () => {
    const template = getNativeTemplate('unit-economics')!;
    const compiled = compileNativeModel(template.definition, {
      id: 'model-imported-export-1',
      slug: 'imported-unit-economics',
    });
    const source = writeWorkbookXlsx(compiled.workbook, { model: compiled.model }).buffer;
    const imported = parseWorkbook(source, 'client-model.xlsx');
    const importedModel = { ...compiled.model, sourceKind: 'workbook' as const, workbookName: 'client-model.xlsx' };
    const roundTrip = writeWorkbookXlsx(imported, { model: importedModel });
    const reparsed = parseWorkbook(roundTrip.buffer, 'client-model-round-trip.xlsx');
    const raw = XLSX.read(roundTrip.buffer, { type: 'buffer' });

    expect(semanticProjection(reparsed)).toEqual(semanticProjection(imported));
    expect(buildGraph(reparsed)).toEqual(buildGraph(imported));
    expect((raw.Custprops as Record<string, unknown> | undefined)?.XLentSourceKind).toBe('workbook');
  });
});