import crypto from 'crypto';
import { previewMutation } from '@xlent/core';
import type { EvidenceRecord, ModelTestDefinition, MutationRequest, Snapshot } from '@xlent/core';
import { Hono } from 'hono';
import db from '../db.js';
import { mutationCommitSchema, mutationPreviewSchema } from '../schemas.js';
import { evidenceStore, snapshotStore, store, testStore } from '../store.js';

export const mutationsRouter = new Hono();

/** POST /models/:id/mutations/preview — Evaluate a proposed mutation without persisting it. */
mutationsRouter.post('/:id/mutations/preview', async (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);

  const workbook = store.getWorkbook(model.id);
  if (!workbook) return c.json({ error: 'Model workbook not found' }, 409);

  const parsed = mutationPreviewSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid mutation request', issues: parsed.error.issues }, 400);
  }

  const tests = testStore.listTests(model.id) as ModelTestDefinition[];
  const preview = previewMutation(model, workbook, parsed.data as MutationRequest, tests);
  return c.json(preview, preview.valid ? 200 : 422);
});

/** POST /models/:id/mutations/commit — Re-evaluate and atomically commit a mutation. */
mutationsRouter.post('/:id/mutations/commit', async (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);

  const workbook = store.getWorkbook(model.id);
  if (!workbook) return c.json({ error: 'Model workbook not found' }, 409);

  const parsed = mutationCommitSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid mutation commit request', issues: parsed.error.issues }, 400);
  }
  if (parsed.data.baseVersion !== model.version) {
    return c.json({
      error: 'Stale mutation base version',
      expectedBaseVersion: model.version,
      receivedBaseVersion: parsed.data.baseVersion,
    }, 409);
  }

  const request: MutationRequest = {
    actor: parsed.data.actor,
    rationale: parsed.data.rationale,
    operations: parsed.data.operations,
  };
  const tests = testStore.listTests(model.id) as ModelTestDefinition[];
  const preview = previewMutation(model, workbook, request, tests);
  const hasCriticalContractFinding = preview.contractFindings.some((finding) => finding.severity === 'critical');
  if (!preview.valid || !preview.allTestsPass || hasCriticalContractFinding || !preview.proposedModel) {
    return c.json({ error: 'Mutation did not pass commit gates', preview }, 422);
  }

  const committedModel = structuredClone(preview.proposedModel);
  committedModel.version = model.version + 1;
  committedModel.assuranceLevel = 'UNASSESSED';
  const committedAt = new Date().toISOString();
  const modelChecksum = crypto.createHash('sha256').update(JSON.stringify(committedModel)).digest('hex');
  const evidenceChecksum = crypto.createHash('sha256').update(JSON.stringify({
    modelChecksum,
    tests: preview.testResults,
    contractFindings: preview.contractFindings,
  })).digest('hex');
  const snapshot: Snapshot = {
    id: crypto.randomUUID(),
    modelId: model.id,
    semver: committedModel.semver,
    message: request.rationale,
    checksum: modelChecksum,
    createdAt: committedAt,
    data: committedModel,
  };
  const evidence: EvidenceRecord = {
    id: crypto.randomUUID(),
    modelId: model.id,
    modelVersion: committedModel.version,
    executedAt: committedAt,
    inputs: Object.fromEntries(committedModel.parameters.map((parameter) => [parameter.id, parameter.currentValue])),
    overrides: request.operations.map((operation) => ({ parameterId: operation.parameterId, value: operation.value })),
    outputs: Object.fromEntries(committedModel.outputs.map((output) => [output.id, output.value])),
    tests: preview.testResults,
    contractFindings: preview.contractFindings,
    allTestsPass: preview.allTestsPass,
    checksum: evidenceChecksum,
    reproducible: true,
    executedBy: `${request.actor.type}:${request.actor.id}`,
    purpose: 'mutation_commit',
  };

  const committed = db.transaction(() => {
    if (!store.setModelIfVersion(committedModel, parsed.data.baseVersion)) return false;
    snapshotStore.create(snapshot);
    evidenceStore.store(evidence);
    return true;
  })();
  if (!committed) {
    return c.json({
      error: 'Stale mutation base version',
      expectedBaseVersion: store.getModel(model.id)?.version,
      receivedBaseVersion: parsed.data.baseVersion,
    }, 409);
  }

  return c.json({
    model: committedModel,
    diff: preview.diff,
    affectedOutputs: preview.affectedOutputs,
    tests: preview.testResults,
    contractFindings: preview.contractFindings,
    snapshotId: snapshot.id,
    evidenceId: evidence.id,
  }, 201);
});