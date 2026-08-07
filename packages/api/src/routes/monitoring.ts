import { Hono } from 'hono';
import { store } from '../store.js';
import { executionStats, listExecutions } from '../monitoring.js';

/** E11.3 — Execution monitoring endpoints. */
export const monitoringRouter = new Hono();

/** GET /models/:id/monitoring/stats — aggregate stats + anomaly flags */
monitoringRouter.get('/:id/monitoring/stats', (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  return c.json(executionStats(model.id));
});

/** GET /models/:id/monitoring/executions — recent execution history */
monitoringRouter.get('/:id/monitoring/executions', (c) => {
  const model = store.getModel(c.req.param('id'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  const limit = Math.min(200, parseInt(c.req.query('limit') ?? '50', 10) || 50);
  return c.json({ executions: listExecutions(model.id, limit) });
});
