import { previewMutation } from '@xlent/core';
import type { MutationRequest } from '@xlent/core';
import { Hono } from 'hono';
import { mutationPreviewSchema } from '../schemas.js';
import { store } from '../store.js';

export const mutationsRouter = new Hono();

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

  const preview = previewMutation(model, workbook, parsed.data as MutationRequest);
  return c.json(preview, preview.valid ? 200 : 422);
});