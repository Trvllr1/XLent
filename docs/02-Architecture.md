# 02 — Architecture

## Monorepo Layout

```
XLent/
├── package.json              # Workspace root: scripts, workspace declarations
├── tsconfig.base.json        # Shared TS config: ES2022, strict, bundler resolution
├── test-e2e.mjs              # End-to-end pipeline test
│
├── docs/                     # This blueprint suite
│   └── source/               # Original strategy documents (provenance)
│
├── packages/
│   ├── core/                 # @xlent/core — engine, types, SDK client
│   │   ├── src/
│   │   │   ├── types.ts      # XMR canonical type system (~230 lines)
│   │   │   ├── parser.ts     # XLSX importer (xlsx library)
│   │   │   ├── graph.ts      # Dependency graph (DAG), cycle detection
│   │   │   ├── discovery.ts  # Model analysis, input/output classification
│   │   │   ├── runtime.ts    # Deterministic formula evaluator (~350 lines)
│   │   │   ├── scenario.ts   # Scenario execution & comparison
│   │   │   ├── client.ts     # XLentClient — typed API consumer
│   │   │   └── index.ts      # Public export surface
│   │   └── src/__tests__/    # Vitest: parser, runtime, graph
│   │
│   ├── api/                  # @xlent/api — REST server, persistence
│   │   ├── src/
│   │   │   ├── server.ts     # Hono app, CORS, auth, route mounting
│   │   │   ├── routes/
│   │   │   │   ├── models.ts # Model lifecycle endpoints
│   │   │   │   └── clients.ts# Client registration, webhook management
│   │   │   ├── db.ts         # SQLite schema (WAL mode, FK constraints)
│   │   │   ├── store.ts      # ModelStore, ClientStore (prepared statements)
│   │   │   ├── schemas.ts    # Zod request validation
│   │   │   └── middleware/
│   │   │       └── auth.ts   # x-api-key validation
│   │   └── src/__tests__/    # Vitest: API integration tests (in-memory SQLite)
│   │
│   └── web/                  # @xlent/web — React UI
│       └── src/
│           └── views/        # Upload, ModelList, ModelView, RunPanel, ClientsPage
│
└── (planned)
    ├── packages/cli/         # @xlent/cli — E5
    └── packages/sdk/         # @xlent/sdk — E5 (extracted from core/client.ts)
```

---

## Package Responsibilities

### @xlent/core — Engine & Types

**Owns:** XMR type definitions, XLSX parsing, dependency graph, formula evaluation, scenario execution, model discovery.

**Exports:** All types + classes. Consumed by `@xlent/api` (server-side) and `@xlent/sdk`/`xlentClient.ts` (client-side types only).

**Key constraint:** Zero network I/O. Pure computational package. No database, no HTTP server.

### @xlent/api — REST Server & Persistence

**Owns:** HTTP endpoints, SQLite storage, delivery/webhook system, auth.

**Depends on:** `@xlent/core` for parsing, graph, runtime, scenario, types.

**Key constraint:** Stateless request handling (state in SQLite). Single deployable server process.

### @xlent/web — UI

**Owns:** Model exploration interface, upload flow, scenario runner, client management.

**Depends on:** `@xlent/api` via HTTP (no direct core import in browser).

**Key constraint:** Optional. XLent is fully operable via API/CLI without the web UI.

---

## Data Flow

### Import Flow

```
.xlsx file
    │
    ▼
parser.ts ─────────────────── ParsedWorkbook (cells, formulas, sheets)
    │
    ▼
graph.ts ──────────────────── DependencyGraph (nodes, edges)
    │
    ▼
discovery.ts ──────────────── ModelDiscovery (classification, compatibility)
    │
    ▼
routes/models.ts ──────────── Model record persisted to SQLite
    │                          (model JSON + workbook JSON + original blob)
    ▼
Response ──────────────────── { model: Model, discovery: ModelDiscovery }
```

### Execution Flow

```
POST /models/:id/run { overrides }
    │
    ▼
store.getModel(id) ────────── Load Model + ParsedWorkbook from SQLite
    │
    ▼
runtime.ts ────────────────── ModelRuntime
    │                          1. Apply overrides to parameters
    │                          2. Topological sort of dependency graph
    │                          3. Evaluate formulas in order (safe eval)
    │                          4. Collect output values
    ▼
Response ──────────────────── { results: Record<outputId, value> }
```

### Delivery Flow

