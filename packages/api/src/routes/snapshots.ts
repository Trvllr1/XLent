import { Hono } from 'hono';
import crypto from 'crypto';
import type { Snapshot } from '@xlent/core';
import { store, snapshotStore } from '../store.js';

export const snapshotsRouter = new Hono();

/** GET /snapshots/:modelId — List snapshots for a model */
snapshotsRouter.get('/:modelId', (c) => {
  const modelId = c.req.param('modelId');
  const model = store.getModel(modelId);
  if (!model) return c.json({ error: 'Model not found' }, 404);

  const snapshots = snapshotStore.list(modelId);
  return c.json({ modelId, snapshots, count: snapshots.length });
});

/** POST /snapshots/:modelId — Create explicit snapshot */
snapshotsRouter.post('/:modelId', async (c) => {
  const modelId = c.req.param('modelId');
  const model = store.getModel(modelId);
  if (!model) return c.json({ error: 'Model not found' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const message = typeof body.message === 'string' ? body.message.slice(0, 500) : undefined;

  const original = store.getOriginal(modelId);
  const checksum = original
    ? crypto.createHash('sha256').update(original).digest('hex')
    : crypto.createHash('sha256').update(JSON.stringify(model)).digest('hex');

  const snapshot: Snapshot = {
    id: crypto.randomUUID(),
    modelId,
    semver: model.semver,
    message,
    checksum,
    createdAt: new Date().toISOString(),
    data: model,
  };
  snapshotStore.create(snapshot);

  return c.json({ id: snapshot.id, semver: snapshot.semver, checksum: snapshot.checksum, createdAt: snapshot.createdAt }, 201);
});

/** GET /snapshots/:modelId/:snapshotId — Get full snapshot */
snapshotsRouter.get('/:modelId/:snapshotId', (c) => {
  const { modelId, snapshotId } = c.req.param();
  const model = store.getModel(modelId);
  if (!model) return c.json({ error: 'Model not found' }, 404);

  const snapshot = snapshotStore.get(snapshotId);
  if (!snapshot || snapshot.modelId !== modelId) return c.json({ error: 'Snapshot not found' }, 404);
  return c.json(snapshot);
});

/** GET /snapshots/:modelId/version/:semver — Get snapshot by semver */
snapshotsRouter.get('/:modelId/version/:semver', (c) => {
  const { modelId, semver } = c.req.param();
  const model = store.getModel(modelId);
  if (!model) return c.json({ error: 'Model not found' }, 404);

  const snapshot = snapshotStore.getByVersion(modelId, semver);
  if (!snapshot) return c.json({ error: `Snapshot for version ${semver} not found` }, 404);
  return c.json(snapshot);
});
