import type {
  Model,
  ModelDiscovery,
  ModelPackage,
  ModelTestResult,
  ModelDiff,
  EvidenceRecord,
  Scenario,
  Comparison,
  ScenarioOverride,
  SensitivityResult,
  Snapshot,
  Parameter,
  Output,
  MutationCommitRequest,
  MutationCommitResult,
  MutationPreview,
  MutationRequest,
  MutationUndoRequest,
} from '@xlent/core';

export interface XLentClientOptions {
  baseUrl: string;
  apiKey?: string;
  headers?: Record<string, string>;
}

export class XLentClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(options: XLentClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.headers = { ...options.headers };
    if (options.apiKey) this.headers['x-api-key'] = options.apiKey;
  }

  // --- Health ---
  async health(): Promise<{ status: string; service: string; version: string }> {
    return this.get('/health');
  }

  // --- Models ---
  async importWorkbook(file: File | ArrayBuffer, filename?: string): Promise<{ model: Model; discovery: ModelDiscovery }> {
    const form = new FormData();
    if (file instanceof File) {
      form.append('file', file);
    } else {
      form.append('file', new Blob([new Uint8Array(file)]), filename || 'workbook.xlsx');
    }
    return this.post('/models/import', form, true);
  }

  async reimport(modelId: string, file: File | ArrayBuffer, filename?: string): Promise<{ model: Model; diff: ModelDiff }> {
    const form = new FormData();
    if (file instanceof File) {
      form.append('file', file);
    } else {
      form.append('file', new Blob([new Uint8Array(file)]), filename || 'workbook.xlsx');
    }
    return this.post(`/models/${modelId}/reimport`, form, true);
  }

  async listModels(): Promise<{ models: Model[] }> {
    return this.get('/models');
  }

  async getModel(id: string): Promise<{ model: Model }> {
    return this.get(`/models/${id}`);
  }

  async deleteModel(id: string): Promise<{ deleted: boolean }> {
    return this.del(`/models/${id}`);
  }

  async getParameters(modelId: string): Promise<{ parameters: Parameter[] }> {
    return this.get(`/models/${modelId}/parameters`);
  }

  async getOutputs(modelId: string): Promise<{ outputs: Output[] }> {
    return this.get(`/models/${modelId}/outputs`);
  }

  async runModel(modelId: string, overrides?: ScenarioOverride[]): Promise<{ results: Record<string, unknown> }> {
    return this.post(`/models/${modelId}/run`, { overrides });
  }

  // --- Governed Mutations ---
  async previewMutation(modelId: string, request: MutationRequest): Promise<MutationPreview> {
    return this.post(`/models/${modelId}/mutations/preview`, request);
  }

  async commitMutation(modelId: string, request: MutationCommitRequest): Promise<MutationCommitResult> {
    return this.post(`/models/${modelId}/mutations/commit`, request);
  }

  async rejectMutation(modelId: string, request: MutationCommitRequest): Promise<{ rejected: true; previewId: string; persisted: false }> {
    return this.post(`/models/${modelId}/mutations/reject`, request);
  }

  async undoMutation(modelId: string, request: MutationUndoRequest): Promise<MutationCommitResult & { restoredFromSnapshotId: string }> {
    return this.post(`/models/${modelId}/mutations/undo`, request);
  }

  async getPackage(modelId: string): Promise<ModelPackage> {
    return this.get(`/models/${modelId}/package`);
  }

  // --- Lifecycle ---
  async transitionStatus(modelId: string, status: string): Promise<{ model: Model }> {
    return this.patch(`/models/${modelId}/status`, { status });
  }

  // --- Tests ---
  async listTests(modelId: string): Promise<{ modelId: string; tests: any[]; count: number }> {
    return this.get(`/tests/${modelId}`);
  }

  async createTest(modelId: string, test: { name: string; category: string; assertion: any; description?: string }): Promise<{ modelId: string; testId: string }> {
    return this.post(`/tests/${modelId}`, test);
  }

  async deleteTest(modelId: string, testId: string): Promise<{ deleted: boolean }> {
    return this.del(`/tests/${modelId}/${testId}`);
  }

  async generateTests(modelId: string): Promise<{ modelId: string; generated: number; tests: string[] }> {
    return this.post(`/tests/${modelId}/generate`, {});
  }

  async runTests(modelId: string, options?: { overrides?: ScenarioOverride[]; evidence?: boolean }): Promise<{ modelId: string; results: ModelTestResult[]; allPass: boolean; count: number; evidenceId?: string }> {
    const qs = options?.evidence ? '?evidence=true' : '';
    return this.post(`/tests/${modelId}/run${qs}`, { overrides: options?.overrides });
  }

  // --- Evidence ---
  async listEvidence(modelId: string, limit?: number): Promise<{ modelId: string; evidence: EvidenceRecord[]; count: number }> {
    const qs = limit ? `?limit=${limit}` : '';
    return this.get(`/tests/${modelId}/evidence${qs}`);
  }

  // --- Snapshots ---
  async listSnapshots(modelId: string): Promise<{ modelId: string; snapshots: Omit<Snapshot, 'data'>[]; count: number }> {
    return this.get(`/snapshots/${modelId}`);
  }

  async createSnapshot(modelId: string, message?: string): Promise<{ id: string; semver: string; checksum: string }> {
    return this.post(`/snapshots/${modelId}`, { message });
  }

  async getSnapshot(modelId: string, snapshotId: string): Promise<Snapshot> {
    return this.get(`/snapshots/${modelId}/${snapshotId}`);
  }

  // --- Diff ---
  async diff(modelId: string, from: string, to: string): Promise<ModelDiff> {
    return this.get(`/diff/${modelId}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
  }

  // --- Scenarios ---
  async createScenario(modelId: string, name: string, overrides: ScenarioOverride[]): Promise<{ scenario: Scenario }> {
    return this.post(`/models/${modelId}/scenarios`, { name, overrides });
  }

  async compareScenarios(modelId: string, scenarioOverrides: ScenarioOverride[], baselineOverrides?: ScenarioOverride[]): Promise<{ comparison: Comparison }> {
    return this.post(`/models/${modelId}/compare`, { scenarioOverrides, baselineOverrides });
  }

  // --- Sensitivity ---
  async sensitivity(modelId: string, config?: { parameterIds?: string[]; outputIds?: string[]; range?: number[] }): Promise<SensitivityResult> {
    return this.post(`/sensitivity/${modelId}`, config ?? {});
  }

  // --- Registry ---
  async registry(filters?: { status?: string; owner?: string; tag?: string }): Promise<{ entries: any[]; count: number }> {
    const params = new URLSearchParams();
    if (filters?.status) params.set('status', filters.status);
    if (filters?.owner) params.set('owner', filters.owner);
    if (filters?.tag) params.set('tag', filters.tag);
    const qs = params.toString() ? `?${params}` : '';
    return this.get(`/registry${qs}`);
  }

  async registryEntry(slug: string): Promise<any> {
    return this.get(`/registry/${slug}`);
  }

  // --- Production API (v1) ---
  async execute(slug: string, overrides?: ScenarioOverride[], options?: { evidence?: boolean; idempotencyKey?: string }): Promise<{ slug: string; semver: string; results: Record<string, unknown>; evidenceId?: string }> {
    const qs = options?.evidence ? '?evidence=true' : '';
    const extraHeaders: Record<string, string> = {};
    if (options?.idempotencyKey) extraHeaders['x-idempotency-key'] = options.idempotencyKey;
    return this.post(`/v1/models/${slug}/execute${qs}`, { overrides }, false, extraHeaders);
  }

  async executeVersion(slug: string, semver: string, overrides?: ScenarioOverride[]): Promise<{ slug: string; semver: string; results: Record<string, unknown> }> {
    return this.post(`/v1/models/${slug}/versions/${semver}/execute`, { overrides });
  }

  // --- HTTP helpers ---
  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers });
    if (!res.ok) throw new Error(`XLent API ${res.status}: ${await res.text().catch(() => '')}`);
    return res.json();
  }

  private async post<T>(path: string, body: any, isFormData = false, extraHeaders?: Record<string, string>): Promise<T> {
    const headers = { ...this.headers, ...extraHeaders };
    const init: RequestInit = { method: 'POST', headers };
    if (isFormData) {
      init.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${this.baseUrl}${path}`, init);
    if (!res.ok) throw new Error(`XLent API ${res.status}: ${await res.text().catch(() => '')}`);
    return res.json();
  }

  private async patch<T>(path: string, body: any): Promise<T> {
    const headers = { ...this.headers, 'Content-Type': 'application/json' };
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`XLent API ${res.status}: ${await res.text().catch(() => '')}`);
    return res.json();
  }

  private async del<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { method: 'DELETE', headers: this.headers });
    if (!res.ok) throw new Error(`XLent API ${res.status}: ${await res.text().catch(() => '')}`);
    return res.json();
  }
}
