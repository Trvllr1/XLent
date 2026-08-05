import { Hono } from 'hono';
import { runSensitivity } from '@xlent/core';
import { store } from '../store.js';

export const sensitivityRouter = new Hono();

/** POST /sensitivity/:modelId — Run sensitivity analysis */
sensitivityRouter.post('/:modelId', async (c) => {
  const modelId = c.req.param('modelId');
  const model = store.getModel(modelId);
  if (!model) return c.json({ error: 'Model not found' }, 404);
  const workbook = store.getWorkbook(modelId);
  if (!workbook) return c.json({ error: 'Workbook not found' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const config = {
    parameterIds: Array.isArray(body.parameterIds) ? body.parameterIds : undefined,
    outputIds: Array.isArray(body.outputIds) ? body.outputIds : undefined,
    range: Array.isArray(body.range) ? body.range.map(Number) : undefined,
  };

  const result = runSensitivity(model, workbook, config);
  return c.json(result);
});
