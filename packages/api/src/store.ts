import type { Model } from '@xlent/core';
import type { ParsedWorkbook } from '@xlent/core';

/** In-memory store for MVP. Replace with PostgreSQL in production. */
class ModelStore {
  private models = new Map<string, Model>();
  private workbooks = new Map<string, ParsedWorkbook>();
  private originals = new Map<string, Buffer>();

  setModel(model: Model): void {
    this.models.set(model.id, model);
  }

  getModel(id: string): Model | undefined {
    return this.models.get(id);
  }

  listModels(): Model[] {
    return Array.from(this.models.values());
  }

  setWorkbook(modelId: string, workbook: ParsedWorkbook): void {
    this.workbooks.set(modelId, workbook);
  }

  getWorkbook(modelId: string): ParsedWorkbook | undefined {
    return this.workbooks.get(modelId);
  }

  setOriginal(modelId: string, buffer: Buffer): void {
    this.originals.set(modelId, buffer);
  }

  getOriginal(modelId: string): Buffer | undefined {
    return this.originals.get(modelId);
  }

  deleteModel(id: string): boolean {
    this.workbooks.delete(id);
    this.originals.delete(id);
    return this.models.delete(id);
  }
}

export const store = new ModelStore();
