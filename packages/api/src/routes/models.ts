import { Hono } from 'hono';
import crypto from 'crypto';
import {
  parseWorkbook,
  discoverModel,
  buildGraph,
  findRootNodes,
  findTerminalNodes,
  ModelRuntime,
  runScenario,
  compareScenarios,
} from '@xlent/core';
import type { Model, Parameter, Output, ScenarioOverride, Deliverable } from '@xlent/core';
import { store, clientStore } from '../store.js';
import { runModelSchema, createScenarioSchema, compareSchema, deliverablePushSchema, deliverToClientSchema } from '../schemas.js';

export const modelsRouter = new Hono();

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

  // Build a lookup for resolving human-readable labels from adjacent cells
  const cellLabelMap = new Map<string, string>();
  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      if (cell.type === 'string' && typeof cell.value === 'string') {
        cellLabelMap.set(`${cell.address.sheet}!${cell.address.ref}`, cell.value);
      }
    }
  }

  function resolveLabel(sheet: string, ref: string): string | null {
    // Try cell to the left (same row, previous column)
    const col = ref.replace(/\d+/g, '');
    const row = ref.replace(/[A-Z]+/g, '');
    if (col > 'A') {
      const prevCol = String.fromCharCode(col.charCodeAt(0) - 1);
      const leftLabel = cellLabelMap.get(`${sheet}!${prevCol}${row}`);
      if (leftLabel) return leftLabel;
    }
    // Try cell above (same column, previous row)
    const rowNum = parseInt(row);
    if (rowNum > 1) {
      const aboveLabel = cellLabelMap.get(`${sheet}!${col}${rowNum - 1}`);
      if (aboveLabel) return aboveLabel;
    }
    return null;
  }

  const parameters: Parameter[] = [];
  const outputs: Output[] = [];

  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      const cellId = `${cell.address.sheet}!${cell.address.ref}`;

      if (!cell.formula && cell.type === 'number' && rootNodes.includes(cellId)) {
        const label = resolveLabel(cell.address.sheet, cell.address.ref);
        parameters.push({
          id: crypto.randomUUID(),
          name: label || cellId,
          type: cell.type,
          currentValue: cell.value,
          originalValue: cell.value,
          sourceCell: cell.address,
          source: 'CLIENT_MODEL',
          confidence: label ? 'HIGH' : 'MEDIUM',
          confirmed: false,
        });
      }

      if (cell.formula && terminalNodes.includes(cellId)) {
        const label = resolveLabel(cell.address.sheet, cell.address.ref);
        outputs.push({
          id: crypto.randomUUID(),
          name: label || cellId,
          value: cell.value,
          sourceCell: cell.address,
          dependsOn: [],
          confidence: label ? 'HIGH' : 'MEDIUM',
          confirmed: false,
        });
      }
    }
  }

  const model: Model = {
    id: crypto.randomUUID(),
    name: filename.replace(/\.[^.]+$/, ''),
    version: 1,
    createdAt: new Date().toISOString(),
    workbookName: filename,
    parameters,
    calculations: [],
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

  return c.json({ model, discovery }, 201);
});

/** POST /models/:id/analyze — Re-run discovery */
modelsRouter.post('/:id/analyze', (c) => {
  const model = store.getModel(c.req.param('id'));
  const workbook = store.getWorkbook(c.req.param('id'));
  if (!model || !workbook) return c.json({ error: 'Model not found' }, 404);

  const discovery = discoverModel(workbook);
  return c.json({ discovery });
});

/** GET /models — List all models */
modelsRouter.get('/', (c) => {
  return c.json({ models: store.listModels() });
});

/** GET /models/:id — Get model details */
modelsRouter.get('/:id', (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  return c.json({ model });
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

/** DELETE /models/:id — Remove a model */
modelsRouter.delete('/:id', (c) => {
  const deleted = store.deleteModel(c.req.param('id'));
  if (!deleted) return c.json({ error: 'Model not found' }, 404);
  return c.json({ deleted: true });
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
