import * as XLSX from 'xlsx';
import type { ParsedWorkbook } from './parser.js';
import type { Cell, Model } from './types.js';

export interface XlsxExportMetadata {
  model: Model;
  evidenceIds?: string[];
}

export interface XlsxExportReport {
  format: 'xlsx';
  modelId: string;
  semver: string;
  sheetCount: number;
  formulaCount: number;
  namedRangeCount: number;
  losses: string[];
}

function xlsxCell(cell: Cell, canonicalValue?: unknown): XLSX.CellObject {
  const value = canonicalValue ?? cell.value ?? (cell.formula ? 0 : undefined);
  const type = cell.type === 'blank' && cell.formula
    ? (typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string')
    : cell.type;
  const result: XLSX.CellObject = {
    t: type === 'number' ? 'n'
      : type === 'boolean' ? 'b'
        : type === 'date' ? 'd'
          : type === 'error' ? 'e'
            : type === 'blank' ? 'z'
              : 's',
    v: type === 'date' && typeof value === 'string' ? new Date(value) : value as never,
  };
  if (cell.formula) result.f = cell.formula.replace(/^=/, '');
  if (cell.format) result.z = cell.format;
  return result;
}

export function writeWorkbookXlsx(
  workbook: ParsedWorkbook,
  metadata: XlsxExportMetadata,
): { buffer: Buffer; report: XlsxExportReport } {
  const output = XLSX.utils.book_new();
  let formulaCount = 0;
  const canonicalValues = new Map([
    ...metadata.model.parameters.map((parameter) => [
      `${parameter.sourceCell.sheet}!${parameter.sourceCell.ref}`,
      parameter.currentValue,
    ] as const),
    ...metadata.model.outputs.map((modelOutput) => [
      `${modelOutput.sourceCell.sheet}!${modelOutput.sourceCell.ref}`,
      modelOutput.value,
    ] as const),
  ]);

  for (const sheet of workbook.sheets) {
    const worksheet: XLSX.WorkSheet = {};
    let range: XLSX.Range | undefined;
    for (const cell of sheet.cells) {
      worksheet[cell.address.ref] = xlsxCell(
        cell,
        canonicalValues.get(`${cell.address.sheet}!${cell.address.ref}`),
      );
      const address = XLSX.utils.decode_cell(cell.address.ref);
      range = range
        ? {
            s: { r: Math.min(range.s.r, address.r), c: Math.min(range.s.c, address.c) },
            e: { r: Math.max(range.e.r, address.r), c: Math.max(range.e.c, address.c) },
          }
        : { s: address, e: address };
      if (cell.formula) formulaCount++;
    }
    worksheet['!ref'] = XLSX.utils.encode_range(range ?? { s: { r: 0, c: 0 }, e: { r: 0, c: 0 } });
    XLSX.utils.book_append_sheet(output, worksheet, sheet.name);
  }

  output.Workbook = {
    ...output.Workbook,
    Names: workbook.namedRanges.map((range) => ({
      Name: range.name,
      Ref: range.ref,
      ...(range.sheet ? { Sheet: output.SheetNames.indexOf(range.sheet) } : {}),
    })),
  };
  output.Props = {
    ...output.Props,
    Title: metadata.model.name,
    Subject: `XLent model ${metadata.model.slug} v${metadata.model.semver}`,
    Author: 'XLent',
    Comments: `Canonical model ${metadata.model.id}; version ${metadata.model.version}`,
  };
  output.Custprops = {
    XLentModelId: metadata.model.id,
    XLentSlug: metadata.model.slug,
    XLentSemver: metadata.model.semver,
    XLentVersion: metadata.model.version,
    XLentSourceKind: metadata.model.sourceKind ?? 'workbook',
    XLentAssuranceLevel: metadata.model.assuranceLevel ?? 'UNASSESSED',
    XLentEvidenceIds: (metadata.evidenceIds ?? []).join(','),
  };

  return {
    buffer: Buffer.from(XLSX.write(output, { type: 'buffer', bookType: 'xlsx', cellStyles: true })),
    report: {
      format: 'xlsx',
      modelId: metadata.model.id,
      semver: metadata.model.semver,
      sheetCount: workbook.sheets.length,
      formulaCount,
      namedRangeCount: workbook.namedRanges.length,
      losses: metadata.model.compatibility.issues.map((issue) => issue.detail),
    },
  };
}