import crypto from 'crypto';
import { previewMutation } from '@xlent/core';
import type { EvidenceRecord, Model, ModelTestDefinition, MutationPreview, MutationRequest, Snapshot } from '@xlent/core';
import { Hono } from 'hono';
import db from '../db.js';
import { mutationCommitSchema, mutationPreviewSchema, mutationRejectSchema, mutationUndoSchema } from '../schemas.js';
import { evidenceStore, snapshotStore, store, testStore } from '../store.js';

export const mutationsRouter = new Hono();

function hasCommitBlocker(preview: MutationPreview): boolean {
  return !preview.valid
    || !preview.allTestsPass
    || preview.contractFindings.some((finding) => finding.severity === 'critical')
    || !preview.proposedModel;
}

function persistMutation(
  model: Model,
  request: MutationRequest,
  preview: MutationPreview,
  baseVersion: number,
  restoredFromSnapshotId?: string,
) {
  const committedModel = structuredClone(preview.proposedModel!);
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
    rationale: request.rationale,
    mutationOperations: request.operations,
    restoredFromSnapshotId,
  };

  const committed = db.transaction(() => {
    if (!store.setModelIfVersion(committedModel, baseVersion)) return false;
    snapshotStore.create(snapshot);
    evidenceStore.store(evidence);
    return true;
  })();

  return { committed, committedModel, snapshot, evidence };
}

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
  if (preview.previewId !== parsed.data.previewId) {
    return c.json({ error: 'Mutation preview no longer matches the proposed commit', currentPreview: preview }, 409);
  }
  if (hasCommitBlocker(preview)) {
    return c.json({ error: 'Mutation did not pass commit gates', preview }, 422);
  }

  const result = persistMutation(model, request, preview, parsed.data.baseVersion);
  if (!result.committed) {
    return c.json({
      error: 'Stale mutation base version',
      expectedBaseVersion: store.getModel(model.id)?.version,
      receivedBaseVersion: parsed.data.baseVersion,
    }, 409);
  }

  return c.json({
    model: result.committedModel,
    diff: preview.diff,
    affectedComponents: preview.affectedComponents,
    affectedOutputs: preview.affectedOutputs,
    tests: preview.testResults,
    contractFindings: preview.contractFindings,
    snapshotId: result.snapshot.id,
    evidenceId: result.evidence.id,
  }, 201);
});

/** POST /models/:id/mutations/reject — Explicitly reject an evaluated proposal without persistence. */
mutationsRouter.post('/:id/mutations/reject', async (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  const workbook = store.getWorkbook(model.id);
  if (!workbook) return c.json({ error: 'Model workbook not found' }, 409);

  const parsed = mutationRejectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid mutation reject request', issues: parsed.error.issues }, 400);
  if (parsed.data.baseVersion !== model.version) {
    return c.json({ error: 'Stale mutation base version', expectedBaseVersion: model.version, receivedBaseVersion: parsed.data.baseVersion }, 409);
  }

  const request: MutationRequest = {
    actor: parsed.data.actor,
    rationale: parsed.data.rationale,
    operations: parsed.data.operations,
  };
  const tests = testStore.listTests(model.id) as ModelTestDefinition[];
  const preview = previewMutation(model, workbook, request, tests);
  if (preview.previewId !== parsed.data.previewId) {
    return c.json({ error: 'Mutation preview no longer matches the proposed rejection', currentPreview: preview }, 409);
  }
  return c.json({ rejected: true, previewId: preview.previewId, persisted: false });
});

/** POST /models/:id/mutations/undo — Restore a prior snapshot through the governed mutation path. */
mutationsRouter.post('/:id/mutations/undo', async (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  const workbook = store.getWorkbook(model.id);
  if (!workbook) return c.json({ error: 'Model workbook not found' }, 409);

  const parsed = mutationUndoSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid mutation undo request', issues: parsed.error.issues }, 400);
  if (parsed.data.baseVersion !== model.version) {
    return c.json({ error: 'Stale mutation base version', expectedBaseVersion: model.version, receivedBaseVersion: parsed.data.baseVersion }, 409);
  }

  const target = snapshotStore.get(parsed.data.targetSnapshotId);
  if (!target || target.modelId !== model.id) return c.json({ error: 'Target snapshot not found' }, 404);
  const targetParameters = new Map(target.data.parameters.map((parameter) => [parameter.id, parameter]));
  if (model.parameters.some((parameter) => !targetParameters.has(parameter.id))) {
    return c.json({ error: 'Snapshot structure is incompatible with parameter-only undo' }, 422);
  }
  const operations = model.parameters
    .filter((parameter) => targetParameters.get(parameter.id)!.currentValue !== parameter.currentValue)
    .map((parameter) => ({
      type: 'setParameterValue' as const,
      parameterId: parameter.id,
      value: targetParameters.get(parameter.id)!.currentValue,
    }));
  if (operations.length === 0) return c.json({ error: 'Target snapshot matches the current parameter state' }, 422);

  const request: MutationRequest = { actor: parsed.data.actor, rationale: parsed.data.rationale, operations };
  const tests = testStore.listTests(model.id) as ModelTestDefinition[];
  const preview = previewMutation(model, workbook, request, tests);
  if (hasCommitBlocker(preview)) return c.json({ error: 'Undo did not pass commit gates', preview }, 422);

  const result = persistMutation(model, request, preview, parsed.data.baseVersion, target.id);
  if (!result.committed) {
    return c.json({ error: 'Stale mutation base version', expectedBaseVersion: store.getModel(model.id)?.version, receivedBaseVersion: parsed.data.baseVersion }, 409);
  }
  return c.json({
    model: result.committedModel,
    diff: preview.diff,
    affectedComponents: preview.affectedComponents,
    affectedOutputs: preview.affectedOutputs,
    tests: preview.testResults,
    contractFindings: preview.contractFindings,
    snapshotId: result.snapshot.id,
    evidenceId: result.evidence.id,
    restoredFromSnapshotId: target.id,
  }, 201);
});