```
POST /models/:id/deliver { clientId, overrides }
    │
    ▼
Execute model (as above) ──── Compute results
    │
    ▼
Package as Deliverable ────── { id, modelId, outputs, parameters, compatibility }
    │
    ▼
POST to client.webhookUrl ─── Fire-and-forget with retry (3x exponential backoff)
    │
    ▼
Record in deliveries table ── Delivery audit trail
```

---

## Persistence (SQLite)

Current schema:

| Table | Purpose | Key columns |
|---|---|---|
| `models` | Model metadata + XMR JSON | id, name, version, workbook_name, data (JSON) |
| `workbooks` | Parsed workbook data | model_id (FK), data (JSON) |
| `originals` | Original .xlsx binary | model_id (FK), data (BLOB) |
| `clients` | Webhook subscribers | id, name, webhook_url, api_key |
| `deliveries` | Delivery audit log | id, model_id, client_id, status, pushed_at |
| `delivery_tracking` | Retry state | delivery_id, attempt, response_code, error |

---

## Target Architecture (Post-Roadmap)

```
                           XLENT
        ┌────────────────────────────────────────┐
        │                                        │
        │  ┌─────────┐    ┌──────────────────┐   │
        │  │ Importer │    │  Formula AST     │   │
        │  │ (parser) │    │  (parse tree)    │   │
        │  └────┬─────┘    └────────┬─────────┘   │
        │       │                   │             │
        │       └─────────┬─────────┘             │
        │                 ▼                       │
        │          ┌─────────────┐                │
        │          │     XMR     │                │
        │          │  (canonical │                │
        │          │   model)    │                │
        │          └──────┬──────┘                │
        │                 │                       │
        │    ┌────────────┼────────────┐          │
        │    ▼            ▼            ▼          │
        │  ┌────┐    ┌────────┐   ┌────────┐     │
        │  │DAG │    │Runtime │   │  Test  │     │
        │  │    │    │(interp)│   │ Runner │     │
        │  └──┬─┘    └───┬────┘   └───┬────┘     │
        │     │           │            │          │
        │     └───────────┼────────────┘          │
        │                 ▼                       │
        │          ┌─────────────┐                │
        │          │  Evidence   │                │
        │          │  + Results  │                │
        │          └──────┬──────┘                │
        │                 │                       │
        │    ┌────────────┼────────────┐          │
        │    ▼            ▼            ▼          │
        │ Version      Registry     Lifecycle     │
        │ + Diff       + Publish    + States      │
        │                 │                       │
        │                 ▼                       │
        │          ┌─────────────┐                │
        │          │  Model API  │                │
        │          │  (versioned)│                │
        │          └──────┬──────┘                │
        └─────────────────┼──────────────────────┘
                          │
             ┌────────────┼────────────┐
             ▼            ▼            ▼
            Sil         CLI/SDK      Agents
```

---

## Technology Choices

| Layer | Technology | Rationale |
|---|---|---|
| Language | TypeScript (strict) | Shared across all packages; types are the product |
| Runtime | Node.js (ES2022) | Sufficient for computational workloads; no WASM needed yet |
| HTTP | Hono | Lightweight, fast, middleware composable, platform-portable |
| Persistence | SQLite (better-sqlite3) | Zero-config, WAL mode, foreign keys, adequate for single-tenant |
| Validation | Zod | Schema-first request validation, composable, TypeScript-native |
| Testing | Vitest | Fast, TypeScript-native, workspace-aware |
| XLSX parsing | xlsx (SheetJS) | Mature, formula extraction support, MIT-compatible (Community Edition) |
| Frontend | React 19 + Vite + Tailwind | Standard modern stack; same as Sil for developer familiarity |
| Monorepo | npm workspaces | Simple, no Nx/Turborepo overhead needed at current scale |

---

## Security Boundaries

| Boundary | Control |
|---|---|
| API access | `x-api-key` header (env: `XLENT_API_KEYS`) |
| Formula execution | No `eval()`; pattern-based safe evaluation (E0: AST interpreter with step/time limits) |
| File upload | Accepts .xlsx only; parsed server-side; original stored as blob |
| Webhook delivery | `x-xlent-signature` header for payload authentication |
| Client isolation | Per-client API keys; delivery audit per client |

---

## Conventions

- **File naming:** kebab-case for files, PascalCase for types/classes
- **Exports:** Each package has a single `index.ts` barrel export
- **Tests:** Co-located in `src/__tests__/` per package
- **Config:** Root `tsconfig.base.json` extended by each package
- **Scripts:** Root `package.json` orchestrates build/dev/test across workspaces
