import { describe, it, expect } from 'vitest';
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
    ['Memo', 7],
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
    const request = {
      actor: { id: 'user-1', type: 'human' },
      rationale: 'Preview a governed price update',
      operations: [{ type: 'setParameterValue', parameterId: priceParam.id, value: 200 }],
    };
    const response = await app.request(`/models/${modelId}/mutations/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    expect(response.status).toBe(200);
    const preview = await response.json();
    expect(preview.valid).toBe(true);
    expect(preview.previewId).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.evidenceRefs).toEqual([{ kind: 'preview', checksum: preview.previewId }]);
    expect(preview.affectedComponents.length).toBeGreaterThan(0);
    expect(preview.proposedModel.parameters.find((parameter: any) => parameter.id === priceParam.id).currentValue).toBe(200);
    expect(Object.values(preview.proposedModel.outputs).map((output: any) => output.value)).toContain(10000);
    expect(preview.affectedOutputs.length).toBeGreaterThan(0);

    const afterModelResponse = await app.request(`/models/${modelId}`);
    const afterModel = (await afterModelResponse.json()).model;
    expect(afterModel).toEqual(beforeModel);

    const afterSnapshotsResponse = await app.request(`/snapshots/${modelId}`);
    const afterSnapshots = (await afterSnapshotsResponse.json()).snapshots;
    expect(afterSnapshots).toHaveLength(beforeSnapshots.length);

    const rejectResponse = await app.request(`/models/${modelId}/mutations/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, baseVersion: beforeModel.version, previewId: preview.previewId }),
    });
    expect(rejectResponse.status).toBe(200);
    expect(await rejectResponse.json()).toEqual({ rejected: true, previewId: preview.previewId, persisted: false });

    const afterRejectModelResponse = await app.request(`/models/${modelId}`);
    expect((await afterRejectModelResponse.json()).model).toEqual(beforeModel);
    const afterRejectSnapshotsResponse = await app.request(`/snapshots/${modelId}`);
    expect((await afterRejectSnapshotsResponse.json()).snapshots).toHaveLength(beforeSnapshots.length);
  });

  it('POST /models/:id/mutations/commit — creates one governed immutable version', async () => {
    const beforeModelResponse = await app.request(`/models/${modelId}`);
    const beforeModel = (await beforeModelResponse.json()).model;
    const priceParam = beforeModel.parameters.find((parameter: any) => parameter.name === 'Price');
    const beforeSnapshotsResponse = await app.request(`/snapshots/${modelId}`);
    const beforeSnapshots = (await beforeSnapshotsResponse.json()).snapshots;
    const mutationRequest = {
      actor: { id: 'agent-1', type: 'agent' },
      rationale: 'Commit a governed price update',
      operations: [{ type: 'setParameterValue', parameterId: priceParam.id, value: 200 }],
    };
    const previewResponse = await app.request(`/models/${modelId}/mutations/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutationRequest),
    });
    const preview = await previewResponse.json();
    const mutation = {
      ...mutationRequest,
      baseVersion: beforeModel.version,
      previewId: preview.previewId,
    };

    const swappedProposalResponse = await app.request(`/models/${modelId}/mutations/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...mutation, operations: [{ ...mutation.operations[0], value: 201 }] }),
    });
    expect(swappedProposalResponse.status).toBe(409);

    const response = await app.request(`/models/${modelId}/mutations/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutation),
    });

    expect(response.status).toBe(201);
    const committed = await response.json();
    expect(committed.model.version).toBe(beforeModel.version + 1);
    expect(committed.model.semver).toBe('1.1.0');
    expect(committed.model.assuranceLevel).toBe('UNASSESSED');
    expect(committed.affectedComponents.length).toBeGreaterThan(0);
    expect(committed.model.parameters.find((parameter: any) => parameter.id === priceParam.id).currentValue).toBe(200);
    expect(committed.model.outputs.map((output: any) => output.value)).toContain(10000);
    expect(committed.snapshotId).toBeTruthy();
    expect(committed.evidenceId).toBeTruthy();

    const snapshotsResponse = await app.request(`/snapshots/${modelId}`);
    const snapshots = (await snapshotsResponse.json()).snapshots;
    expect(snapshots).toHaveLength(beforeSnapshots.length + 1);
    expect(snapshots.find((snapshot: any) => snapshot.id === committed.snapshotId)).toEqual(expect.objectContaining({
      id: committed.snapshotId,
      semver: '1.1.0',
      message: mutation.rationale,
    }));

    const evidenceResponse = await app.request(`/tests/${modelId}/evidence/${committed.evidenceId}`);
    const evidence = await evidenceResponse.json();
    expect(evidence).toEqual(expect.objectContaining({
      modelVersion: beforeModel.version + 1,
      executedBy: 'agent:agent-1',
      purpose: 'mutation_commit',
      reproducible: true,
    }));

    const staleResponse = await app.request(`/models/${modelId}/mutations/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutation),
    });
    expect(staleResponse.status).toBe(409);

    const tamperedResponse = await app.request(`/models/${modelId}/mutations/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...mutation, baseVersion: committed.model.version, proposedModel: { version: 999 } }),
    });
    expect(tamperedResponse.status).toBe(400);

    const snapshotsAfterStaleResponse = await app.request(`/snapshots/${modelId}`);
    const snapshotsAfterStale = (await snapshotsAfterStaleResponse.json()).snapshots;
    expect(snapshotsAfterStale).toHaveLength(beforeSnapshots.length + 1);

    const undoResponse = await app.request(`/models/${modelId}/mutations/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { id: 'user-1', type: 'human' },
        rationale: 'Restore the initial parameter state',
        baseVersion: committed.model.version,
        targetSnapshotId: beforeSnapshots[0].id,
      }),
    });
    expect(undoResponse.status).toBe(201);
    const undone = await undoResponse.json();
    expect(undone.model.version).toBe(committed.model.version + 1);
    expect(undone.model.semver).toBe('1.2.0');
    expect(undone.model.assuranceLevel).toBe('UNASSESSED');
    expect(undone.model.parameters.find((parameter: any) => parameter.id === priceParam.id).currentValue).toBe(100);
    expect(undone.model.outputs.map((output: any) => output.value)).toContain(5000);
    expect(undone.restoredFromSnapshotId).toBe(beforeSnapshots[0].id);

    const undoEvidenceResponse = await app.request(`/tests/${modelId}/evidence/${undone.evidenceId}`);
    const undoEvidence = await undoEvidenceResponse.json();
    expect(undoEvidence).toEqual(expect.objectContaining({
      modelVersion: committed.model.version + 1,
      restoredFromSnapshotId: beforeSnapshots[0].id,
      rationale: 'Restore the initial parameter state',
    }));

    const snapshotsAfterUndoResponse = await app.request(`/snapshots/${modelId}`);
    const snapshotsAfterUndo = (await snapshotsAfterUndoResponse.json()).snapshots;
    expect(snapshotsAfterUndo).toHaveLength(beforeSnapshots.length + 2);
  });

  it('POST /models/:id/mutations/commit — blocks a mutation when model tests fail', async () => {
    const modelResponse = await app.request(`/models/${modelId}`);
    const model = (await modelResponse.json()).model;
    const priceParam = model.parameters.find((parameter: any) => parameter.name === 'Price');
    const totalOutput = model.outputs[0];
    const createTestResponse = await app.request(`/tests/${modelId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Total remains at approved value',
        category: 'business',
        assertion: { type: 'equals', left: totalOutput.id, right: totalOutput.value },
      }),
    });
    expect(createTestResponse.status).toBe(201);

    const snapshotsBeforeResponse = await app.request(`/snapshots/${modelId}`);
    const snapshotsBefore = (await snapshotsBeforeResponse.json()).snapshots;
    const mutationRequest = {
      actor: { id: 'user-1', type: 'human' },
      rationale: 'This proposal should fail its business test',
      operations: [{ type: 'setParameterValue', parameterId: priceParam.id, value: 300 }],
    };
    const previewResponse = await app.request(`/models/${modelId}/mutations/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutationRequest),
    });
    const preview = await previewResponse.json();
    const response = await app.request(`/models/${modelId}/mutations/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...mutationRequest,
        baseVersion: model.version,
        previewId: preview.previewId,
      }),
    });

    expect(response.status).toBe(422);
    const rejected = await response.json();
    expect(rejected.preview.allTestsPass).toBe(false);
    expect(rejected.preview.testResults).toEqual([
      expect.objectContaining({ name: 'Total remains at approved value', status: 'fail' }),
    ]);

    const modelAfterResponse = await app.request(`/models/${modelId}`);
    const modelAfter = (await modelAfterResponse.json()).model;
    expect(modelAfter).toEqual(model);
    const snapshotsAfterResponse = await app.request(`/snapshots/${modelId}`);
    const snapshotsAfter = (await snapshotsAfterResponse.json()).snapshots;
    expect(snapshotsAfter).toHaveLength(snapshotsBefore.length);
  });

  it('POST /models/:id/mutations/commit — renames a parameter and reverses its test references through undo', async () => {
    const modelResponse = await app.request(`/models/${modelId}`);
    const model = (await modelResponse.json()).model;
    const priceParam = model.parameters.find((parameter: any) => parameter.name === 'Price');
    const snapshotResponse = await app.request(`/snapshots/${modelId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Before semantic rename' }),
    });
    const baselineSnapshot = await snapshotResponse.json();
    const createTestResponse = await app.request(`/tests/${modelId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Price remains non-negative',
        category: 'business',
        assertion: { type: 'non_negative', left: 'Price' },
      }),
    });
    const createdTest = await createTestResponse.json();
    const mutationRequest = {
      actor: { id: 'agent-rename', type: 'agent' },
      rationale: 'Adopt the approved commercial name',
      operations: [{ type: 'renameParameter', parameterId: priceParam.id, name: 'Unit Price' }],
    };
    const previewResponse = await app.request(`/models/${modelId}/mutations/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutationRequest),
    });
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();
    expect(preview.proposedTests).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: createdTest.testId, assertion: expect.objectContaining({ left: 'Unit Price' }) }),
    ]));

    const commitResponse = await app.request(`/models/${modelId}/mutations/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...mutationRequest, baseVersion: model.version, previewId: preview.previewId }),
    });
    expect(commitResponse.status).toBe(201);
    const committed = await commitResponse.json();
    expect(committed.model.parameters.find((parameter: any) => parameter.id === priceParam.id)).toEqual(
      expect.objectContaining({ name: 'Unit Price', sourceCell: priceParam.sourceCell }),
    );
    const testsAfterCommit = await (await app.request(`/tests/${modelId}`)).json();
    expect(testsAfterCommit.tests.find((test: any) => test.id === createdTest.testId).assertion.left).toBe('Unit Price');

    const undoResponse = await app.request(`/models/${modelId}/mutations/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { id: 'user-1', type: 'human' },
        rationale: 'Reverse the semantic rename',
        baseVersion: committed.model.version,
        targetSnapshotId: baselineSnapshot.id,
      }),
    });
    expect(undoResponse.status).toBe(201);
    const undone = await undoResponse.json();
    expect(undone.model.version).toBe(committed.model.version + 1);
    expect(undone.model.parameters.find((parameter: any) => parameter.id === priceParam.id).name).toBe('Price');
    const testsAfterUndo = await (await app.request(`/tests/${modelId}`)).json();
    expect(testsAfterUndo.tests.find((test: any) => test.id === createdTest.testId).assertion.left).toBe('Price');

    const deleteTestResponse = await app.request(`/tests/${modelId}/${createdTest.testId}`, { method: 'DELETE' });
    expect(deleteTestResponse.status).toBe(200);
  });

  it('POST /models/:id/mutations/commit — removes an isolated parameter and restores it through undo', async () => {
    const modelResponse = await app.request(`/models/${modelId}`);
    const model = (await modelResponse.json()).model;
    const memoParameter = model.parameters.find((parameter: any) => parameter.name === 'Memo');
    const memoIndex = model.parameters.findIndex((parameter: any) => parameter.id === memoParameter.id);
    const memoCellId = `${memoParameter.sourceCell.sheet}!${memoParameter.sourceCell.ref}`;
    const snapshotResponse = await app.request(`/snapshots/${modelId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Before isolated parameter removal' }),
    });
    const baselineSnapshot = await snapshotResponse.json();
    const mutationRequest = {
      actor: { id: 'agent-remove', type: 'agent' },
      rationale: 'Remove a confirmed isolated input',
      operations: [{ type: 'removeParameter', parameterId: memoParameter.id }],
    };
    const previewResponse = await app.request(`/models/${modelId}/mutations/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mutationRequest),
    });
    expect(previewResponse.status).toBe(200);
    const preview = await previewResponse.json();
    expect(preview.affectedOutputs).toEqual([]);
    expect(preview.proposedModel.parameters.some((parameter: any) => parameter.id === memoParameter.id)).toBe(false);
    expect(preview.proposedModel.graph.nodes).not.toContain(memoCellId);

    const commitResponse = await app.request(`/models/${modelId}/mutations/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...mutationRequest, baseVersion: model.version, previewId: preview.previewId }),
    });
    expect(commitResponse.status).toBe(201);
    const committed = await commitResponse.json();
    expect(committed.model.semver).toBe('2.0.0');
    expect(committed.model.parameters.some((parameter: any) => parameter.id === memoParameter.id)).toBe(false);
    const runAfterRemoval = await (await app.request(`/models/${modelId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })).json();
    expect(Object.values(runAfterRemoval.results)).toContain(5000);

    const undoResponse = await app.request(`/models/${modelId}/mutations/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actor: { id: 'user-1', type: 'human' },
        rationale: 'Restore the isolated input',
        baseVersion: committed.model.version,
        targetSnapshotId: baselineSnapshot.id,
      }),
    });
    expect(undoResponse.status).toBe(201);
    const undone = await undoResponse.json();
    expect(undone.model.version).toBe(committed.model.version + 1);
    expect(undone.model.parameters[memoIndex]).toEqual(memoParameter);
    expect(undone.model.graph).toEqual(model.graph);
    expect(undone.restoredFromSnapshotId).toBe(baselineSnapshot.id);
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
