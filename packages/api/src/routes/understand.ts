import { Hono } from 'hono';
import { buildGraph, understandModel } from '@xlent/core';
import { store } from '../store.js';

export const understandRouter = new Hono();

/** GET /understand/:modelId — Produce a structured "understand" report */
understandRouter.get('/:modelId', (c) => {
  const modelId = c.req.param('modelId');
  const model = store.getModel(modelId);
  if (!model) return c.json({ error: 'Model not found' }, 404);
  const workbook = store.getWorkbook(modelId);
  if (!workbook) return c.json({ error: 'Workbook not found' }, 500);

  const graph = buildGraph(workbook);
  const understanding = understandModel(workbook, graph);
  return c.json(understanding);
});
