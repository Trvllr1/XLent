import crypto from 'crypto';
import { previewMutation } from '@xlent/core';
import type { EvidenceRecord, Model, ModelTestDefinition, MutationApproval, MutationPreview, MutationRequest, Snapshot } from '@xlent/core';
import { Hono } from 'hono';
import db from '../db.js';
import { mutationApproveSchema, mutationCommitSchema, mutationPreviewSchema, mutationRejectSchema, mutationUndoSchema } from '../schemas.js';
import { evidenceStore, snapshotStore, store, testStore } from '../store.js';
import type { ApiPrincipal } from '../middleware/auth.js';

export const mutationsRouter = new Hono();

function hasCommitBlocker(preview: MutationPreview): boolean {
  return !preview.valid
    || !preview.allTestsPass
    || preview.contractFindings.some((finding) => finding.severity === 'critical')
    || !preview.proposedModel;
}

function isConsequential(preview: MutationPreview): boolean {
  return preview.diff?.entries.some((entry) => entry.semantics === 'semantic') ?? false;
}

function humanEquivalentAgents(): Set<string> {
  return new Set((process.env.XLENT_HUMAN_EQUIVALENT_AGENTS ?? '').split(',').map((id) => id.trim()).filter(Boolean));
}

function hasHumanEquivalentRole(actorId: string, principal?: ApiPrincipal): boolean {
  return humanEquivalentAgents().has(actorId)
    || (principal?.id === actorId && principal.roles?.includes('human-equivalent-reviewer') === true);
}

function actorMatchesPrincipal(context: { get: (key: string) => unknown }, actor: MutationRequest['actor']): boolean {
  const principal = principalFromContext(context);
  return !principal || (principal.id === actor.id && principal.type === actor.type);
}

function principalFromContext(context: { get: (key: string) => unknown }): ApiPrincipal | undefined {
  return context.get('xlentPrincipal') as ApiPrincipal | undefined;
}

function approvalSignature(modelId: string, approval: Omit<MutationApproval, 'decision' | 'signature'>): string {
  const secret = process.env.XLENT_APPROVAL_SECRET ?? 'xlent-local-development-approval-key';
  return crypto.createHmac('sha256', secret).update(JSON.stringify({
    modelId,
    previewId: approval.previewId,
    actor: approval.actor,
    rationale: approval.rationale,
  })).digest('hex');
}

