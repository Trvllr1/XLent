import { Hono } from 'hono';
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
import type { Model, Parameter, Output, ScenarioOverride } from '@xlent/core';
import { store } from '../store.js';

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

  const parameters: Parameter[] = [];
  const outputs: Output[] = [];

  for (const sheet of workbook.sheets) {
    for (const cell of sheet.cells) {
      const cellId = `${cell.address.sheet}!${cell.address.ref}`;

      if (!cell.formula && cell.type === 'number' && rootNodes.includes(cellId)) {
        parameters.push({
          id: crypto.randomUUID(),
          name: cellId,
          type: cell.type,
          currentValue: cell.value,
          originalValue: cell.value,
          sourceCell: cell.address,
          source: 'CUSTOMER_MODEL',
          confidence: 'MEDIUM',
          confirmed: false,
        });
      }

      if (cell.formula && terminalNodes.includes(cellId)) {
        outputs.push({
          id: crypto.randomUUID(),
          name: cellId,
          value: cell.value,
          sourceCell: cell.address,
          dependsOn: [],
          confidence: 'MEDIUM',
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

  const body = await c.req.json<{ overrides?: ScenarioOverride[] }>().catch(() => ({ overrides: undefined }));
  const runtime = new ModelRuntime(model, workbook);
  const results = runtime.run(body.overrides);

  return c.json({ results });
});

/** POST /models/:id/scenarios — Create a named scenario */
modelsRouter.post('/:id/scenarios', async (c) => {
  const model = store.getModel(c.req.param('id'));
  const workbook = store.getWorkbook(c.req.param('id'));
  if (!model || !workbook) return c.json({ error: 'Model not found' }, 404);

  const body = await c.req.json<{ name: string; overrides: ScenarioOverride[] }>();
  if (!body.name || !body.overrides) {
    return c.json({ error: 'name and overrides required' }, 400);
  }

  const scenario = runScenario(model, workbook, body.name, body.overrides);
  return c.json({ scenario }, 201);
});

/** POST /models/:id/compare — Compare baseline vs scenario */
modelsRouter.post('/:id/compare', async (c) => {
  const model = store.getModel(c.req.param('id'));
  const workbook = store.getWorkbook(c.req.param('id'));
  if (!model || !workbook) return c.json({ error: 'Model not found' }, 404);

  const body = await c.req.json<{
    baselineOverrides?: ScenarioOverride[];
    scenarioOverrides: ScenarioOverride[];
    scenarioId?: string;
  }>();

  const comparison = compareScenarios(
    model,
    workbook,
    body.baselineOverrides || null,
    body.scenarioOverrides,
    body.scenarioId || 'ad-hoc',
  );

  return c.json({ comparison });
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
