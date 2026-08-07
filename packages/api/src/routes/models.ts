import { Hono } from 'hono';
import crypto from 'crypto';
import {
  parseWorkbook,
  discoverModel,
  buildGraph,
  findRootNodes,
  findTerminalNodes,
  resolveLabels,
  ModelRuntime,
  runScenario,
  compareScenarios,
  diffModels,
  bumpSemver,
  runModelTests,
  buildModelPackage,
  computeParameterImpact,
  buildCalculations,
} from '@xlent/core';
import type { Model, ModelStatus, ModelTestDefinition, Parameter, Output, ScenarioOverride, Deliverable, Snapshot, EvidenceRecord } from '@xlent/core';
import { store, clientStore, snapshotStore, testStore, evidenceStore } from '../store.js';
import { runModelSchema, createScenarioSchema, compareSchema, deliverablePushSchema, deliverToClientSchema, statusTransitionSchema } from '../schemas.js';

export const modelsRouter = new Hono();

function generateSlug(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** POST /models/import — Upload and parse a workbook */
modelsRouter.post('/import', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'File upload required (field: "file")' }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name || 'workbook.xlsx';

  const workbook = parseWorkbook(buffer, filename);
  const discovery = discoverModel(workbook);
  const graph = buildGraph(workbook);

  // Auto-classify inputs and outputs (user can refine later)
  const rootNodes = findRootNodes(graph);
  const terminalNodes = findTerminalNodes(graph);
  const labels = resolveLabels(workbook, graph);

  const parameters: Parameter[] = [];
  const outputs: Output[] = [];

  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      const cellId = `${cell.address.sheet}!${cell.address.ref}`;

      if (!cell.formula && cell.type === 'number' && rootNodes.includes(cellId)) {
        const label = labels.get(cellId) || null;
        parameters.push({
          id: crypto.randomUUID(),
          name: label || cellId,
          type: cell.type,
          format: cell.format,
          currentValue: cell.value,
          originalValue: cell.value,
          sourceCell: cell.address,
          source: 'CLIENT_MODEL',
          confidence: label ? 'HIGH' : 'MEDIUM',
          confirmed: false,
        });
      }

      if (cell.formula && terminalNodes.includes(cellId)) {
        if (cell.value == null || (typeof cell.value === 'string' && !cell.value.trim())) continue;
        const label = labels.get(cellId) || null;
        outputs.push({
          id: crypto.randomUUID(),
          name: label || cellId,
          value: cell.value,
          format: cell.format,
          sourceCell: cell.address,
          dependsOn: [],
          confidence: label ? 'HIGH' : 'MEDIUM',
          confirmed: false,
        });
      }
    }
  }

  const baseSlug = generateSlug(filename);
  let slug = baseSlug;
  let suffix = 1;
  while (store.slugExists(slug)) {
    slug = `${baseSlug}-${++suffix}`;
  }

  const model: Model = {
    id: crypto.randomUUID(),
    name: filename.replace(/\.[^.]+$/, ''),
    slug,
    semver: '1.0.0',
    version: 1,
    status: 'draft',
    createdAt: new Date().toISOString(),
    workbookName: filename,
    parameters,
    calculations: buildCalculations(workbook, graph),
    outputs,
    graph,
    compatibility: {
      status: discovery.compatibility,
      supportedFormulas: discovery.formulaCells - discovery.unsupportedFunctions,
      totalFormulas: discovery.formulaCells,
      issues: [],
    },
    discovery,
  };

  store.setModel(model);
  store.setWorkbook(model.id, workbook);
  store.setOriginal(model.id, buffer);

  // Auto-create initial snapshot
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const snapshot: Snapshot = {
    id: crypto.randomUUID(),
    modelId: model.id,
    semver: model.semver,
    message: 'Initial import',
    checksum,
    createdAt: model.createdAt,
    data: model,
  };
  snapshotStore.create(snapshot);

  return c.json({ model, discovery }, 201);
});

