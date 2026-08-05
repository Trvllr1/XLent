import { Hono } from 'hono';
import { diffModels } from '@xlent/core';
import { store, snapshotStore } from '../store.js';

export const diffRouter = new Hono();

/** GET /diff/:modelId?from=1.0.0&to=1.1.0 — Diff two versions */
diffRouter.get('/:modelId', (c) => {
  const modelId = c.req.param('modelId');
  const model = store.getModel(modelId);
  if (!model) return c.json({ error: 'Model not found' }, 404);

  const fromVersion = c.req.query('from');
  const toVersion = c.req.query('to');

  if (!fromVersion || !toVersion) {
    return c.json({ error: 'Both "from" and "to" query params required (semver)' }, 400);
  }

  const fromSnapshot = snapshotStore.getByVersion(modelId, fromVersion);
  if (!fromSnapshot) return c.json({ error: `Snapshot for version ${fromVersion} not found` }, 404);

  const toSnapshot = snapshotStore.getByVersion(modelId, toVersion);
  if (!toSnapshot) return c.json({ error: `Snapshot for version ${toVersion} not found` }, 404);

  const diff = diffModels(fromSnapshot.data, toSnapshot.data);
  return c.json(diff);
});
