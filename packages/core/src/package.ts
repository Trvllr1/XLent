import type { Model, ModelTestResult, EvidenceRecord, ModelPackage, AssuranceSummary, AssuranceStatus, Finding, Deliverable, ScenarioOverride } from './types.js';
import type { ParsedWorkbook } from './parser.js';
import { ModelRuntime } from './runtime.js';
import crypto from 'crypto';

export function buildModelPackage(
  model: Model,
  workbook: ParsedWorkbook,
  testResults: ModelTestResult[],
  evidence?: EvidenceRecord,
  overrides?: ScenarioOverride[],
): ModelPackage {
  const runtime = new ModelRuntime(model, workbook);
  const results = runtime.run(overrides);

  const deliverable: Deliverable = {
    id: crypto.randomUUID(),
    modelId: model.id,
    modelName: model.name,
    modelVersion: model.version,
    executedAt: new Date().toISOString(),
    outputs: model.outputs.map((o) => ({
      id: o.id,
      name: o.name,
      value: results[o.id],
      sourceCell: `${o.sourceCell.sheet}!${o.sourceCell.ref}`,
      confidence: o.confidence,
    })),
    parameters: model.parameters.map((p) => ({
      id: p.id,
      name: p.name,
      value: p.currentValue,
      sourceCell: `${p.sourceCell.sheet}!${p.sourceCell.ref}`,
      confidence: p.confidence,
    })),
    overridesApplied: overrides ?? [],
    compatibility: model.compatibility,
  };

  const assurance = computeAssurance(model, testResults, evidence);

  return {
    id: crypto.randomUUID(),
    modelId: model.id,
    slug: model.slug,
    semver: model.semver,
    name: model.name,
    executedAt: deliverable.executedAt,
    deliverable,
    assurance,
    evidence,
    discovery: model.discovery,
    compatibility: model.compatibility,
  };
}

function computeAssurance(model: Model, testResults: ModelTestResult[], evidence?: EvidenceRecord): AssuranceSummary {
  const passed = testResults.filter((t) => t.status === 'pass').length;
  const failed = testResults.filter((t) => t.status === 'fail').length;
  const errors = testResults.filter((t) => t.status === 'error').length;
  const skipped = testResults.filter((t) => t.status === 'skip').length;

  const findings: Finding[] = [];

  // Structural findings from discovery
  if (model.discovery.circularDependencies > 0) {
    findings.push({ id: crypto.randomUUID(), type: 'structural', severity: 'critical', message: `${model.discovery.circularDependencies} circular dependency(ies) detected` });
  }
  if (model.discovery.externalReferences > 0) {
    findings.push({ id: crypto.randomUUID(), type: 'structural', severity: 'warning', message: `${model.discovery.externalReferences} external reference(s)` });
  }
  if (model.discovery.unsupportedFunctions > 0) {
    findings.push({ id: crypto.randomUUID(), type: 'compatibility', severity: 'warning', message: `${model.discovery.unsupportedFunctions} unsupported function(s)` });
  }

  // Test failure findings
  for (const t of testResults.filter((r) => r.status === 'fail')) {
    findings.push({ id: crypto.randomUUID(), type: t.category, severity: 'critical', message: `Test failed: ${t.name}`, detail: t.message });
  }

  let overallStatus: AssuranceStatus;
  if (failed > 0 || errors > 0 || findings.some((f) => f.severity === 'critical')) {
    overallStatus = 'fail';
  } else if (findings.some((f) => f.severity === 'warning') || skipped > 0) {
    overallStatus = 'conditional';
  } else {
    overallStatus = 'pass';
  }

  return { overallStatus, totalTests: testResults.length, passed, failed, errors, skipped, findings, evidenceId: evidence?.id };
}
