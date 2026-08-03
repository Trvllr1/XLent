import type { Model } from '@xlent/core';
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
    insertModel: db.prepare('INSERT OR REPLACE INTO models (id, name, version, created_at, workbook_name, data) VALUES (?, ?, ?, ?, ?, ?)'),
    getModel: db.prepare('SELECT data FROM models WHERE id = ?'),
    listModels: db.prepare('SELECT data FROM models ORDER BY created_at DESC'),
    deleteModel: db.prepare('DELETE FROM models WHERE id = ?'),
    insertWorkbook: db.prepare('INSERT OR REPLACE INTO workbooks (model_id, data) VALUES (?, ?)'),
    getWorkbook: db.prepare('SELECT data FROM workbooks WHERE model_id = ?'),
    insertOriginal: db.prepare('INSERT OR REPLACE INTO originals (model_id, data) VALUES (?, ?)'),
    getOriginal: db.prepare('SELECT data FROM originals WHERE model_id = ?'),
  };

  setModel(model: Model): void {
    this.stmts.insertModel.run(model.id, model.name, model.version, model.createdAt, model.workbookName, JSON.stringify(model));
  }

  getModel(id: string): Model | undefined {
    const row = this.stmts.getModel.get(id) as { data: string } | undefined;
    return row ? JSON.parse(row.data) : undefined;
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

export const store = new ModelStore();
export const clientStore = new ClientStore();
