import type { Model } from '@xlent/core';
import type { ParsedWorkbook } from '@xlent/core';
import db from './db.js';

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

export const store = new ModelStore();
