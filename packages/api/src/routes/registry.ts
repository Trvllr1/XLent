import { Hono } from 'hono';
import { store, snapshotStore, testStore, evidenceStore } from '../store.js';
import type { Model } from '@xlent/core';

export const registryRouter = new Hono();

interface RegistryEntry {
  id: string;
  slug: string;
  name: string;
  semver: string;
  status: string;
  owner?: string;
  tags?: string[];
  createdAt: string;
  testPassRate?: number;
  snapshotCount: number;
}

/** GET /registry — List all models as registry entries */
registryRouter.get('/', (c) => {
  const models = store.listModels();
  const statusFilter = c.req.query('status');
  const ownerFilter = c.req.query('owner');
  const tagFilter = c.req.query('tag');

  let filtered = models;
  if (statusFilter) filtered = filtered.filter((m) => m.status === statusFilter);
  if (ownerFilter) filtered = filtered.filter((m) => (m as any).owner === ownerFilter);
  if (tagFilter) filtered = filtered.filter((m) => ((m as any).tags || []).includes(tagFilter));

  const entries: RegistryEntry[] = filtered.map((m) => {
    const snapshots = snapshotStore.list(m.id);
    const latestEvidence = evidenceStore.list(m.id, 1);
    let testPassRate: number | undefined;
    if (latestEvidence.length > 0) {
      const ev = latestEvidence[0];
      const total = ev.tests.length;
      const passed = ev.tests.filter((t) => t.status === 'pass' || t.status === 'skip').length;
      testPassRate = total > 0 ? Math.round((passed / total) * 100) : undefined;
    }

    return {
      id: m.id,
      slug: m.slug,
      name: m.name,
      semver: m.semver,
      status: m.status,
      owner: (m as any).owner,
      tags: (m as any).tags,
      createdAt: m.createdAt,
      testPassRate,
      snapshotCount: snapshots.length,
    };
  });

  return c.json({ entries, count: entries.length });
});

/** GET /registry/:slug — Get registry entry + version history */
registryRouter.get('/:slug', (c) => {
  const slug = c.req.param('slug');
  const model = store.getBySlug(slug);
  if (!model) return c.json({ error: 'Model not found' }, 404);

  const snapshots = snapshotStore.list(model.id);
  const tests = testStore.listTests(model.id);
  const latestEvidence = evidenceStore.list(model.id, 1);

  let testPassRate: number | undefined;
  if (latestEvidence.length > 0) {
    const ev = latestEvidence[0];
    const total = ev.tests.length;
    const passed = ev.tests.filter((t) => t.status === 'pass' || t.status === 'skip').length;
    testPassRate = total > 0 ? Math.round((passed / total) * 100) : undefined;
  }

  return c.json({
    id: model.id,
    slug: model.slug,
    name: model.name,
    semver: model.semver,
    status: model.status,
    createdAt: model.createdAt,
    testCount: tests.length,
    testPassRate,
    versions: snapshots.map((s) => ({ semver: s.semver, createdAt: s.createdAt, message: s.message })),
  });
});
