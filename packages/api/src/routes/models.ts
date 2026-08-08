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
  checkBugfixRegression,
  compileNativeModel,
  getNativeTemplate,
  listNativeTemplates,
  writeWorkbookXlsx,
  assuranceRank,
  ASSURANCE_ORDER,
} from '@xlent/core';
import type { Model, ModelStatus, ModelTestDefinition, NativeModelDefinition, Parameter, Output, ScenarioOverride, Deliverable, Snapshot, EvidenceRecord, AssuranceLevel } from '@xlent/core';
import { store, clientStore, snapshotStore, testStore, evidenceStore } from '../store.js';
import { runModelSchema, createScenarioSchema, compareSchema, createNativeModelSchema, deliverablePushSchema, deliverToClientSchema, statusTransitionSchema, metadataSchema } from '../schemas.js';

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

/** GET /models/native/templates — List governed native starter packages. */
modelsRouter.get('/native/templates', (c) => {
  const templates = listNativeTemplates().map(({ definition, ...template }) => ({
    ...template,
    componentCounts: {
      inputs: definition.inputs.length,
      formulas: definition.formulas.length,
      outputs: definition.outputs.length,
      tests: definition.tests.length,
    },
  }));
  return c.json({ templates });
});

/** POST /models/native — Create a source-free model from a template or semantic definition. */
modelsRouter.post('/native', async (c) => {
  const raw = await c.req.json().catch(() => null);
  const parsed = createNativeModelSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'Invalid native model', details: parsed.error.flatten() }, 400);

  let definition: NativeModelDefinition;
  if (parsed.data.templateId) {
    const template = getNativeTemplate(parsed.data.templateId);
    if (!template) return c.json({ error: 'Native template not found' }, 404);
    definition = template.definition;
  } else {
    definition = parsed.data.definition as NativeModelDefinition;
  }
  if (parsed.data.name) definition = { ...definition, name: parsed.data.name, slug: undefined };

  const baseSlug = generateSlug(definition.slug ?? definition.name) || 'native-model';
  let slug = baseSlug;
  let suffix = 1;
  while (store.slugExists(slug)) slug = `${baseSlug}-${++suffix}`;

  let compiled;
  try {
    compiled = compileNativeModel(definition, { slug });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : 'Native model compilation failed' }, 400);
  }

  store.setModel(compiled.model);
  store.setWorkbook(compiled.model.id, compiled.workbook);
  for (const test of compiled.tests) {
    testStore.addTest(compiled.model.id, test);
  }

  const checksum = crypto.createHash('sha256').update(JSON.stringify(definition)).digest('hex');
  const snapshot: Snapshot = {
    id: crypto.randomUUID(),
    modelId: compiled.model.id,
    semver: compiled.model.semver,
    message: 'Initial native model',
    checksum,
    createdAt: compiled.model.createdAt,
    data: compiled.model,
  };
  snapshotStore.create(snapshot);

  const parameterIds = new Map(compiled.model.parameters.map((parameter) => [parameter.semanticKey, parameter.id]));
  const scenarios = compiled.scenarios.map((scenario) => ({
    name: scenario.name,
    overrides: Object.entries(scenario.overrides).map(([semanticKey, value]) => ({
      parameterId: parameterIds.get(semanticKey),
      semanticKey,
      value,
    })),
  }));

  return c.json({ model: compiled.model, tests: compiled.tests, scenarios, snapshot: { id: snapshot.id, checksum } }, 201);
});