/** POST /models/:id/analyze — Re-run discovery and refresh labels */
modelsRouter.post('/:id/analyze', (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);

  const workbook = store.getWorkbook(c.req.param('id'));
  if (!workbook) {
    // No workbook stored — just clean up empty outputs from stored data
    model.outputs = (model.outputs || []).filter((o: any) =>
      o.value != null && !(typeof o.value === 'string' && !o.value.trim())
    );
    store.setModel(model);
    return c.json({ model, discovery: model.discovery, warning: 'Workbook not found — re-upload to enable full analysis' });
  }

  const discovery = discoverModel(workbook);
  const graph = buildGraph(workbook);
  const rootNodes = findRootNodes(graph);
  const terminalNodes = findTerminalNodes(graph);
  const labels = resolveLabels(workbook, graph);

  const parameters: Parameter[] = [];
  const outputs: Output[] = [];

  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      const cellId = `${cell.address.sheet}!${cell.address.ref}`;

      if (!cell.formula && cell.type === 'number' && rootNodes.includes(cellId)) {
        const label = labels.get(cellId) || null;
        parameters.push({
          id: crypto.randomUUID(),
          name: label || cellId,
          type: cell.type,
          format: cell.format,
          currentValue: cell.value,
          originalValue: cell.value,
          sourceCell: cell.address,
          source: 'CLIENT_MODEL',
          confidence: label ? 'HIGH' : 'MEDIUM',
          confirmed: false,
        });
      }

      if (cell.formula && terminalNodes.includes(cellId)) {
        if (cell.value == null || (typeof cell.value === 'string' && !cell.value.trim())) continue;
        const label = labels.get(cellId) || null;
        outputs.push({
          id: crypto.randomUUID(),
          name: label || cellId,
          value: cell.value,
          format: cell.format,
          sourceCell: cell.address,
          dependsOn: [],
          confidence: label ? 'HIGH' : 'MEDIUM',
          confirmed: false,
        });
      }
    }
  }

  model.parameters = parameters;
  model.outputs = outputs;
  model.graph = graph;
  model.discovery = discovery;
  store.setModel(model);

  return c.json({ model, discovery });
});

/** POST /models/:id/reimport — Re-import xlsx, bump version, generate diff */
modelsRouter.post('/:id/reimport', async (c) => {
  const existingModel = store.getModel(c.req.param('id'));
  if (!existingModel) return c.json({ error: 'Model not found' }, 404);

  const body = await c.req.parseBody();
  const file = body['file'];
  if (!file || !(file instanceof File)) {
    return c.json({ error: 'File upload required (field: "file")' }, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name || existingModel.workbookName;

  const workbook = parseWorkbook(buffer, filename);
  const discovery = discoverModel(workbook);
  const graph = buildGraph(workbook);
  const rootNodes = findRootNodes(graph);
  const terminalNodes = findTerminalNodes(graph);
  const labels = resolveLabels(workbook, graph);

  const parameters: Parameter[] = [];
  const outputs: Output[] = [];

  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      const cellId = `${cell.address.sheet}!${cell.address.ref}`;
      if (!cell.formula && cell.type === 'number' && rootNodes.includes(cellId)) {
        const label = labels.get(cellId) || null;
        parameters.push({
          id: crypto.randomUUID(),
          name: label || cellId,
          type: cell.type,
          format: cell.format,
          currentValue: cell.value,
          originalValue: cell.value,
          sourceCell: cell.address,
          source: 'CLIENT_MODEL',
          confidence: label ? 'HIGH' : 'MEDIUM',
          confirmed: false,
        });
      }
      if (cell.formula && terminalNodes.includes(cellId)) {
        if (cell.value == null || (typeof cell.value === 'string' && !cell.value.trim())) continue;
        const label = labels.get(cellId) || null;
        outputs.push({
          id: crypto.randomUUID(),
          name: label || cellId,
          value: cell.value,
          format: cell.format,
          sourceCell: cell.address,
          dependsOn: [],
          confidence: label ? 'HIGH' : 'MEDIUM',
          confirmed: false,
        });
      }
    }
  }

  // Generate diff against current model to determine version bump
  const newModelDraft: Model = {
    ...existingModel,
    version: existingModel.version + 1,
    status: 'draft',
    workbookName: filename,
    parameters,
    calculations: buildCalculations(workbook, graph),
    outputs,
    graph,
    compatibility: {
      status: discovery.compatibility,
      supportedFormulas: discovery.formulaCells - discovery.unsupportedFunctions,
      totalFormulas: discovery.formulaCells,
      issues: [],
    },
    discovery,
  };

  const diff = diffModels(existingModel, newModelDraft);
  const newSemver = bumpSemver(existingModel.semver, diff.suggestedBump);

  const updatedModel: Model = { ...newModelDraft, semver: newSemver };

  store.setModel(updatedModel);
  store.setWorkbook(updatedModel.id, workbook);
  store.setOriginal(updatedModel.id, buffer);

  // Create snapshot for new version
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const snapshot: Snapshot = {
    id: crypto.randomUUID(),
    modelId: updatedModel.id,
    semver: newSemver,
    message: `Re-import: ${diff.summary}`,
    checksum,
    createdAt: new Date().toISOString(),
    data: updatedModel,
  };
  snapshotStore.create(snapshot);

  return c.json({ model: updatedModel, diff, snapshot: { id: snapshot.id, semver: newSemver, checksum } }, 200);
});

