import type { Model, Snapshot } from '@xlent/core';
import type { ParsedWorkbook } from '@xlent/core';
import crypto from 'crypto';
import db from './db.js';

export interface Client {
  id: string;
  name: string;
  webhookUrl: string;
  apiKey: string;
  createdAt: string;
}

export interface DeliveryRecord {
  id: string;
  modelId: string;
  clientId: string;
  status: 'pending' | 'delivered' | 'failed';
  responseCode?: number;
  pushedAt: string;
  deliveredAt?: string;
  error?: string;
}

class ModelStore {
  private stmts = {
    // Upsert (not INSERT OR REPLACE) — REPLACE does DELETE+INSERT which fires ON DELETE CASCADE and wipes child rows
    insertModel: db.prepare(`INSERT INTO models (id, name, slug, semver, status, version, created_at, workbook_name, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name, slug=excluded.slug, semver=excluded.semver, status=excluded.status, version=excluded.version, workbook_name=excluded.workbook_name, data=excluded.data`),
    updateModelVersion: db.prepare(`UPDATE models SET name = ?, slug = ?, semver = ?, status = ?, version = ?, workbook_name = ?, data = ?
      WHERE id = ? AND version = ?`),
    getModel: db.prepare('SELECT data FROM models WHERE id = ?'),
    getBySlug: db.prepare('SELECT data FROM models WHERE slug = ?'),
    listModels: db.prepare('SELECT data FROM models ORDER BY created_at DESC'),
    deleteModel: db.prepare('DELETE FROM models WHERE id = ?'),
    slugExists: db.prepare('SELECT 1 FROM models WHERE slug = ? AND id != ?'),
    insertWorkbook: db.prepare('INSERT OR REPLACE INTO workbooks (model_id, data) VALUES (?, ?)'),
    getWorkbook: db.prepare('SELECT data FROM workbooks WHERE model_id = ?'),
    insertOriginal: db.prepare('INSERT OR REPLACE INTO originals (model_id, data) VALUES (?, ?)'),
    getOriginal: db.prepare('SELECT data FROM originals WHERE model_id = ?'),
  };

  setModel(model: Model): void {
    this.stmts.insertModel.run(model.id, model.name, model.slug, model.semver, model.status, model.version, model.createdAt, model.workbookName, JSON.stringify(model));
  }

  setModelIfVersion(model: Model, expectedVersion: number): boolean {
    const result = this.stmts.updateModelVersion.run(
      model.name,
      model.slug,
      model.semver,
      model.status,
      model.version,
      model.workbookName,
      JSON.stringify(model),
      model.id,
      expectedVersion,
    );
    return result.changes === 1;
  }

  getModel(id: string): Model | undefined {
    const row = this.stmts.getModel.get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }

  getBySlug(slug: string): Model | undefined {
    const row = this.stmts.getBySlug.get(slug) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }

  slugExists(slug: string, excludeId = ''): boolean {
    return !!this.stmts.slugExists.get(slug, excludeId);
  }

  listModels(): Model[] {
    const rows = this.stmts.listModels.all() as { data: string }[];
    return rows.map((r) => JSON.parse(r.data));
  }

  setWorkbook(modelId: string, workbook: ParsedWorkbook): void {
    this.stmts.insertWorkbook.run(modelId, JSON.stringify(workbook));
  }

  getWorkbook(modelId: string): ParsedWorkbook | undefined {
    const row = this.stmts.getWorkbook.get(modelId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }

  setOriginal(modelId: string, buffer: Buffer): void {
    this.stmts.insertOriginal.run(modelId, buffer);
  }

  getOriginal(modelId: string): Buffer | undefined {
    const row = this.stmts.getOriginal.get(modelId) as { data: Buffer } | undefined;
    return row?.data;
  }

  deleteModel(id: string): boolean {
    const result = this.stmts.deleteModel.run(id);
    return result.changes > 0;
  }
}

class ClientStore {
  private stmts = {
    insert: db.prepare('INSERT INTO clients (id, name, webhook_url, api_key, created_at) VALUES (?, ?, ?, ?, ?)'),
    list: db.prepare('SELECT * FROM clients ORDER BY created_at DESC'),
    get: db.prepare('SELECT * FROM clients WHERE id = ?'),
    delete: db.prepare('DELETE FROM clients WHERE id = ?'),
    insertDelivery: db.prepare('INSERT INTO deliveries (id, model_id, client_id, status, pushed_at) VALUES (?, ?, ?, ?, ?)'),
    updateDelivery: db.prepare('UPDATE deliveries SET status = ?, response_code = ?, delivered_at = ?, error = ? WHERE id = ?'),
    listDeliveries: db.prepare('SELECT * FROM deliveries WHERE model_id = ? ORDER BY pushed_at DESC LIMIT 50'),
    listClientDeliveries: db.prepare('SELECT * FROM deliveries WHERE client_id = ? ORDER BY pushed_at DESC LIMIT 50'),
  };

  createClient(name: string, webhookUrl: string): Client {
    const id = crypto.randomUUID();
    const apiKey = `xlk_${crypto.randomBytes(24).toString('base64url')}`;
    const createdAt = new Date().toISOString();
    this.stmts.insert.run(id, name, webhookUrl, apiKey, createdAt);
    return { id, name, webhookUrl, apiKey, createdAt };
  }

  listClients(): Client[] {
    const rows = this.stmts.list.all() as any[];
    return rows.map((r) => ({ id: r.id, name: r.name, webhookUrl: r.webhook_url, apiKey: r.api_key, createdAt: r.created_at }));
  }

  getClient(id: string): Client | undefined {
    const row = this.stmts.get.get(id) as any;
    if (!row) return undefined;
    return { id: row.id, name: row.name, webhookUrl: row.webhook_url, apiKey: row.api_key, createdAt: row.created_at };
  }

