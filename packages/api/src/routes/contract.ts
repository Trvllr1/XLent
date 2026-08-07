import { Hono } from 'hono';
import { z } from 'zod';
import { reconcileContract } from '@xlent/core';
import { store } from '../store.js';

export const contractRouter = new Hono();

const contractSchema = z.object({
  purpose: z.string().min(1),
  declaredInputs: z.array(z.object({
    name: z.string().min(1),
    unit: z.string().optional(),
    description: z.string().optional(),
    bounds: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  })).default([]),
  declaredOutputs: z.array(z.object({
    name: z.string().min(1),
    unit: z.string().optional(),
    meaning: z.string().optional(),
    expectation: z.string().optional(),
  })).default([]),
  invariants: z.array(z.object({
    id: z.string().min(1),
    expression: z.string().min(1),
    description: z.string().optional(),
  })).default([]),
  rules: z.array(z.object({
    id: z.string().min(1),
    expression: z.string().min(1),
    description: z.string().optional(),
    severity: z.enum(['critical', 'warning', 'info']).optional(),
    scope: z.string().optional(),
  })).default([]),
  behaviors: z.array(z.object({
    id: z.string().min(1),
    statement: z.string().min(1),
    description: z.string().optional(),
  })).optional(),
  version: z.string().default('1.0.0'),
});

/** GET /contract/:modelId — Get the model's contract */
contractRouter.get('/:modelId', (c) => {
  const model = store.getModel(c.req.param('modelId'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  return c.json({ contract: model.contract ?? null });
});

/** PUT /contract/:modelId — Set/replace the model's contract */
contractRouter.put('/:modelId', async (c) => {
  const model = store.getModel(c.req.param('modelId'));
  if (!model) return c.json({ error: 'Model not found' }, 404);

  const raw = await c.req.json().catch(() => null);
  if (!raw) return c.json({ error: 'JSON body required' }, 400);
  const parsed = contractSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'Invalid contract', details: parsed.error.flatten() }, 400);

  model.contract = parsed.data as any;
  store.setModel(model);

  const findings = reconcileContract(model, model.contract as any);
  return c.json({ contract: model.contract, intentFindings: findings, count: findings.length });
});

/** DELETE /contract/:modelId — Remove the contract */
contractRouter.delete('/:modelId', (c) => {
  const model = store.getModel(c.req.param('modelId'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  delete model.contract;
  store.setModel(model);
  return c.json({ deleted: true });
});

/** GET /contract/:modelId/reconcile — Reconcile contract vs discovered structure */
contractRouter.get('/:modelId/reconcile', (c) => {
  const model = store.getModel(c.req.param('modelId'));
  if (!model) return c.json({ error: 'Model not found' }, 404);
  if (!model.contract) return c.json({ error: 'No contract defined' }, 404);
  const findings = reconcileContract(model, model.contract as any);
  return c.json({ modelId: model.id, findings, count: findings.length });
});