/** GET /models — List all models */
modelsRouter.get('/', (c) => {
  return c.json({ models: store.listModels() });
});

/** GET /models/:id — Get model details (with parameter impact, E7.3) */
modelsRouter.get('/:id', (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  const parameterImpact = computeParameterImpact(model.graph, model.parameters);
  return c.json({ model, parameterImpact });
});

/** GET /models/:id/parameters — Get model parameters */
modelsRouter.get('/:id/parameters', (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  return c.json({ parameters: model.parameters });
});

/** GET /models/:id/outputs — Get model outputs */
modelsRouter.get('/:id/outputs', (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  return c.json({ outputs: model.outputs });
});

/** POST /models/:id/run — Execute model with optional overrides */
modelsRouter.post('/:id/run', async (c) => {
  const model = store.getModel(c.req.param('id'));
  const workbook = store.getWorkbook(c.req.param('id'));
  if (!model || !workbook) return c.json({ error: 'Model not found' }, 404);

  const raw = await c.req.json().catch(() => ({}));
  const parsed = runModelSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);

  const runtime = new ModelRuntime(model, workbook);
  const results = runtime.run(parsed.data.overrides as ScenarioOverride[] | undefined);

  return c.json({ results });
});

/** POST /models/:id/scenarios — Create a named scenario */
modelsRouter.post('/:id/scenarios', async (c) => {
  const model = store.getModel(c.req.param('id'));
  const workbook = store.getWorkbook(c.req.param('id'));
  if (!model || !workbook) return c.json({ error: 'Model not found' }, 404);

  const raw = await c.req.json().catch(() => ({}));
  const parsed = createScenarioSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);

  const scenario = runScenario(model, workbook, parsed.data.name, parsed.data.overrides as ScenarioOverride[]);
  return c.json({ scenario }, 201);
});

/** POST /models/:id/compare — Compare baseline vs scenario */
modelsRouter.post('/:id/compare', async (c) => {
  const model = store.getModel(c.req.param('id'));
  const workbook = store.getWorkbook(c.req.param('id'));
  if (!model || !workbook) return c.json({ error: 'Model not found' }, 404);

  const raw = await c.req.json().catch(() => ({}));
  const parsed = compareSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);

  const comparison = compareScenarios(
    model,
    workbook,
    (parsed.data.baselineOverrides as ScenarioOverride[]) || null,
    parsed.data.scenarioOverrides as ScenarioOverride[],
    parsed.data.scenarioId || 'ad-hoc',
  );

  return c.json({ comparison });
});

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ['sandbox'],
  sandbox: ['validated', 'draft'],
  validated: ['approved', 'draft'],
  approved: ['published', 'draft'],
  published: ['deprecated'],
  deprecated: [],
};