/** POST /models/:id/analyze — Re-run discovery and refresh labels */
modelsRouter.post('/:id/analyze', (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);

  if (model.sourceKind === 'native') {
    return c.json({ model, discovery: model.discovery });
  }

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
  const reason = typeof body['reason'] === 'string' ? body['reason'] : undefined;
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

  // E10.3 — Model CI gate: run the full test suite against the new version,
  // then adjust assurance by change magnitude (patch preserves, major resets).
  const priorAssurance: AssuranceLevel = existingModel.assuranceLevel ?? 'UNASSESSED';
  const tests = testStore.listTests(updatedModel.id);
  let ciResult: { ran: boolean; allPass: boolean; failures: number; assuranceFrom: string; assuranceTo: string } | null = null;
  if (tests.length > 0) {
    const defs = tests.map((t: any) => ({ id: t.id, modelId: t.modelId, name: t.name, category: t.category, assertion: t.assertion, description: t.description, autoGenerated: t.autoGenerated }));
    const results = runModelTests(updatedModel, workbook, defs);
    const failures = results.filter((r) => r.status === 'fail' || r.status === 'error').length;
    const allPass = failures === 0;

    let assuranceTo: AssuranceLevel;
    if (!allPass) {
      assuranceTo = 'UNASSESSED'; // critical failure — reset
    } else if (diff.suggestedBump === 'patch') {
      assuranceTo = priorAssurance; // cosmetic change — preserve
    } else {
      assuranceTo = 'TESTED'; // real change — requires re-verification
    }
    updatedModel.assuranceLevel = assuranceTo;
    (updatedModel as any).lastCI = { ran: true, allPass, failures, assuranceFrom: priorAssurance, assuranceTo, at: new Date().toISOString(), bump: diff.suggestedBump };
    store.setModel(updatedModel);
    ciResult = { ran: true, allPass, failures, assuranceFrom: priorAssurance, assuranceTo };
  }

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

  // E10.2 — advisory bugfix regression: a bugfix re-import should add a test
  // guarding the changed cells (Rule 7). Surfaces a warning finding if absent.
  let regressionAdvisory: string | null = null;
  if (reason === 'bugfix') {
    const defs = tests.map((t: any) => ({ id: t.id, modelId: t.modelId, name: t.name, category: t.category, assertion: t.assertion, description: t.description, autoGenerated: t.autoGenerated }));
    const advisory = checkBugfixRegression(diff, existingModel.semver, defs);
    if (advisory) regressionAdvisory = advisory.explanation;
  }

  return c.json({ model: updatedModel, diff, ci: ciResult, regressionAdvisory, snapshot: { id: snapshot.id, semver: newSemver, checksum } }, 200);
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

/** GET /models/:id/export.xlsx — Generate a derivative Excel representation. */
modelsRouter.get('/:id/export.xlsx', (c) => {
  const model = store.getModel(c.req.param('id'));
  const workbook = store.getWorkbook(c.req.param('id'));
  if (!model || !workbook) return c.json({ error: 'Model not found' }, 404);

  const evidenceIds = evidenceStore.list(model.id, 10).map((record) => record.id);
  const exported = writeWorkbookXlsx(workbook, { model, evidenceIds });
  const filename = `${model.slug}-v${model.semver}.xlsx`.replace(/[^a-zA-Z0-9._-]/g, '-');
  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  c.header('Content-Disposition', `attachment; filename="${filename}"`);
  c.header('X-XLent-Export-Report', encodeURIComponent(JSON.stringify(exported.report)));
  return c.body(new Uint8Array(exported.buffer));
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
    const minimumAssurance = (process.env.XLENT_PUBLISH_MIN_ASSURANCE ?? 'VERIFIED') as AssuranceLevel;
    if (!ASSURANCE_ORDER.includes(minimumAssurance)) {
      return c.json({ error: `Invalid XLENT_PUBLISH_MIN_ASSURANCE: ${minimumAssurance}` }, 500);
    }
    const currentAssurance = model.assuranceLevel ?? 'UNASSESSED';
    if (assuranceRank(currentAssurance) < assuranceRank(minimumAssurance)) {
      return c.json({
        error: 'Cannot publish: assurance policy not satisfied',
        currentAssurance,
        requiredAssurance: minimumAssurance,
      }, 409);
    }

    const workbook = store.getWorkbook(model.id);
    if (!workbook) return c.json({ error: 'Workbook not found' }, 500);
    const tests = testStore.listTests(model.id);
    if (tests.length === 0) return c.json({ error: 'Cannot publish: no tests defined' }, 409);
    const results = runModelTests(model, workbook, tests.map((test: any) => ({
      id: test.id,
      modelId: test.modelId,
      name: test.name,
      category: test.category,
      assertion: test.assertion,
      autoGenerated: test.autoGenerated,
    })));
    const failures = results.filter((result) => result.status === 'fail' || result.status === 'error');
    if (failures.length > 0) {
      return c.json({ error: 'Cannot publish: tests failing', failures }, 409);
    }

    const checksum = crypto.createHash('sha256').update(JSON.stringify({ model, workbook })).digest('hex');
    const publishedOutputs = new ModelRuntime(model, workbook).run();

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
    const evidenceRecord: EvidenceRecord = {
      id: crypto.randomUUID(),
      modelId: model.id,
      modelVersion: model.version,
      executedAt: new Date().toISOString(),
      inputs: Object.fromEntries(model.parameters.map((parameter) => [parameter.id, parameter.currentValue])),
      overrides: [],
      outputs: publishedOutputs,
      tests: results,
      allTestsPass: true,
      checksum,
      reproducible: true,
      purpose: 'publish_gate',
    };
    evidenceStore.store(evidenceRecord);
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

/** PATCH /models/:id — Update model metadata (name, owner, tags) */
modelsRouter.patch('/:id', async (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);

  const raw = await c.req.json().catch(() => ({}));
  const parsed = metadataSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'Invalid request', details: parsed.error.flatten() }, 400);

  const d = parsed.data;
  if (d.name !== undefined) model.name = d.name;
  if (d.owner !== undefined) model.owner = d.owner;
  if (d.tags !== undefined) model.tags = d.tags;

  store.setModel(model);
  return c.json({ model });
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
