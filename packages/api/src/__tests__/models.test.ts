import { describe, it, expect, beforeAll } from 'vitest';
import * as XLSX from 'xlsx';

// Use in-memory SQLite for tests
process.env.XLENT_DB_PATH = ':memory:';
process.env.NODE_ENV = 'test';

// Dynamic import after env is set so db.ts picks up the path
const { app } = await import('../server.js');

function makeWorkbookBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Price', 100],
    ['Quantity', 50],
    ['Total', { t: 'n', f: 'B1*B2' }],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

function buildFormData(buffer: Buffer, filename: string): FormData {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
  return form;
}

describe('Models API', () => {
  let modelId: string;

  it('POST /models/import — uploads and parses a workbook', async () => {
    const form = buildFormData(makeWorkbookBuffer(), 'cost-model.xlsx');
    const res = await app.request('/models/import', { method: 'POST', body: form });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.model).toBeDefined();
    expect(data.model.id).toBeTruthy();
    expect(data.discovery).toBeDefined();
    expect(data.model.parameters.length).toBeGreaterThan(0);
    expect(data.model.outputs.length).toBeGreaterThan(0);
    modelId = data.model.id;
  });

  it('GET /models — lists imported models', async () => {
    const res = await app.request('/models');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.models.length).toBeGreaterThanOrEqual(1);
    expect(data.models.some((m: any) => m.id === modelId)).toBe(true);
  });

  it('GET /models/:id — returns model details', async () => {
    const res = await app.request(`/models/${modelId}`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.model.id).toBe(modelId);
    expect(data.model.name).toBe('cost-model');
  });

  it('POST /models/:id/run — executes the model', async () => {
    const res = await app.request(`/models/${modelId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.results).toBeDefined();
    // 100 * 50 = 5000
    const outputValues = Object.values(data.results);
    expect(outputValues).toContain(5000);
  });

  it('POST /models/:id/run — respects overrides', async () => {
    // First get the parameter ID for Price
    const modelRes = await app.request(`/models/${modelId}`);
    const model = (await modelRes.json()).model;
    const priceParam = model.parameters.find((p: any) => p.name === 'Price');

    const res = await app.request(`/models/${modelId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides: [{ parameterId: priceParam.id, value: 200 }] }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    // 200 * 50 = 10000
    const outputValues = Object.values(data.results);
    expect(outputValues).toContain(10000);
  });

  it('POST /models/:id/compare — returns baseline vs scenario deltas', async () => {
    const modelRes = await app.request(`/models/${modelId}`);
    const model = (await modelRes.json()).model;
    const priceParam = model.parameters.find((p: any) => p.name === 'Price');

    const res = await app.request(`/models/${modelId}/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenarioOverrides: [{ parameterId: priceParam.id, value: 200 }],
      }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.comparison.rows.length).toBeGreaterThan(0);
    const row = data.comparison.rows[0];
    expect(row.baseline).toBe(5000);
    expect(row.scenario).toBe(10000);
    expect(row.percentDelta).toBeCloseTo(100, 0);
  });

  it('POST /models/:id/mutations/preview — recalculates without persisting', async () => {
    const beforeModelResponse = await app.request(`/models/${modelId}`);
    const beforeModel = (await beforeModelResponse.json()).model;
    const priceParam = beforeModel.parameters.find((parameter: any) => parameter.name === 'Price');

    const beforeSnapshotsResponse = await app.request(`/snapshots/${modelId}`);
    const beforeSnapshots = (await beforeSnapshotsResponse.json()).snapshots;
    const response = await app.request(`/models/${modelId}/mutations/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { id: 'user-1', type: 'human' },
        rationale: 'Preview a governed price update',
        operations: [{ type: 'setParameterValue', parameterId: priceParam.id, value: 200 }],
      }),
    });

    expect(response.status).toBe(200);
    const preview = await response.json();
    expect(preview.valid).toBe(true);
    expect(preview.proposedModel.parameters.find((parameter: any) => parameter.id === priceParam.id).currentValue).toBe(200);
    expect(Object.values(preview.proposedModel.outputs).map((output: any) => output.value)).toContain(10000);
    expect(preview.affectedOutputs.length).toBeGreaterThan(0);

    const afterModelResponse = await app.request(`/models/${modelId}`);
    const afterModel = (await afterModelResponse.json()).model;
    expect(afterModel).toEqual(beforeModel);

    const afterSnapshotsResponse = await app.request(`/snapshots/${modelId}`);
    const afterSnapshots = (await afterSnapshotsResponse.json()).snapshots;
    expect(afterSnapshots).toHaveLength(beforeSnapshots.length);
  });

  it('GET /models/:id/deliverable — returns packaged deliverable', async () => {
    const res = await app.request(`/models/${modelId}/deliverable`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deliverable.id).toBeTruthy();
    expect(data.deliverable.modelId).toBe(modelId);
    expect(data.deliverable.outputs.length).toBeGreaterThan(0);
    expect(data.deliverable.parameters.length).toBeGreaterThan(0);
    expect(data.deliverable.compatibility).toBeDefined();
  });

  it('DELETE /models/:id — removes the model', async () => {
    const res = await app.request(`/models/${modelId}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.deleted).toBe(true);

    const getRes = await app.request(`/models/${modelId}`);
    expect(getRes.status).toBe(404);
  });

  it('DELETE /models/:id — 404 for nonexistent', async () => {
    const res = await app.request('/models/nonexistent', { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('GET /health — returns ok', async () => {
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });
});
