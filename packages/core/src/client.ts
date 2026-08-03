/**
 * XLent Client SDK — typed API client for consuming XLent from Siliconomics.
 * This is the integration boundary: Siliconomics imports this client,
 * not the internal engine packages.
 */
import type {
  Model,
  ModelDiscovery,
  Scenario,
  Comparison,
  ScenarioOverride,
  DependencyGraph,
  CompatibilityReport,
  Parameter,
  Output,
  Provenance,
} from '@xlent/core';

export interface XLentClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
}

export class XLentClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(options: XLentClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.headers = options.headers || {};
  }

  async health(): Promise<{ status: string; service: string; version: string }> {
    return this.get('/health');
  }

  async importWorkbook(file: File | Buffer, filename?: string): Promise<{ model: Model; discovery: ModelDiscovery }> {
    const form = new FormData();
    if (file instanceof File) {
      form.append('file', file);
    } else {
      form.append('file', new Blob([file]), filename || 'workbook.xlsx');
    }
    return this.post('/models/import', form, true);
  }

  async listModels(): Promise<{ models: Model[] }> {
    return this.get('/models');
  }

  async getModel(id: string): Promise<{ model: Model }> {
    return this.get(`/models/${id}`);
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

  async createScenario(modelId: string, name: string, overrides: ScenarioOverride[]): Promise<{ scenario: Scenario }> {
    return this.post(`/models/${modelId}/scenarios`, { name, overrides });
  }

  async compareScenarios(
    modelId: string,
    scenarioOverrides: ScenarioOverride[],
    baselineOverrides?: ScenarioOverride[],
  ): Promise<{ comparison: Comparison }> {
    return this.post(`/models/${modelId}/compare`, { scenarioOverrides, baselineOverrides });
  }

  async getGraph(modelId: string): Promise<{ graph: DependencyGraph }> {
    return this.get(`/models/${modelId}/graph`);
  }

  async getCompatibility(modelId: string): Promise<{ compatibility: CompatibilityReport }> {
    return this.get(`/models/${modelId}/compatibility`);
  }

  async getProvenance(modelId: string): Promise<{ provenance: Provenance[] }> {
    return this.get(`/models/${modelId}/provenance`);
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers });
    if (!res.ok) throw new Error(`XLent API error: ${res.status}`);
    return res.json();
  }

  private async post<T>(path: string, body: any, isFormData = false): Promise<T> {
    const headers = { ...this.headers };
    const init: RequestInit = { method: 'POST', headers };

    if (isFormData) {
      init.body = body;
    } else {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const res = await fetch(`${this.baseUrl}${path}`, init);
    if (!res.ok) throw new Error(`XLent API error: ${res.status}`);
    return res.json();
  }
}
