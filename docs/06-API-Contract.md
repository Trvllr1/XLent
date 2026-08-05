# 06 — API Contract

## Overview

- **Base URL:** `http://localhost:4100` (dev) / configurable via environment
- **Framework:** Hono
- **Auth:** `x-api-key` header (env: `XLENT_API_KEYS`, comma-separated)
- **Content-Type:** `application/json` (except file upload: `multipart/form-data`)
- **Error format:** `{ "error": "message", "details": {...} }`

---

## Current Endpoints (Verified)

### Health

```
GET /health
→ { status: "ok", service: "xlent-api", version: "0.2.0" }
```

### Model Lifecycle

```
POST /models/import
  Body: FormData { file: .xlsx }
  → { model: Model, discovery: ModelDiscovery }

GET /models
  → { models: Model[] }

GET /models/:id
  → { model: Model }

POST /models/:id/analyze
  → { discovery: ModelDiscovery }

DELETE /models/:id
  → { deleted: true }
```

### Model Inspection

```
GET /models/:id/parameters
  → { parameters: Parameter[] }

GET /models/:id/outputs
  → { outputs: Output[] }

GET /models/:id/graph
  → { graph: DependencyGraph }

GET /models/:id/compatibility
  → { compatibility: CompatibilityReport }

GET /models/:id/provenance
  → { provenance: Provenance[] }
```

### Execution

```
POST /models/:id/run
  Body: { overrides?: ScenarioOverride[] }
  → { results: Record<string, unknown> }

POST /models/:id/scenarios
  Body: { name: string, overrides: ScenarioOverride[] }
  → { scenario: Scenario }

POST /models/:id/compare
  Body: { baselineOverrides?: ScenarioOverride[], scenarioOverrides: ScenarioOverride[] }
  → { comparison: ComparisonRow[] }
```

### Deliverables

```
GET /models/:id/deliverable
  → { deliverable: Deliverable }

POST /models/:id/deliverable/push
  Body: { callbackUrl: string, overrides?: ScenarioOverride[] }
  → { deliverable: Deliverable, pushed: true }

POST /models/:id/deliver
  Body: { clientId: string, overrides?: ScenarioOverride[] }
  → { deliverable: Deliverable, delivery: DeliveryRecord }
```

### Client Management

```
POST /clients
  Body: { name: string, webhookUrl: string }
  → { client: { id, name, webhookUrl, apiKey } }

GET /clients
  → { clients: Client[] }  (apiKey shown as prefix only)

DELETE /clients/:id
  → { deleted: true }
```

---

## Planned Endpoints

### E1 — Assurance

```
POST /models/:id/tests
  Body: { tests: ModelTestDefinition[] }
  → { stored: number }
  Stores test definitions for a model.

GET /models/:id/tests
  → { tests: ModelTestDefinition[] }

POST /models/:id/tests/run
  Body: { overrides?: ScenarioOverride[] }
  → { results: ModelTestResult[], allPass: boolean }
  Executes all stored tests against current model state.

GET /models/:id/evidence
  Query: ?limit=10&from=ISO&to=ISO
  → { records: EvidenceRecord[] }

GET /models/:id/evidence/:evidenceId
  → { record: EvidenceRecord }
```

### E2 — Versioning

```
POST /models/:id/snapshot
  Body: { semver?: string, message?: string }
  → { snapshot: ModelSnapshot }

GET /models/:id/snapshots
  → { snapshots: ModelSnapshot[] }

GET /models/:id/diff
  Query: ?from=semver&to=semver
  → { diff: ModelDiff, migrationReport: string }

POST /models/:id/reimport
  Body: FormData { file: .xlsx }
  → { model: Model, diff: ModelDiff, suggestedVersion: string }
```

### E3 — Lifecycle & Registry

```
PATCH /models/:id/status
  Body: { status: ModelStatus }
  → { model: Model }
  Validates transition rules (e.g., can't publish without passing tests).

POST /models/:id/publish
  → { snapshot: ModelSnapshot, evidence: EvidenceRecord }
  Runs tests, creates evidence, freezes snapshot, transitions to 'published'.

GET /registry
  Query: ?status=published&owner=finance&tag=forecast
  → { entries: RegistryEntry[] }

GET /registry/:slug
  → { entry: RegistryEntry, versions: ModelSnapshot[] }
```

### E3 — Production API (Versioned)