  deleteClient(id: string): boolean {
    return this.stmts.delete.run(id).changes > 0;
  }

  createDelivery(modelId: string, clientId: string): DeliveryRecord {
    const id = crypto.randomUUID();
    const pushedAt = new Date().toISOString();
    this.stmts.insertDelivery.run(id, modelId, clientId, 'pending', pushedAt);
    return { id, modelId, clientId, status: 'pending', pushedAt };
  }

  completeDelivery(id: string, responseCode: number): void {
    this.stmts.updateDelivery.run('delivered', responseCode, new Date().toISOString(), null, id);
  }

  failDelivery(id: string, error: string, responseCode?: number): void {
    this.stmts.updateDelivery.run('failed', responseCode ?? null, null, error, id);
  }

  listDeliveries(modelId: string): DeliveryRecord[] {
    return this.stmts.listDeliveries.all(modelId) as DeliveryRecord[];
  }
}

class SnapshotStore {
  private stmts = {
    insert: db.prepare('INSERT INTO snapshots (id, model_id, semver, message, checksum, created_at, data) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    list: db.prepare('SELECT id, model_id, semver, message, checksum, created_at FROM snapshots WHERE model_id = ? ORDER BY created_at DESC'),
    get: db.prepare('SELECT * FROM snapshots WHERE id = ?'),
    getByVersion: db.prepare('SELECT * FROM snapshots WHERE model_id = ? AND semver = ?'),
    latest: db.prepare('SELECT * FROM snapshots WHERE model_id = ? ORDER BY created_at DESC LIMIT 1'),
  };

  create(snapshot: Snapshot): void {
    this.stmts.insert.run(snapshot.id, snapshot.modelId, snapshot.semver, snapshot.message ?? null, snapshot.checksum, snapshot.createdAt, JSON.stringify(snapshot.data));
  }

  list(modelId: string): Omit<Snapshot, 'data'>[] {
    return (this.stmts.list.all(modelId) as any[]).map((r) => ({
      id: r.id,
      modelId: r.model_id,
      semver: r.semver,
      message: r.message,
      checksum: r.checksum,
      createdAt: r.created_at,
    })) as any;
  }

  get(id: string): Snapshot | undefined {
    const row = this.stmts.get.get(id) as any;
    if (!row) return undefined;
    return { id: row.id, modelId: row.model_id, semver: row.semver, message: row.message, checksum: row.checksum, createdAt: row.created_at, data: JSON.parse(row.data) };
  }

  getByVersion(modelId: string, semver: string): Snapshot | undefined {
    const row = this.stmts.getByVersion.get(modelId, semver) as any;
    if (!row) return undefined;
    return { id: row.id, modelId: row.model_id, semver: row.semver, message: row.message, checksum: row.checksum, createdAt: row.created_at, data: JSON.parse(row.data) };
  }

  latest(modelId: string): Snapshot | undefined {
    const row = this.stmts.latest.get(modelId) as any;
    if (!row) return undefined;
    return { id: row.id, modelId: row.model_id, semver: row.semver, message: row.message, checksum: row.checksum, createdAt: row.created_at, data: JSON.parse(row.data) };
  }
}

class TestStore {
  private stmts = {
    insert: db.prepare('INSERT INTO model_tests (id, model_id, name, category, assertion, description, auto_generated, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    list: db.prepare('SELECT * FROM model_tests WHERE model_id = ? ORDER BY created_at ASC'),
    get: db.prepare('SELECT * FROM model_tests WHERE id = ?'),
    delete: db.prepare('DELETE FROM model_tests WHERE id = ?'),
    deleteByModel: db.prepare('DELETE FROM model_tests WHERE model_id = ?'),
  };

  addTest(modelId: string, test: { id: string; name: string; category: string; assertion: object; description?: string; autoGenerated: boolean }): void {
    this.stmts.insert.run(test.id, modelId, test.name, test.category, JSON.stringify(test.assertion), test.description ?? null, test.autoGenerated ? 1 : 0, new Date().toISOString());
  }

  listTests(modelId: string): any[] {
    return (this.stmts.list.all(modelId) as any[]).map((r) => ({
      id: r.id,
      modelId: r.model_id,
      name: r.name,
      category: r.category,
      assertion: JSON.parse(r.assertion),
      description: r.description,
      autoGenerated: r.auto_generated === 1,
    }));
  }

  deleteTest(id: string): boolean {
    return this.stmts.delete.run(id).changes > 0;
  }

  deleteByModel(modelId: string): number {
    return this.stmts.deleteByModel.run(modelId).changes;
  }
}

class EvidenceStore {
  private stmts = {
    insert: db.prepare('INSERT INTO evidence (id, model_id, model_version, executed_at, data) VALUES (?, ?, ?, ?, ?)'),
    list: db.prepare('SELECT data FROM evidence WHERE model_id = ? ORDER BY executed_at DESC LIMIT ?'),
    get: db.prepare('SELECT data FROM evidence WHERE id = ?'),
  };

  store(record: import('@xlent/core').EvidenceRecord): void {
    this.stmts.insert.run(record.id, record.modelId, record.modelVersion, record.executedAt, JSON.stringify(record));
  }

  list(modelId: string, limit = 20): import('@xlent/core').EvidenceRecord[] {
    const rows = this.stmts.list.all(modelId, limit) as { data: string }[];
    return rows.map((r) => JSON.parse(r.data));
  }

  get(id: string): import('@xlent/core').EvidenceRecord | undefined {
    const row = this.stmts.get.get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
  }
}

export const store = new ModelStore();
export const clientStore = new ClientStore();
export const snapshotStore = new SnapshotStore();
export const testStore = new TestStore();
export const evidenceStore = new EvidenceStore();