/** PATCH /models/:id/status — Transition model lifecycle state */
modelsRouter.patch('/:id/status', async (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);

  const raw = await c.req.json().catch(() => ({}));
  const parsed = statusTransitionSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);

  const target = parsed.data.status as ModelStatus;
  const allowed = VALID_TRANSITIONS[model.status] || [];
  if (!allowed.includes(target)) {
    return c.json({ error: `Invalid transition: ${model.status} → ${target}. Allowed: [${allowed.join(', ')}]` }, 409);
  }

  // Validated gate: requires a contract (Rule 11 — intent must be explicit) + all tests pass
  if (target === 'validated') {
    if (!model.contract) {
      return c.json({ error: 'Cannot validate: no model contract defined. Declare intent (inputs, outputs, invariants) before validation.' }, 409);
    }
    const tests = testStore.listTests(model.id);
    if (tests.length === 0) return c.json({ error: 'Cannot validate: no tests defined' }, 409);

    const workbook = store.getWorkbook(model.id);
    if (!workbook) return c.json({ error: 'Workbook not found' }, 500);

    const { runModelTests } = await import('@xlent/core');
    const results = runModelTests(model, workbook, tests.map((t: any) => ({ id: t.id, modelId: t.modelId, name: t.name, category: t.category, assertion: t.assertion, autoGenerated: t.autoGenerated })));
    const allPass = results.every((r) => r.status === 'pass' || r.status === 'skip');
    if (!allPass) {
      const failures = results.filter((r) => r.status === 'fail' || r.status === 'error');
      return c.json({ error: 'Cannot validate: tests failing', failures: failures.map((f) => ({ name: f.name, status: f.status, message: f.message })) }, 409);
    }
  }

  // Publish gate: create immutable snapshot + evidence
  if (target === 'published') {
    const original = store.getOriginal(model.id);
    const checksum = original
      ? crypto.createHash('sha256').update(original).digest('hex')
      : crypto.createHash('sha256').update(JSON.stringify(model)).digest('hex');

    const snapshot: Snapshot = {
      id: crypto.randomUUID(),
      modelId: model.id,
      semver: model.semver,
      message: `Published v${model.semver}`,
      checksum,
      createdAt: new Date().toISOString(),
      data: { ...model, status: 'published' },
    };
    snapshotStore.create(snapshot);

    // Create publish evidence record
    const tests = testStore.listTests(model.id);
    if (tests.length > 0) {
      const workbook = store.getWorkbook(model.id);
      if (workbook) {
        const { runModelTests } = await import('@xlent/core');
        const results = runModelTests(model, workbook, tests.map((t: any) => ({ id: t.id, modelId: t.modelId, name: t.name, category: t.category, assertion: t.assertion, autoGenerated: t.autoGenerated })));
        const evidenceRecord: EvidenceRecord = {
          id: crypto.randomUUID(),
          modelId: model.id,
          modelVersion: model.version,
          executedAt: new Date().toISOString(),
          inputs: {},
          overrides: [],
          outputs: {},
          tests: results,
          allTestsPass: results.every((r) => r.status === 'pass' || r.status === 'skip'),
          checksum,
          reproducible: true,
          purpose: 'publish_gate',
        };
        evidenceStore.store(evidenceRecord);
      }
    }
  }

  const updated: Model = { ...model, status: target };
  store.setModel(updated);
  return c.json({ model: updated });
});

/** DELETE /models/:id — Remove a model */
modelsRouter.delete('/:id', (c) => {
  const deleted = store.deleteModel(c.req.param('id'));
  if (!deleted) return c.json({ error: 'Model not found' }, 404);
  return c.json({ deleted: true });
});

/** GET /models/:id/package — Full model package with assurance summary */
modelsRouter.get('/:id/package', (c) => {
  const modelId = c.req.param('id');
  const model = store.getModel(modelId);
  const workbook = store.getWorkbook(modelId);
  if (!model || !workbook) return c.json({ error: 'Model not found' }, 404);

  const tests = testStore.listTests(modelId);
  const defs: ModelTestDefinition[] = tests.map((t: any) => ({ id: t.id, modelId: t.modelId, name: t.name, category: t.category, assertion: t.assertion, description: t.description, autoGenerated: t.autoGenerated }));
  const testResults = defs.length > 0 ? runModelTests(model, workbook, defs) : [];
  const latestEvidence = evidenceStore.list(modelId, 1);
  const evidence = latestEvidence.length > 0 ? latestEvidence[0] : undefined;

  const pkg = buildModelPackage(model, workbook, testResults, evidence);
  return c.json(pkg);
});

/** GET /models/:id/deliverable — Package model run as a deliverable for clients */
modelsRouter.get('/:id/deliverable', async (c) => {
  const model = store.getModel(c.req.param('id'));
  const workbook = store.getWorkbook(c.req.param('id'));
  if (!model || !workbook) return c.json({ error: 'Model not found' }, 404);

  const runtime = new ModelRuntime(model, workbook);
  const results = runtime.run();

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
    overridesApplied: [],
    compatibility: model.compatibility,
  };

  return c.json({ deliverable });
});