function hasValidApprovalSignature(modelId: string, approval: MutationApproval): boolean {
  const received = Buffer.from(approval.signature, 'hex');
  const expected = Buffer.from(approvalSignature(modelId, approval), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function approvalError(modelId: string, request: MutationRequest, preview: MutationPreview, approval?: MutationApproval, principal?: ApiPrincipal): string | null {
  if (request.actor.type !== 'agent' || !isConsequential(preview)) return null;
  if (hasHumanEquivalentRole(request.actor.id, principal)) return null;
  if (!approval) return 'A consequential agent mutation requires independent human-equivalent approval.';
  if (!hasValidApprovalSignature(modelId, approval)) return 'Mutation approval signature is invalid.';
  if (approval.previewId !== preview.previewId) return 'Mutation approval is not bound to the current preview.';
  if (approval.actor.id === request.actor.id) return 'An agent cannot approve its own consequential mutation.';
  if (approval.actor.type === 'agent' && !hasHumanEquivalentRole(approval.actor.id)) {
    return 'The approving agent does not have the human-equivalent reviewer role.';
  }
  return null;
}

function persistMutation(
  model: Model,
  request: MutationRequest,
  preview: MutationPreview,
  baseVersion: number,
  approval?: MutationApproval,
  restoredFromSnapshotId?: string,
) {
  const committedModel = structuredClone(preview.proposedModel!);
  committedModel.version = model.version + 1;
  committedModel.assuranceLevel = 'UNASSESSED';
  const committedAt = new Date().toISOString();
  const modelChecksum = crypto.createHash('sha256').update(JSON.stringify(committedModel)).digest('hex');
  const evidenceChecksum = crypto.createHash('sha256').update(JSON.stringify({
    modelChecksum,
    sourceFindingId: request.findingId,
    tests: preview.testResults,
    contractFindings: preview.contractFindings,
    mutationDebugger: {
      watchValues: preview.watchValues ?? {},
      breakpointResults: preview.breakpointResults ?? [],
      outputTraces: preview.outputTraces ?? [],
    },
    mutationReview: {
      relevantTestIds: preview.relevantTestIds ?? [],
      fullTestIds: preview.testResults.map((result) => result.testId),
      contractFindingIds: preview.contractFindings.map((finding) => finding.id),
    },
    mutationDecision: {
      decision: 'committed',
      previewId: preview.previewId!,
      proposer: request.actor,
      approver: approval?.actor,
      approvalRationale: approval?.rationale,
      resultingVersion: committedModel.version,
    },
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
    overrides: request.operations
      .filter((operation) => operation.type === 'setParameterValue')
      .map((operation) => ({ parameterId: operation.parameterId, value: operation.value })),
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
    mutationDecision: {
      decision: 'committed',
      previewId: preview.previewId!,
      proposer: request.actor,
      approver: approval?.actor,
      approvalRationale: approval?.rationale,
      resultingVersion: committedModel.version,
    },
    sourceFindingId: request.findingId,
    mutationReview: {
      relevantTestIds: preview.relevantTestIds ?? [],
      fullTestIds: preview.testResults.map((result) => result.testId),
      contractFindingIds: preview.contractFindings.map((finding) => finding.id),
    },
    mutationDebugger: {
      watchValues: preview.watchValues ?? {},
      breakpointResults: preview.breakpointResults ?? [],
      outputTraces: preview.outputTraces ?? [],
    },
    restoredFromSnapshotId,
  };

  const committed = db.transaction(() => {
    if (!store.setModelIfVersion(committedModel, baseVersion)) return false;
    if (preview.proposedWorkbook) store.setWorkbook(model.id, preview.proposedWorkbook);
    for (const test of preview.proposedTests ?? []) {
      if (!testStore.updateAssertion(model.id, test.id, test.assertion)) {
        throw new Error(`Mutation test "${test.id}" could not be updated atomically.`);
      }
    }
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
  if (!actorMatchesPrincipal(c, parsed.data.actor)) return c.json({ error: 'Mutation actor does not match the authenticated API principal.' }, 403);

  const tests = testStore.listTests(model.id) as ModelTestDefinition[];
  const preview = previewMutation(model, workbook, parsed.data as MutationRequest, tests);
  return c.json(preview, preview.valid ? 200 : 422);
});

/** POST /models/:id/mutations/approve — Issue a signed approval bound to one preview. */
mutationsRouter.post('/:id/mutations/approve', async (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  const parsed = mutationApproveSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid mutation approval request', issues: parsed.error.issues }, 400);
  if (!actorMatchesPrincipal(c, parsed.data.actor)) return c.json({ error: 'Approval actor does not match the authenticated API principal.' }, 403);
  const principal = principalFromContext(c);
  if (parsed.data.actor.type === 'agent' && !hasHumanEquivalentRole(parsed.data.actor.id, principal)) {
    return c.json({ error: 'Agent does not have the human-equivalent reviewer role.' }, 403);
  }
  const approval: MutationApproval = {
    actor: parsed.data.actor,
    decision: 'approved',
    rationale: parsed.data.rationale,
    previewId: parsed.data.previewId,
    signature: approvalSignature(model.id, parsed.data),
  };
  return c.json({ approval }, 201);
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
  if (!actorMatchesPrincipal(c, parsed.data.actor)) return c.json({ error: 'Mutation actor does not match the authenticated API principal.' }, 403);
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
    breakpoints: parsed.data.breakpoints,
    findingId: parsed.data.findingId,
  };
  const tests = testStore.listTests(model.id) as ModelTestDefinition[];
  const preview = previewMutation(model, workbook, request, tests);
  if (preview.previewId !== parsed.data.previewId) {
    return c.json({ error: 'Mutation preview no longer matches the proposed commit', currentPreview: preview }, 409);
  }
  if (hasCommitBlocker(preview)) {
    return c.json({ error: 'Mutation did not pass commit gates', preview }, 422);
  }
  const authorizationError = approvalError(
    model.id,
    request,
    preview,
    parsed.data.approval as MutationApproval | undefined,
    principalFromContext(c),
  );
  if (authorizationError) {
    return c.json({ error: authorizationError, preview, policy: 'independent-human-equivalent-review' }, 403);
  }

  const result = persistMutation(model, request, preview, parsed.data.baseVersion, parsed.data.approval as MutationApproval | undefined);
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
  if (!actorMatchesPrincipal(c, parsed.data.actor)) return c.json({ error: 'Mutation actor does not match the authenticated API principal.' }, 403);
  if (parsed.data.baseVersion !== model.version) {
    return c.json({ error: 'Stale mutation base version', expectedBaseVersion: model.version, receivedBaseVersion: parsed.data.baseVersion }, 409);
  }

  const request: MutationRequest = {
    actor: parsed.data.actor,
    rationale: parsed.data.rationale,
    operations: parsed.data.operations,
    breakpoints: parsed.data.breakpoints,
    findingId: parsed.data.findingId,
  };
  const tests = testStore.listTests(model.id) as ModelTestDefinition[];
  const preview = previewMutation(model, workbook, request, tests);
  if (preview.previewId !== parsed.data.previewId) {
    return c.json({ error: 'Mutation preview no longer matches the proposed rejection', currentPreview: preview }, 409);
  }
  const rejectedAt = new Date().toISOString();
  const evidence: EvidenceRecord = {
    id: crypto.randomUUID(),
    modelId: model.id,
    modelVersion: model.version,
    executedAt: rejectedAt,
    inputs: Object.fromEntries(model.parameters.map((parameter) => [parameter.id, parameter.currentValue])),
    overrides: [],
    outputs: Object.fromEntries(model.outputs.map((output) => [output.id, output.value])),
    tests: preview.testResults,
    contractFindings: preview.contractFindings,
    allTestsPass: preview.allTestsPass,
    checksum: crypto.createHash('sha256').update(JSON.stringify({
      modelId: model.id,
      modelVersion: model.version,
      previewId: preview.previewId,
      decision: 'rejected',
      actor: request.actor,
      rationale: request.rationale,
    })).digest('hex'),
    reproducible: true,
    executedBy: `${request.actor.type}:${request.actor.id}`,
    purpose: 'mutation_reject',
    rationale: request.rationale,
    mutationOperations: request.operations,
    mutationDecision: {
      decision: 'rejected',
      previewId: preview.previewId!,
      proposer: request.actor,
    },
  };
  evidenceStore.store(evidence);
  return c.json({ rejected: true, previewId: preview.previewId, persisted: false, evidenceId: evidence.id });
});

/** POST /models/:id/mutations/undo — Restore a prior snapshot through the governed mutation path. */
mutationsRouter.post('/:id/mutations/undo', async (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  const workbook = store.getWorkbook(model.id);
  if (!workbook) return c.json({ error: 'Model workbook not found' }, 409);

  const parsed = mutationUndoSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid mutation undo request', issues: parsed.error.issues }, 400);
  if (!actorMatchesPrincipal(c, parsed.data.actor)) return c.json({ error: 'Mutation actor does not match the authenticated API principal.' }, 403);
  if (parsed.data.baseVersion !== model.version) {
    return c.json({ error: 'Stale mutation base version', expectedBaseVersion: model.version, receivedBaseVersion: parsed.data.baseVersion }, 409);
  }

  const target = snapshotStore.get(parsed.data.targetSnapshotId);
  if (!target || target.modelId !== model.id) return c.json({ error: 'Target snapshot not found' }, 404);
  const targetParameters = new Map(target.data.parameters.map((parameter) => [parameter.id, parameter]));
  const operations: MutationRequest['operations'] = [];
  target.data.parameters.forEach((parameter, index) => {
    if (!model.parameters.some((current) => current.id === parameter.id)) {
      const cellId = `${parameter.sourceCell.sheet}!${parameter.sourceCell.ref}`;
      operations.push({ type: 'restoreParameter', parameterId: parameter.id, parameter, index, graphIndex: target.data.graph.nodes.indexOf(cellId) });
    }
  });
  for (const parameter of model.parameters) {
    const targetParameter = targetParameters.get(parameter.id)!;
    if (!targetParameter) {
      operations.push({ type: 'removeParameter', parameterId: parameter.id });
      continue;
    }
    if (targetParameter.name !== parameter.name) {
      operations.push({ type: 'renameParameter', parameterId: parameter.id, name: targetParameter.name });
    }
    if (targetParameter.source !== parameter.source) {
      operations.push({ type: 'restoreParameterSource', parameterId: parameter.id });
    }
    if (targetParameter.currentValue !== parameter.currentValue) {
      operations.push({ type: 'setParameterValue', parameterId: parameter.id, value: targetParameter.currentValue });
    }
  }
  const workingOrder = model.parameters.map((parameter) => parameter.id);
  for (const operation of operations) {
    if (operation.type === 'restoreParameter') workingOrder.splice(operation.index, 0, operation.parameterId);
    if (operation.type === 'removeParameter') workingOrder.splice(workingOrder.indexOf(operation.parameterId), 1);
  }
  target.data.parameters.forEach((parameter, toIndex) => {
    const fromIndex = workingOrder.indexOf(parameter.id);
    if (fromIndex !== toIndex) {
      operations.push({ type: 'moveParameter', parameterId: parameter.id, toIndex });
      workingOrder.splice(fromIndex, 1);
      workingOrder.splice(toIndex, 0, parameter.id);
    }
  });
  const currentOutputs = new Map(model.outputs.map((output) => [output.id, output]));
  const targetOutputs = new Map(target.data.outputs.map((output) => [output.id, output]));
  target.data.outputs.forEach((output, index) => {
    if (!currentOutputs.has(output.id)) {
      operations.push({ type: 'restoreOutput', outputId: output.id, output, index });
    }
  });
  for (const output of model.outputs) {
    const targetOutput = targetOutputs.get(output.id);
    if (!targetOutput) {
      operations.push({ type: 'removeOutput', outputId: output.id });
      continue;
    }
    if (targetOutput.name !== output.name) {
      operations.push({ type: 'renameOutput', outputId: output.id, name: targetOutput.name });
    }
  }
  const workingOutputOrder = model.outputs.map((output) => output.id);
  for (const operation of operations) {
    if (operation.type === 'restoreOutput') workingOutputOrder.splice(operation.index, 0, operation.outputId);
    if (operation.type === 'removeOutput') workingOutputOrder.splice(workingOutputOrder.indexOf(operation.outputId), 1);
  }
  target.data.outputs.forEach((output, toIndex) => {
    const fromIndex = workingOutputOrder.indexOf(output.id);
    if (fromIndex !== toIndex) {
      operations.push({ type: 'moveOutput', outputId: output.id, toIndex });
      workingOutputOrder.splice(fromIndex, 1);
      workingOutputOrder.splice(toIndex, 0, output.id);
    }
  });
  const currentCalculations = new Map(model.calculations.map((calculation) => [`${calculation.sourceCell.sheet}!${calculation.sourceCell.ref}`, calculation]));
  for (const targetCalculation of target.data.calculations) {
    const key = `${targetCalculation.sourceCell.sheet}!${targetCalculation.sourceCell.ref}`;
    const current = currentCalculations.get(key);
    if (!current) {
      const targetParameter = target.data.parameters.find((parameter) => `${parameter.sourceCell.sheet}!${parameter.sourceCell.ref}` === key);
      if (targetParameter) {
        operations.push({ type: 'setParameterSource', parameterId: targetParameter.id, formula: targetCalculation.originalFormula });
      }
      continue;
    }
    if (current.originalFormula !== targetCalculation.originalFormula) {
      operations.push({ type: 'setCellFormula', sourceCell: targetCalculation.sourceCell, formula: targetCalculation.originalFormula });
    }
  }
  if (operations.length === 0) return c.json({ error: 'Target snapshot matches the current model state' }, 422);

  const request: MutationRequest = { actor: parsed.data.actor, rationale: parsed.data.rationale, operations };
  const tests = testStore.listTests(model.id) as ModelTestDefinition[];
  const preview = previewMutation(model, workbook, request, tests);
  if (hasCommitBlocker(preview)) return c.json({ error: 'Undo did not pass commit gates', preview }, 422);

  const result = persistMutation(model, request, preview, parsed.data.baseVersion, undefined, target.id);
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