```
# Version-pinned execution
POST /v1/models/:slug/versions/:semver/execute
  Body: { inputs: Record<string, unknown>, evidence?: boolean }
  Headers: x-api-key, x-idempotency-key
  → { outputs: Record<string, unknown>, evidence?: EvidenceRecord }

# Latest published version execution
POST /v1/models/:slug/execute
  Body: { inputs: Record<string, unknown>, evidence?: boolean }
  → { outputs, evidence?, version: string }

# Model metadata
GET /v1/models/:slug
  → { slug, name, currentVersion, status, parameters, outputs }

GET /v1/models/:slug/versions
  → { versions: { semver, publishedAt, testCount, testPassRate }[] }
```

**Production API guarantees:**
- Rate-limited (configurable per client API key)
- Idempotency keys prevent duplicate executions
- Version-pinned execution is reproducible
- Evidence optionally attached to every execution
- Auth scoped per model (future: per-model API key permissions)

### E4 — Sensitivity

```
POST /models/:id/sensitivity
  Body: { parameterIds?: string[], steps?: number, range?: number }
  → { result: SensitivityResult }
```

### E5 — Model Package v2

```
GET /models/:id/package
  Query: ?include=evidence,tests,graph,compatibility
  → { package: ModelPackage }

POST /models/:id/package/deliver
  Body: { clientId: string, overrides?: ScenarioOverride[], include?: string[] }
  → { package: ModelPackage, delivery: DeliveryRecord }
```

---

## Model Package v2 Schema

Extends the existing Deliverable into a full model package:

```typescript
interface ModelPackage {
  // Identity
  id: string;
  modelId: string;
  slug: string;
  modelName: string;
  modelVersion: string;                 // semver
  packagedAt: string;

  // Core model data
  manifest: ModelManifest;
  parameters: DeliverableItem[];
  outputs: DeliverableItem[];
  overridesApplied: ScenarioOverride[];

  // Analysis
  compatibility: CompatibilityReport;
  graph?: DependencyGraph;
  discovery?: ModelDiscovery;

  // Assurance (new in v2)
  findings: ModelFinding[];             // Issues, warnings, observations
  testResults: ModelTestResult[];
  evidence: EvidenceRecord;
  assuranceSummary: AssuranceSummary;
}

interface ModelManifest {
  slug: string;
  name: string;
  version: string;
  status: ModelStatus;
  owner?: string;
  createdAt: string;
  publishedAt?: string;
  parameterCount: number;
  outputCount: number;
  formulaCount: number;
  executionCoverage: number;            // % of formulas executable
}

interface ModelFinding {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: 'structural' | 'mathematical' | 'compatibility';
  message: string;
  cell?: CellAddress;
  recommendation?: string;
}

interface AssuranceSummary {
  overallStatus: 'pass' | 'conditional' | 'fail';
  testsTotal: number;
  testsPassed: number;
  testsFailed: number;
  findingsCount: { critical: number; warning: number; info: number };
  executionCoverage: number;
  recommendation: string;               // Human-readable summary sentence
}
```

---

## Webhook Contract

### Outbound (XLent → Client)

```
POST {client.webhookUrl}
Headers:
  Content-Type: application/json
  x-xlent-signature: sha256={HMAC of body using client API key}
  x-xlent-event: model.delivered

Body: { deliverable: Deliverable }    // or { package: ModelPackage } in v2
```

**Retry policy:** 3 attempts, exponential backoff (1s, 2s, 4s). Delivery recorded regardless of success.

### Inbound (Client → XLent)

Clients can POST to XLent if registered:

```
POST /api/xlent-webhook
Headers:
  x-api-key: {client API key}

Body: { event: string, payload: unknown }
```

Currently used by Siliconomics to receive deliverables (see doc 07).

---

## Auth Model

### Current

- Single tier: `x-api-key` header validated against `XLENT_API_KEYS` env var
- All keys have full access to all endpoints

### Planned (E3)

| Scope | Access |
|---|---|
| `read` | GET endpoints only |
| `execute` | Run, scenario, compare |
| `manage` | Import, delete, status transitions |
| `admin` | Client management, registry operations |

Per-client keys will carry scopes. The production `/v1` API enforces scopes.

---

## Error Codes

| Status | Meaning | Example |
|---|---|---|
| 400 | Validation error | Missing required field, invalid override format |
| 401 | Authentication failed | Missing or invalid API key |
| 403 | Forbidden | Insufficient scope for operation |
| 404 | Not found | Model ID doesn't exist |
| 409 | Conflict | Invalid state transition (e.g., publish without tests passing) |
| 422 | Unprocessable | File is not a valid .xlsx |
| 429 | Rate limited | Too many requests (E3) |
| 500 | Internal error | Runtime evaluation failure |