/** POST /models/:id/deliverable/push — Run model and POST deliverable to a callback URL */
modelsRouter.post('/:id/deliverable/push', async (c) => {
  const model = store.getModel(c.req.param('id'));
  const workbook = store.getWorkbook(c.req.param('id'));
  if (!model || !workbook) return c.json({ error: 'Model not found' }, 404);

  const raw = await c.req.json().catch(() => ({}));
  const parsed = deliverablePushSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);

  const runtime = new ModelRuntime(model, workbook);
  const results = runtime.run(parsed.data.overrides as ScenarioOverride[] | undefined);

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
    overridesApplied: parsed.data.overrides as ScenarioOverride[] || [],
    compatibility: model.compatibility,
  };

  // Fire-and-forget push to client
  fetch(parsed.data.callbackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deliverable }),
  }).catch(() => { /* best-effort */ });

  return c.json({ deliverable, pushed: true }, 202);
});

/** POST /models/:id/deliver — Run model and push to a registered client with retry + audit */
modelsRouter.post('/:id/deliver', async (c) => {
  const model = store.getModel(c.req.param('id'));
  const workbook = store.getWorkbook(c.req.param('id'));
  if (!model || !workbook) return c.json({ error: 'Model not found' }, 404);

  const raw = await c.req.json().catch(() => ({}));
  const parsed = deliverToClientSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);

  const client = clientStore.getClient(parsed.data.clientId);
  if (!client) return c.json({ error: 'Client not found' }, 404);

  const runtime = new ModelRuntime(model, workbook);
  const results = runtime.run(parsed.data.overrides as ScenarioOverride[] | undefined);

  const deliverable: Deliverable = {
    id: crypto.randomUUID(),
    modelId: model.id,
    modelName: model.name,
    modelVersion: model.version,
    executedAt: new Date().toISOString(),
    outputs: model.outputs.map((o) => ({
      id: o.id, name: o.name, value: results[o.id],
      sourceCell: `${o.sourceCell.sheet}!${o.sourceCell.ref}`, confidence: o.confidence,
    })),
    parameters: model.parameters.map((p) => ({
      id: p.id, name: p.name, value: p.currentValue,
      sourceCell: `${p.sourceCell.sheet}!${p.sourceCell.ref}`, confidence: p.confidence,
    })),
    overridesApplied: parsed.data.overrides as ScenarioOverride[] || [],
    compatibility: model.compatibility,
  };

  const delivery = clientStore.createDelivery(model.id, client.id);

  // Push with retry (up to 3 attempts)
  const push = async () => {
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(client.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-XLent-Signature': client.apiKey,
            'X-XLent-Delivery-Id': delivery.id,
          },
          body: JSON.stringify({ deliverable }),
          signal: AbortSignal.timeout(10_000),
        });
        clientStore.completeDelivery(delivery.id, res.status);
        return;
      } catch (err: any) {
        if (attempt === MAX_RETRIES) {
          clientStore.failDelivery(delivery.id, err.message);
        }
        // Back off before retry
        await new Promise((r) => setTimeout(r, attempt * 1000));
      }
    }
  };
  push(); // fire async — don't await

  return c.json({ deliverable, delivery: { id: delivery.id, clientId: client.id, clientName: client.name } }, 202);
});

/** GET /models/:id/graph — Get dependency graph */
modelsRouter.get('/:id/graph', (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  return c.json({ graph: model.graph });
});

/** GET /models/:id/compatibility — Get compatibility report */
modelsRouter.get('/:id/compatibility', (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  return c.json({ compatibility: model.compatibility });
});

/** GET /models/:id/provenance — Get provenance for all parameters */
modelsRouter.get('/:id/provenance', (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);

  const provenance = model.parameters.map((p: Parameter) => ({
    parameterId: p.id,
    source: p.source,
    workbook: model.workbookName,
    sheet: p.sourceCell.sheet,
    cell: p.sourceCell.ref,
    modified: p.currentValue !== p.originalValue,
  }));

  return c.json({ provenance });
});
