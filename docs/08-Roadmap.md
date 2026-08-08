# 08 — Roadmap

## Epic Sequence

```
COMPLETED:  E1 ──▶ E2 ──▶ E4 ──▶ E5 (Model Package v2, SDK scaffolded)
            Tests   Version Runtime  Package
            Evidence Diff    Depth    Delivery

OUTSTANDING DEBT:
            E0 (Formula AST) — blocks semantic diff upgrade and extended function coverage

NEXT (Constitutional Epics):
            E7 ──▶ E8 ──▶ E9 ──▶ E10 ──▶ E11 ──▶ E12
            Debug   Contract Assurance  CI     Corpus  Model
            Core    Intent   Ladder     Gates  Monitor IDE

AFTER IDE:  E13 ──▶ E14 ──▶ E15
            Review  PDC     Graph
            Layer   (XLent  Reasoning
                    tests   Surface
                    XLent)

DEFERRED:   E3 (Lifecycle/Registry/Prod API) · E6 (Branching/Connectors)
```

---

## Status Summary

| Epic | Status | Notes |
|---|---|---|
| E0 | 🔴 Outstanding debt | Regex-based; blocks semantic diff upgrade. Not blocking current work. |
| E1 | ✅ Complete | testRunner.ts, autoTests.ts, evidence records, assertion framework |
| E2 | ✅ Complete | Slug + semver, snapshots, diff.ts (interim normalization-based) |
| E3 | 🔴 Planned | Lifecycle states, registry, prod API — deferred until enterprise need |
| E4 | ✅ Complete | ~30 functions, sensitivity.ts, financial/lookup/conditional |
| E5 | ✅ Complete | package.ts, Sil webhook v2, XLentClient in @xlent/core |
| E6 | ⏸️ Deferred | Branching, enterprise connectors — triggered by usage patterns |
| E7 | 📐 Next | Debugging Core — constitutional requirement |
| E8 | 📐 Next | Model Contract & Intent Authority |
| E9 | 📐 Next | Assurance Ladder (V&V semantics) |
| E10 | 📐 Next | Behavioral Testing & Model CI |
| E11 | 📐 Next | Test Corpus & Monitoring |
| E12 | 🚧 In progress | E12.0 complete: governed preview/commit/reject/undo for human and agent clients (see doc 14) |
| E13 | 📋 Planned | Model Review — judgment layer above E7–E11 (see doc 12) |
| E14 | 📋 Planned | Programmatic Defect Corpus — XLent tests XLent (see doc 13) |
| E15 | 📋 Planned | Graph Reasoning Surface — focus/trace, findings & materiality overlays, semantic diff |

---

## E0 — Formula AST Foundation

**Goal:** Replace regex-based formula handling with a proper AST. Prerequisite for semantic diffs, expanded runtime, and security sandbox.

### E0.1 — Parser ADR & Spike

| Field | Value |
|---|---|
| **Scope** | Evaluate parser options (fast-formula-parser, custom recursive-descent, hybrid with formulajs). Produce an Architecture Decision Record. |
| **Files** | New: `packages/core/src/ast/` directory, `docs/adr/001-formula-parser.md` |
| **Acceptance criteria** | ADR documents: (1) license verification for each candidate, (2) parse-coverage test against 3 real-world xlsx files, (3) AST output format decision, (4) chosen approach with rationale. Spike code parses at least one real model into ASTs. |
| **Verification** | `npm run test` passes; ADR reviewed; spike parses test_model.xlsx formulas into AST nodes. |
| **Dependencies** | None |

### E0.2 — AST-Based Dependency Extraction

| Field | Value |
|---|---|
| **Scope** | Replace regex in `graph.ts` (`extractDependencies`) with AST leaf-node traversal. |
| **Files** | Modify: `packages/core/src/graph.ts`. New: `packages/core/src/ast/extractRefs.ts` |
| **Acceptance criteria** | (1) `buildGraph()` produces identical DAG for existing test models. (2) Correctly handles: cross-sheet refs, absolute refs ($A$1), range refs (A1:A10), named ranges. (3) No regex ref-extraction remains in graph.ts. (4) Existing graph tests pass unchanged. |
| **Verification** | `npm run test` — all graph.test.ts cases pass. New test: model with string literal containing "A1" does NOT create false dependency. |
| **Dependencies** | E0.1 |

### E0.3 — AST Interpreter (Sandboxed)

| Field | Value |
|---|---|
| **Scope** | Replace regex-substitution evaluation in `runtime.ts` with AST tree-walking interpreter. Add step/time limits. |
| **Files** | New: `packages/core/src/ast/interpreter.ts`. Modify: `packages/core/src/runtime.ts` |
| **Acceptance criteria** | (1) All existing runtime.test.ts cases pass with identical outputs. (2) Step limit: configurable max node evaluations per cell (default: 10,000). (3) Time limit: configurable wall-clock timeout per full model execution (default: 30s). (4) Exceeding limits produces `#LIMIT!` error, not a hang. (5) No `eval()`, `Function()`, or `new Function` anywhere in codebase. |
| **Verification** | `npm run test` passes. New test: pathological formula (deeply nested) hits step limit and returns error. E2E test still produces correct semiconductor model results. |
| **Dependencies** | E0.1, E0.2 |

### E0.4 — Normalized Formula & Function Inventory

| Field | Value |
|---|---|
| **Scope** | Populate `Calculation.normalizedFormula` and `Calculation.functionCalls` from AST. |
| **Files** | New: `packages/core/src/ast/normalize.ts`. Modify: `packages/core/src/discovery.ts`, `types.ts` (add `functionCalls` field) |
| **Acceptance criteria** | (1) `normalizedFormula` is canonical text (e.g., always `A1` style, no `$`). (2) `functionCalls` lists all functions used (e.g., `['SUM', 'IF']`). (3) Compatibility report uses function inventory instead of keyword blocklist. (4) Two formulas that differ only in ref-style produce identical `normalizedFormula`. |
| **Verification** | New tests: `=SUM($A$1:$A$5)` and `=SUM(A1:A5)` produce same normalizedFormula. Discovery report now shows exact function breakdown. |
| **Dependencies** | E0.1 |

---

## E1 — Assurance Core

**Goal:** Model tests, test runner, and evidence records. The core differentiator.

### E1.1 — ModelTest Type & Storage

| Field | Value |
|---|---|
| **Scope** | Define `ModelTest`, `ModelTestDefinition`, `TestAssertion` types. Add `model_tests` table to SQLite. API: `POST /models/:id/tests`, `GET /models/:id/tests`. |
| **Files** | Modify: `packages/core/src/types.ts`, `packages/api/src/db.ts`, `packages/api/src/store.ts`, `packages/api/src/schemas.ts`. New: `packages/api/src/routes/tests.ts` |
| **Acceptance criteria** | (1) Types match spec in doc 03 (v1.2). (2) Tests persist to SQLite with model_id FK. (3) CRUD: create, list, delete test definitions. (4) Zod validation rejects malformed test definitions. |
| **Verification** | API test: POST test definition → GET returns it. Invalid assertion type rejected with 400. |
| **Dependencies** | None (can run parallel with E0) |

### E1.2 — Test Runner

| Field | Value |
|---|---|
| **Scope** | Engine that executes `ModelTestDefinition[]` against a model's current state and produces `ModelTestResult[]`. |
| **Files** | New: `packages/core/src/testRunner.ts`. Modify: routes to add `POST /models/:id/tests/run` |
| **Acceptance criteria** | (1) Supports assertion types: `equals`, `gt`, `lt`, `gte`, `lte`, `between`, `balance`, `non_negative`. (2) `balance` asserts two cells/outputs are equal within tolerance. (3) Each test produces `pass`, `fail`, `error`, or `skip`. (4) Tolerance-aware floating-point comparison (configurable, default: 1e-10). (5) Returns `allPass: boolean` summary. |
| **Verification** | Unit tests: equality check passes/fails correctly; balance check with tolerance; non_negative on negative value fails. API test: run tests → get results. |
| **Dependencies** | E1.1 |

### E1.3 — Auto-Generated Structural Tests

| Field | Value |
|---|---|
| **Scope** | Generate structural tests automatically from model analysis: circular deps, broken refs, external refs, formula inconsistencies. |
| **Files** | New: `packages/core/src/autoTests.ts`. Modify: `POST /models/import` to optionally auto-generate tests on import |
| **Acceptance criteria** | (1) Circular dependency → test that asserts 0 cycles. (2) External references → test that asserts 0 external refs (or lists them as warnings). (3) At least 3 structural test types auto-generated. (4) Auto-generated tests marked `autoGenerated: true`. |
| **Verification** | Import model with circular dep → auto-test created → running it produces `fail`. Import clean model → auto-tests pass. |
| **Dependencies** | E1.1, E1.2 |

### E1.4 — Evidence Record

| Field | Value |
|---|---|
| **Scope** | Create `EvidenceRecord` on model execution when `?evidence=true`. Store in `evidence` table. API: `GET /models/:id/evidence`. |
| **Files** | New: `packages/api/src/routes/evidence.ts`. Modify: `packages/api/src/db.ts` (new table), `packages/api/src/routes/models.ts` (run endpoint accepts evidence flag), `packages/core/src/types.ts` |
| **Acceptance criteria** | (1) Evidence record includes: model ID, version, inputs, outputs, test results, checksum, timestamp. (2) Checksum = SHA-256 of deterministic serialization (model version + sorted inputs + sorted outputs). (3) Evidence is immutable once stored. (4) `GET /models/:id/evidence` returns paginated list. (5) Re-execution with same inputs produces same checksum (reproducibility proof). |
| **Verification** | Run model with evidence=true → record stored. Run again with same inputs → same checksum. Modify input → different checksum. GET returns stored records. |
| **Dependencies** | E1.2 |

---

## E2 — Identity & Versioning

**Goal:** Human-readable model identity, semantic versioning, snapshots, AST-based semantic diff.

### E2.1 — Slug & Semver

| Field | Value |
|---|---|
| **Scope** | Add `slug` and `semver` fields to Model. Auto-generate slug from filename on import. Allow user override. Validate uniqueness. |
| **Files** | Modify: `packages/core/src/types.ts`, `packages/api/src/db.ts` (add columns), `packages/api/src/routes/models.ts`, `packages/api/src/schemas.ts` |
| **Acceptance criteria** | (1) Slug auto-generated: "FY27_Model_FINAL.xlsx" → "fy27-model-final". (2) Slug unique constraint enforced (409 on conflict). (3) `semver` defaults to "1.0.0" on first import. (4) Slug immutable once model is published. (5) GET /models/:id returns slug and semver. |
| **Verification** | Import → slug assigned. Import same slug → 409. GET returns slug/semver. |
| **Dependencies** | None |

### E2.2 — Snapshots

| Field | Value |
|---|---|
| **Scope** | Snapshot creation on import and on explicit API call. Snapshot stores full Model JSON + workbook checksum. |
| **Files** | New: `packages/api/src/routes/snapshots.ts`. Modify: `packages/api/src/db.ts` (new `snapshots` table), import route (auto-create snapshot) |
| **Acceptance criteria** | (1) Every import creates a snapshot automatically. (2) `POST /models/:id/snapshot` creates explicit snapshot with optional message. (3) `GET /models/:id/snapshots` returns ordered list. (4) Snapshot data is immutable. (5) Workbook checksum is SHA-256 of original blob. |
| **Verification** | Import → snapshot exists. Manual snapshot → second entry. Data matches model state at creation time. |
| **Dependencies** | E2.1 |

### E2.3 — Semantic Diff Engine

| Field | Value |
|---|---|
| **Scope** | Compare two snapshots and produce `ModelDiff` with AST-based formula comparison. Classify changes as semantic vs. cosmetic. |
| **Files** | New: `packages/core/src/diff.ts`. New: `packages/api/src/routes/diff.ts` (or extend snapshots route) |
| **Acceptance criteria** | (1) Detects added/removed/modified parameters. (2) Detects formula changes; classifies as semantic (logic change) or cosmetic (ref-style only). (3) Detects added/removed outputs. (4) Produces `suggestedBump` (patch/minor/major). (5) Generates human-readable migration report string. (6) `GET /models/:id/diff?from=1.0.0&to=1.1.0` returns diff. |
| **Verification** | Modify parameter value only → patch. Add parameter → minor. Remove parameter → major. Change `=A1+B1` to `=$A$1+$B$1` → cosmetic (patch). Change `=A1+B1` to `=A1+B1+C1` → semantic (minor). |
| **Dependencies** | E0.4 (normalizedFormula), E2.2 (snapshots to diff against) |

### E2.4 — Re-Import Flow

| Field | Value |
|---|---|
| **Scope** | `POST /models/:id/reimport` — re-imports xlsx for existing model, creates new draft version, generates diff against latest snapshot. |
| **Files** | Modify: `packages/api/src/routes/models.ts` |
| **Acceptance criteria** | (1) Re-import creates new version (semver bumped per suggestedBump). (2) New snapshot created. (3) Diff returned in response. (4) Model status resets to 'draft'. (5) Previous published version remains accessible via snapshot. |
| **Verification** | Import v1.0.0 → publish. Re-import modified xlsx → v1.1.0 draft created. Diff shows changes. v1.0.0 snapshot still accessible. |
| **Dependencies** | E2.2, E2.3 |

---

## E3 — Lifecycle, Registry & Production API

**Goal:** Lifecycle states, publish gate, model registry, versioned production API.

### E3.1 — Lifecycle States

| Field | Value |
|---|---|
| **Scope** | Add `status` field to Model. Enforce valid transitions. `PATCH /models/:id/status`. |
| **Files** | Modify: `packages/core/src/types.ts`, `packages/api/src/db.ts`, `packages/api/src/routes/models.ts`, `packages/api/src/schemas.ts` |
| **Acceptance criteria** | (1) Status field: draft → sandbox → validated → approved → published → deprecated. (2) Invalid transitions return 409. (3) Import always creates as 'draft'. (4) Transition to 'validated' requires all tests pass (checked server-side). (5) Transition to 'published' creates immutable snapshot + evidence. |
| **Verification** | Create model (draft). Try to publish directly → 409. Run tests → pass → validate → approve → publish. Published model's snapshot is immutable. |
| **Dependencies** | E1.2 (test runner for publish gate), E2.2 (snapshots) |

### E3.2 — Registry

| Field | Value |
|---|---|
| **Scope** | `GET /registry` endpoint. Lists all models with slug, version, status, owner, test stats. Filterable. |
| **Files** | New: `packages/api/src/routes/registry.ts`. Modify: `packages/api/src/db.ts` (add owner, tags columns or use model JSON) |
| **Acceptance criteria** | (1) Returns `RegistryEntry[]` per doc 05 schema. (2) Filters: status, owner, tag (query params). (3) `GET /registry/:slug` returns entry + version history. (4) Includes consumer count (from deliveries table). (5) Includes test pass rate from latest evidence. |
| **Verification** | Publish 2 models. GET /registry → both shown. Filter by status=published → both. Filter by owner=x → only matching. |
| **Dependencies** | E3.1, E2.1 (slug) |

### E3.3 — Production API (/v1)

| Field | Value |
|---|---|
| **Scope** | Versioned production endpoints under `/v1` prefix. Version-pinned execution, idempotency, rate limiting. |
| **Files** | New: `packages/api/src/routes/v1/models.ts`, `packages/api/src/middleware/rateLimit.ts`, `packages/api/src/middleware/idempotency.ts` |
| **Acceptance criteria** | (1) `POST /v1/models/:slug/execute` runs latest published version. (2) `POST /v1/models/:slug/versions/:semver/execute` runs specific version. (3) `x-idempotency-key` header: duplicate key returns cached response (within TTL). (4) Rate limit: configurable per API key (default: 100 req/min). (5) 429 returned when exceeded. (6) Evidence optionally included (`?evidence=true`). |
| **Verification** | Publish model. Execute via /v1 → correct output. Send same idempotency key → same response without re-execution. Exceed rate limit → 429. Pin to old version → old results. |
| **Dependencies** | E3.1, E1.4 (evidence) |

---

## E4 — Runtime Depth

**Goal:** Expand formula support and add sensitivity analysis.

### E4.1 — Financial Functions

| Field | Value |
|---|---|
| **Scope** | Implement NPV, IRR, XNPV, XIRR, PMT, PV, FV, RATE, NPER in the AST interpreter. |
| **Files** | New: `packages/core/src/ast/functions/financial.ts`. Modify: interpreter function registry |
| **Acceptance criteria** | (1) Each function matches Excel output within 1e-6 tolerance for standard test cases. (2) IRR/XIRR use Newton-Raphson iteration with configurable max iterations (default: 100). (3) Non-convergent IRR returns `#NUM!` error. (4) All functions handle edge cases (zero cash flows, single period, etc.). |
| **Verification** | Unit tests with known Excel outputs for each function. E2E: import model using NPV/IRR → correct computed results. |
| **Dependencies** | E0.3 (AST interpreter) |

### E4.2 — Lookup Functions

| Field | Value |
|---|---|
| **Scope** | Implement VLOOKUP, HLOOKUP, INDEX, MATCH, XLOOKUP. |
| **Files** | New: `packages/core/src/ast/functions/lookup.ts` |
| **Acceptance criteria** | (1) VLOOKUP: exact and approximate match. (2) INDEX/MATCH: single and array forms. (3) XLOOKUP: exact match, search mode, if-not-found. (4) Lookups work across sheets. (5) #N/A on not-found (matches Excel behavior). |
| **Verification** | Unit tests with multi-sheet lookup scenarios. Known-answer tests matching Excel output. |
| **Dependencies** | E0.3 |

### E4.3 — Conditional Aggregates & Range Expansion

| Field | Value |
|---|---|
| **Scope** | SUMIF, SUMIFS, COUNTIF, COUNTIFS, AVERAGEIF. Full range reference support in all aggregate contexts. |
| **Files** | New: `packages/core/src/ast/functions/conditional.ts`. Modify: range resolution in interpreter |
| **Acceptance criteria** | (1) Criteria parsing: numbers, strings, wildcards (*/?), operators (">5", "<>0"). (2) Multi-criteria (SUMIFS) with AND logic. (3) Range refs (A1:A100) work in any function context, not just SUM/AVERAGE. |
| **Verification** | Unit tests with varied criteria. Performance test: 1000-row SUMIFS completes in <100ms. |
| **Dependencies** | E0.3 |

### E4.4 — Sensitivity Analysis

| Field | Value |
|---|---|
| **Scope** | One-at-a-time parameter sweep. `POST /models/:id/sensitivity` endpoint. Impact ranking. |
| **Files** | New: `packages/core/src/sensitivity.ts`, `packages/api/src/routes/sensitivity.ts` |
| **Acceptance criteria** | (1) For each parameter, vary across range (±10%, ±25%, ±50% or custom). (2) Record output values at each point. (3) Rank parameters by absolute impact on each output. (4) Return `SensitivityResult` per doc 04 schema. (5) Configurable: which parameters, how many steps, what range. |
| **Verification** | Model with 3 params, 2 outputs. Sensitivity correctly identifies which param most impacts each output. Ranking is stable across runs (deterministic). |
| **Dependencies** | E0.3 (interpreter for reliable execution across many runs) |

---

## E5 — Model Package v2 + SDK/CLI

**Goal:** Full model package for delivery, extracted SDK, and CLI for agent/CI use.

### E5.1 — Model Package v2

| Field | Value |
|---|---|
| **Scope** | Extend Deliverable into full ModelPackage (findings, test_results, evidence, assurance_summary). Update delivery endpoints. |
| **Files** | Modify: `packages/core/src/types.ts`, `packages/api/src/routes/models.ts` (deliverable endpoints). New: `packages/core/src/package.ts` |
| **Acceptance criteria** | (1) `GET /models/:id/package` returns full ModelPackage per doc 06 schema. (2) Includes findings from structural analysis. (3) Includes latest test results. (4) Includes evidence record. (5) AssuranceSummary computed (pass/conditional/fail). (6) Backward-compatible: existing Deliverable endpoints still work (return subset). |
| **Verification** | Import model, add tests, run. GET /package → all sections populated. assuranceSummary.overallStatus correct based on test results. |
| **Dependencies** | E1 (tests, evidence), E2 (versioning) |

### E5.2 — Sil Inbox v2

| Field | Value |
|---|---|
| **Scope** | Update Sil's webhook handler and inbox UI to consume ModelPackage v2. Show assurance badge, findings, block promotion on critical findings. |
| **Files** | Modify: `server.ts` (webhook handler), `src/components/referenceModels/XLentInbox.tsx` |
| **Acceptance criteria** | (1) Webhook accepts both v1 (Deliverable) and v2 (ModelPackage) payloads. (2) Inbox shows assurance badge (pass/conditional/fail). (3) Critical findings displayed before promote. (4) Promotion blocked if assuranceSummary.overallStatus === 'fail'. (5) Evidence ID linked from promoted Build. |
| **Verification** | Deliver v2 package to Sil → inbox shows badge. Package with failing tests → promotion blocked. Package with passing tests → promotion succeeds. |
| **Dependencies** | E5.1 |

### E5.3 — @xlent/sdk Package

| Field | Value |
|---|---|
| **Scope** | Extract `XLentClient` from `@xlent/core` into standalone `@xlent/sdk` package. Add typed methods for all E1–E3 endpoints. |
| **Files** | New: `packages/sdk/` (package.json, src/index.ts, src/client.ts). Modify: `packages/core/src/index.ts` (remove client export, add deprecation re-export) |
| **Acceptance criteria** | (1) `@xlent/sdk` exports `XLentClient` with methods for all current + new endpoints. (2) `@xlent/core` re-exports client with deprecation notice. (3) Sil's `xlentClient.ts` can migrate to `@xlent/sdk` import. (4) Published as workspace package (npm workspace). (5) TypeScript types included (declaration files). |
| **Verification** | Import from `@xlent/sdk` → works. Import from `@xlent/core` → works with console.warn. All SDK methods typed and callable. |
| **Dependencies** | E3.3 (stable API surface to wrap) |

### E5.4 — @xlent/cli

| Field | Value |
|---|---|
| **Scope** | CLI tool for agent and CI use: `xlent import`, `xlent run`, `xlent test`, `xlent diff`, `xlent export`, `xlent package`. |
| **Files** | New: `packages/cli/` (package.json, src/index.ts, src/commands/*.ts). Uses `@xlent/sdk`. |
| **Acceptance criteria** | (1) Commands: `import <file>`, `run <slug> [--override key=val]`, `test <slug>`, `diff <slug> --from v1 --to v2`, `export <slug> --format json`, `package <slug> --output file.json`. (2) Outputs JSON to stdout (machine-readable for agents). (3) Exit codes: 0 success, 1 test failure, 2 error. (4) `--api-url` and `--api-key` flags (or env vars `XLENT_API_URL`, `XLENT_API_KEY`). (5) `xlent test` returns non-zero if any test fails (CI gate). |
| **Verification** | `xlent import test.xlsx` → model created. `xlent run <slug>` → outputs printed. `xlent test <slug>` → exit 0 if pass, exit 1 if fail. |
| **Dependencies** | E5.3 (SDK) |

---

## E6 — Designed but Deferred

These items have design notes in the blueprint but no scheduled implementation. They are activated when a trigger condition is met.

### Branching

**Design:** doc 05 — branch = parent snapshot + delta set (parameter overrides + formula patches).
**Trigger:** User needs to modify *formulas* (not just parameters) between cases, or needs to version/publish a branch independently.

### Model CI

**Design:** Subsumed into E10 (Behavioral Testing & CI). Retained here for continuity.
**Trigger:** A model has a stable test suite AND frequent re-imports AND steward trusts auto-promotion.

### Enterprise Connectors

**Design:** Scoped repository connection (SharePoint, OneDrive, Google Drive, S3). Level-2 acquisition.
**Trigger:** Enterprise customer requires automated model acquisition from a document repository.

### Model Monitoring

**Design:** Subsumed into E11 (Corpus & Monitoring). Retained here for continuity.
**Trigger:** Multiple production models with execution history; patterns to detect.

### Model Lineage

**Design:** Full source → assumption → formula → output → decision tracing graph.
**Trigger:** Regulatory requirement (SR 11-7 audit) or customer request for full provenance chain.

---

## E7 — Debugging Core

**Goal:** Structured model debugging: graph tracing, finding classification, downstream impact quantification. Implements Constitution Rule 5 ("debug before beautifying") and Rule 22 ("explain defects in terms of impact").

**Source:** Constitution §§12–14 (debugging findings), §50 rules 5, 15, 22.

### E7.1 — Finding Type & Classification

| Field | Value |
|---|---|
| **Scope** | Define `Finding` type with severity (critical/warning/info), category (structural/logical/consistency/coverage), source cell/range, and explanation. Store findings per model version. |
| **Files** | Modify: `packages/core/src/types.ts`. New: `packages/core/src/findings.ts` |
| **Acceptance criteria** | (1) Finding type: `{ id, severity, category, sourceRef, explanation, impact?, autoGenerated }`. (2) Categories: structural (broken refs, cycles), logical (constant formulas, dead branches), consistency (inconsistent patterns across rows), coverage (untested critical paths). (3) Findings stored with model version FK. |
| **Dependencies** | None |

### E7.2 — Downstream Impact Tracing

| Field | Value |
|---|---|
| **Scope** | Given a cell or parameter, trace all downstream dependents through the graph. Quantify impact as "N outputs affected" and "dollar-range of change" (using sensitivity data). |
| **Files** | Modify: `packages/core/src/graph.ts`. New: `packages/core/src/impact.ts` |
| **Acceptance criteria** | (1) `traceDownstream(cellRef)` returns all reachable output cells. (2) If sensitivity data exists, annotate with estimated output delta. (3) Finding explanation includes "affects N outputs" context. |
| **Dependencies** | E7.1, graph.ts (existing) |

### E7.3 — Assumption Impact Visibility

| Field | Value |
|---|---|
| **Scope** | Every parameter shows its downstream reach and sensitivity ranking. UI surface in Model Explorer. |
| **Files** | Modify: `packages/api/src/routes/models.ts` (extend model detail response). Modify: `@xlent/web` parameter view |
| **Acceptance criteria** | (1) Model detail response includes `parameterImpact[]` with reachCount and sensitivityRank. (2) Parameters without downstream reach flagged as potential dead inputs (info finding). |
| **Dependencies** | E7.2, sensitivity.ts (existing) |

---

## E8 — Model Contract & Intent Authority

**Goal:** Explicit model intent declaration. Implements Constitution Rule 11 ("model intent must be explicit") and Rule 12 ("inference is not authority"). The ModelContract is the authoritative specification of what a model should do.

**Source:** Constitution §§15–17 (Model Contract), §50 rules 11, 12.

### E8.1 — ModelContract Type

| Field | Value |
|---|---|
| **Scope** | Define `ModelContract` type: declared parameters (with constraints), declared outputs (with expected semantics), invariants (logical conditions that must always hold), and purpose statement. |
| **Files** | Modify: `packages/core/src/types.ts`. New: `packages/core/src/contract.ts` |
| **Acceptance criteria** | (1) `ModelContract { purpose, declaredInputs[], declaredOutputs[], invariants[], version }`. (2) Invariants expressed as assertions: `{ expression, description }`. (3) Contract is optional — models function without one, but cannot reach VALIDATED without one. |
| **Dependencies** | None |

### E8.2 — Contract vs. Discovery Reconciliation

| Field | Value |
|---|---|
| **Scope** | Compare auto-discovered model structure against explicit contract. Report discrepancies as findings (category: intent). |
| **Files** | New: `packages/core/src/contractReconcile.ts` |
| **Acceptance criteria** | (1) Missing contract input (discovered but not declared) → warning. (2) Extra contract input (declared but not found) → critical. (3) Output mismatch → critical. (4) Invariant not testable → warning. (5) Reconciliation produces Finding[]. |
| **Dependencies** | E8.1, E7.1 |

### E8.3 — Intent Authority Hierarchy

| Field | Value |
|---|---|
| **Scope** | Enforce Constitution's authority hierarchy: Contract > Structure > Inference > Workbook metadata. When sources conflict, higher-authority source wins. |
| **Files** | Modify: `packages/core/src/discovery.ts` (annotate discoveries with authority level) |
| **Acceptance criteria** | (1) Every discovered fact has `authorityLevel: 'contract' | 'structure' | 'inference' | 'metadata'`. (2) Contract-declared facts override inferred facts. (3) `autoGenerated` facts clearly marked as inference. |
| **Dependencies** | E8.1, E8.2 |

---

## E9 — Assurance Ladder

**Goal:** Formalize validity semantics. A model's assurance status progresses through defined levels with explicit requirements at each gate. Implements Constitution Rules 8, 9, 10, 20, 21.

**Source:** Constitution §§22–25 (Assurance), §50 rules 8–10, 20–21.

### E9.1 — AssuranceStatus Type & UNASSESSED State

| Field | Value |
|---|---|
| **Scope** | Define `AssuranceStatus` enum: `UNASSESSED | TESTED | VERIFIED | VALIDATED`. All models start as UNASSESSED. Add to Model type. |
| **Files** | Modify: `packages/core/src/types.ts` |
| **Acceptance criteria** | (1) New models get `assuranceStatus: 'UNASSESSED'`. (2) Status can only advance (never skip levels). (3) Each level has explicit gate requirements (see E9.2). |
| **Dependencies** | None |

### E9.2 — Assurance Gates

| Field | Value |
|---|---|
| **Scope** | Define requirements to advance between assurance levels. Automate gate checks. |
| **Files** | New: `packages/core/src/assuranceGates.ts` |
| **Acceptance criteria** | (1) UNASSESSED → TESTED: all auto-generated structural tests pass + at least 1 user-defined test exists. (2) TESTED → VERIFIED: all tests pass + no critical findings + evidence record exists. (3) VERIFIED → VALIDATED: contract exists + contract reconciliation clean + steward approval. (4) `checkAssuranceGate(model, targetLevel)` returns `{ canAdvance: boolean, blockers: string[] }`. |
| **Dependencies** | E9.1, E8.1 (contract for VALIDATED gate), E7.1 (findings for VERIFIED gate) |

### E9.3 — Verification vs. Validation Labels

| Field | Value |
|---|---|
| **Scope** | Every test and finding explicitly categorized as verification (does it work correctly?) or validation (does it solve the right problem?). |
| **Files** | Modify: `packages/core/src/types.ts` (add `vvCategory: 'verification' | 'validation'` to test/finding types) |
| **Acceptance criteria** | (1) Structural tests → verification. (2) Invariant tests from contract → validation. (3) Auto-tests → verification. (4) User assertions about business meaning → validation. (5) UI shows V&V breakdown in assurance summary. |
| **Dependencies** | E9.1, E7.1 |

---

## E10 — Behavioral Testing & Model CI

**Goal:** Beyond structural tests — test model *behavior* over time and automate test gates on model change. Implements Constitution Rules 6, 7 and the Model CI concept from E6.

**Source:** Constitution §§9–11 (testing), §50 rules 6–7, §53 rules 6–7.

### E10.1 — Behavioral Test Types

| Field | Value |
|---|---|
| **Scope** | Add test types beyond assertions: regression baselines (output snapshot comparison), boundary tests (extreme inputs), consistency tests (related outputs maintain ratios). |
| **Files** | Modify: `packages/core/src/testRunner.ts`, `packages/core/src/types.ts` |
| **Acceptance criteria** | (1) `regression_baseline`: snapshot outputs, fail if deviation > tolerance on re-import. (2) `boundary`: run with min/max parameter values, assert no #ERROR. (3) `consistency`: assert ratio/relationship between outputs holds across scenarios. |
| **Dependencies** | E9.1 |

### E10.2 — Bug-Fix Regression Enforcement

| Field | Value |
|---|---|
| **Scope** | When a model is re-imported to fix a bug, require a new test that would have caught the original defect. Track bug-fix → test mapping. |
| **Files** | New: `packages/core/src/regressionTracking.ts`. Modify: re-import flow |
| **Acceptance criteria** | (1) Re-import with `reason: 'bugfix'` flag requires at least one new test that fails against the previous version and passes against the new version. (2) Advisory for now (warning finding, not hard block). (3) Test tagged `{ regressionFor: previousVersion }`. |
| **Dependencies** | E10.1, E2 (diff to identify changed cells) |

### E10.3 — Model CI Gate

| Field | Value |
|---|---|
| **Scope** | On re-import, automatically run full test suite. If all pass and change is patch-level, optionally auto-advance assurance. Block re-import if critical tests fail. |
| **Files** | Modify: `packages/api/src/routes/models.ts` (re-import endpoint) |
| **Acceptance criteria** | (1) Re-import always runs tests. (2) If tests fail: model version created but assuranceStatus = UNASSESSED + critical finding attached. (3) If tests pass + patch-level diff: assuranceStatus preserved from previous version. (4) If tests pass + major diff: assuranceStatus resets to TESTED (requires re-verification). |
| **Dependencies** | E10.1, E9.2, E2 (diff for change classification) |

---

## E11 — Test Corpus & Monitoring

**Goal:** Curated model corpus for parser/runtime validation, and production execution monitoring. Implements Constitution §53 rule 7 (every parser capability has a fixture) and §§30–31 (monitoring).

**Source:** Constitution §§30–31 (Model Monitoring), §§48–49 (Test Corpus), §53 rule 7.

### E11.1 — Intentional-Defect Corpus

| Field | Value |
|---|---|
| **Scope** | Create workbook fixtures with known defects: circular refs, broken refs, type errors, dead code, inconsistent patterns. Each fixture has expected findings. |
| **Files** | New: `fixtures/defect-corpus/` (10+ workbooks). New: `fixtures/defect-corpus/manifest.json` |
| **Acceptance criteria** | (1) Minimum 10 workbooks, each exercising a different defect type. (2) Manifest maps each file to expected findings (type, severity, count). (3) Test: import all → compare actual findings to manifest → all match. (4) At least one fixture per finding category (structural, logical, consistency, coverage). |
| **Dependencies** | E7.1 (finding types must exist to validate against) |

### E11.2 — Function Coverage Corpus

| Field | Value |
|---|---|
| **Scope** | Expand fixture set to cover every supported runtime function with known-answer tests. |
| **Files** | New: `fixtures/function-corpus/` (workbooks organized by category). New: `fixtures/function-corpus/manifest.json` |
| **Acceptance criteria** | (1) Every function in runtime registry has at least one fixture that uses it. (2) Manifest includes expected output values for each fixture. (3) CI test: import + execute all → compare outputs to manifest → all within tolerance. |
| **Dependencies** | Runtime function registry (existing) |

### E11.3 — Execution Monitoring

| Field | Value |
|---|---|
| **Scope** | Track execution frequency, input distributions, and output anomalies for production models. Alert on drift. |
| **Files** | New: `packages/api/src/monitoring.ts`, `packages/api/src/routes/monitoring.ts` |
| **Acceptance criteria** | (1) Each execution logged: timestamp, input hash, output hash, duration. (2) `GET /models/:id/monitoring/stats` returns execution frequency, avg duration, last run. (3) Anomaly: output deviates >3σ from historical mean → flag in model status. (4) Drift: input distribution shifts (KL divergence or simpler metric). |
| **Dependencies** | E1.4 (evidence records as execution log source) |

---

## E12 — Model IDE

**Goal:** Make XLent the native development environment and control plane for computational models. Humans and agents can create, inspect, debug, mutate, refactor, test, review, validate, version, assure, publish, and deploy the canonical model without bypassing model-integrity controls.

**Source:** `docs/14-Model-IDE-Capstone.md` (normative source: `docs/source/XLent-Model-IDE-Capstone.txt`). This supersedes the earlier editor-only E12 guidance.

**Primary thesis:** `.xlsx ≠ Model`. Excel remains a first-class authoring/interchange surface, but the canonical model (XMR + AST + Graph + Runtime) is the authoritative editable, executable, testable, versionable, and deployable object.

**Constitutional status:** M-01–M-12 in doc 14 are proposed amendments, not binding until separately adopted. E12 implementation must nevertheless preserve current constitutional invariants: deterministic execution, inference ≠ authority, execution ≠ validity, no silent mutation, and evidence before judgment.

**Dependencies:** E0 (AST), E2 (version/diff), E7 (debug/findings), E8 (contracts), E9 (assurance), E10 (targeted tests/CI), E13 (review integration for the complete closed loop). E12 can begin before E13 is complete, but E12.4 cannot close without it.

### E12.0 — Canonical Model Mutation Layer ✅

| Field | Value |
|---|---|
| **Scope** | Establish the architectural boundary through which every human or agent edit passes. A mutation request produces a proposed state, validation, recalculation, affected-graph analysis, targeted tests, contract checks, semantic diff, evidence, then explicit commit or reject. No actor mutates XLSX or persisted XMR directly. |
| **Files** | New: `packages/core/src/mutation/` (`types.ts`, `validate.ts`, `apply.ts`, `preview.ts`, `undo.ts`). New: `packages/api/src/routes/mutations.ts`. Modify model persistence/versioning. |
| **Acceptance criteria** | (1) `POST /models/:id/mutations/preview` accepts an atomic operation batch and never persists it. (2) Preview returns semantic diff, affected components/outputs, test + contract results, and evidence refs. (3) Explicit commit creates a new immutable version; reject creates none. (4) The whole mutation transaction is reversible. (5) Human UI and agent API call the same core primitive. (6) Scenario overrides cannot be committed accidentally as mutations. |
| **Implemented** | Parameter-value mutation primitive; deterministic preview identity; strict preview-bound commit/reject; optimistic concurrency; atomic model + snapshot + evidence transaction; governed snapshot undo; Inputs UI; typed SDK methods. |
| **Verification** | Core mutation tests; API import/preview/reject/commit/undo/test-gate suite; core/API/SDK/web typechecks; live browser preview + reject against 22 model tests with unchanged canonical value. |
| **Dependencies** | E0, E2, E8, E10 |

### E12.1 — Structure Editor & Semantic Refactoring

| Field | Value |
|---|---|
| **Scope** | Add/remove/rename/reorder parameters, outputs, sections, and model components. Semantic refactors: rename, extract, replace source, rewire dependency, introduce, remove. Preview consequences before commit. |
| **Files** | New editor/refactor components in `packages/web/src/`. New mutation operations in core. |
| **Acceptance criteria** | (1) Rename propagates through AST formulas, tests, contracts, scenarios, and graph labels. (2) Remove identifies all consumers and blocks unsafe commit unless explicitly resolved. (3) Rewire previews changed dependencies and outputs. (4) Add/remove changes root/terminal graph nodes correctly. (5) Each accepted refactor is one atomic, reversible semantic mutation. |
| **Implemented (rename increment)** | Stable-ID `renameParameter` mutation; unique-name and atomic-batch validation; contract declaration/expression and name-based test propagation; ID-based semantic diff; atomic model + rewritten-test persistence; rename-aware governed undo; typed SDK parity; Value/Name mutation UI with stale-preview invalidation and responsive layout. Formulas, graph topology, source cells, and scenario overrides retain stable identity and therefore require no text rewrite. |
| **Verification (rename increment)** | Core semantic rename, overlapping-symbol, duplicate-name, and identity tests; API preview/commit/test-persistence/undo acceptance test; 90/90 core tests and 14/14 API tests; all package builds; live browser preview against 22/22 model tests showing 39 affected components and 12 outputs; reject confirmed non-persistence; narrow-workspace screenshot verified stacked controls without clipping. |
| **Implemented (remove increment)** | Governed `removeParameter` for isolated inputs only; computational, output, contract, and test consumers produce explicit blockers; canonical parameter and isolated graph node are removed together; semantic diff triggers a major version; internal snapshot restore returns the full parameter, original ordering, and exact graph state through a new immutable version; Remove mode uses the same preview/test/commit UI and exposes engine blocker details. |
| **Verification (remove increment)** | Core safe-removal, output-stability, consumer-blocker, contract-blocker, and test-blocker tests; API commit/run/undo acceptance test with exact graph restoration; 93/93 core tests and 15/15 API tests; core/API/web builds; live browser safety preview confirmed a consumed input was blocked with seven consumers and no canonical mutation. |
| **Implemented (reorder increment)** | Governed `moveParameter` with bounded target index; canonical parameter order changes without graph/runtime mutation; semantic diff emits one cosmetic `parameters.order` entry and patch bump; computational impact is correctly zero; undo derives deterministic move operations and restores exact prior order; Position mode uses a bounded select in the shared mutation panel. |
| **Verification (reorder increment)** | Core identity/output/diff test; API preview/commit/exact-order undo acceptance test; 94/94 core tests and 16/16 API tests; all package builds; live browser preview reported one cosmetic change, patch bump, 0 affected components, 0 outputs, and 22/22 tests; reject confirmed non-persistence; narrow-workspace screenshot verified all four mutation modes fit. |
| **Implemented (output rename increment)** | Stable-ID `renameOutput` mutation; unique-name validation; contract declared-output/expression and name-based test propagation; ID-based output diff emits one semantic rename; atomic rewritten-test persistence; snapshot undo derives the inverse output rename; focused Outputs UI provides governed preview/commit/reject without exposing unsupported output mutations. |
| **Verification (output rename increment)** | Core output identity/value/graph/contract/test propagation test; API preview/commit/test-persistence/undo acceptance test; 95/95 core tests and 17/17 API tests; all package builds; live browser preview reported one semantic change, one affected component/output, and 22/22 tests; reject confirmed non-persistence; narrow-workspace screenshot verified the output rename panel. |
| **Implemented (output reorder increment)** | Governed `moveOutput` with bounded target index; stable output identity and canonical values are preserved while presentation order changes; semantic diff emits one cosmetic `outputs.order` entry and patch bump; computational impact is zero; snapshot undo derives deterministic moves that restore exact prior order; the focused Outputs UI exposes Name and Position modes through the same governed preview/commit/reject path. |
| **Verification (output reorder increment)** | Core identity/value/order/diff test; API preview/commit/exact-order undo acceptance test with a multi-output fixture; 96/96 core tests and 18/18 API tests; all package builds; live browser preview reported one cosmetic change, patch bump, 0 affected components, 0 outputs, and 22/22 tests; reject confirmed non-persistence; focused screenshot verified the output Position control and evidence summary. |
| **Implemented (output remove increment)** | Governed `removeOutput` retires only the terminal output declaration while preserving its calculation and graph node; contract declarations/expressions and name-based model tests block unsafe removal; semantic diff classifies removal as a major change; internal `restoreOutput` returns the exact declaration and ordering through snapshot undo; Remove mode exposes failed-test evidence and disables commit when gates fail. |
| **Verification (output remove increment)** | Core terminal-only removal, graph/runtime identity, contract-blocker, and test-blocker tests; API preview/commit/exact-output undo acceptance test; 98/98 core tests and 19/19 API tests; all package builds; live browser preview reported one semantic removal, major bump, one affected component/output, and 21/22 tests; the exact failed numeric-output test was visible, Commit was disabled, and reject confirmed non-persistence. |
| **Implemented (output add increment)** | Governed `addOutput` promotes an existing workbook formula component to the public output surface; the engine validates canonical graph/workbook identity, rejects raw/unknown/already-exposed sources and duplicate IDs/names, derives value/format/input dependencies/confidence, and leaves the formula and graph unchanged; the UI lists analyzed unexposed formula components only; snapshot undo removes the promoted declaration. New formula creation remains E12.2. |
| **Verification (output add increment)** | Core promotion/derived-metadata/graph-identity/source-rejection tests; API preview/commit/runtime/exact-order undo acceptance test using a true intermediate formula; 100/100 core tests and 20/20 API tests; all package builds; live browser preview promoted `Value Effect!C21` with one semantic addition, minor bump, one affected component/output, and 22/22 tests; reject confirmed non-persistence; focused screenshot verified the candidate, name, rationale, and evidence controls. |
| **Implemented (input add increment)** | Governed `addParameter` creates a native XLent-owned assumption: deterministic reserved `XLent Inputs!A<n>` virtual source cell, typed value validation, unique ID/name enforcement, exactly one isolated root graph node, and unchanged outputs; sequential batch allocation is deterministic; snapshot undo removes the native input through the existing isolated-removal path. Wiring it into formulas remains a separate rewire mutation; arbitrary workbook cell creation is explicitly out of scope. |
| **Verification (input add increment)** | Core virtual-cell derivation, sequential batch, graph-root, output-stability, duplicate-name, and type-mismatch tests; API preview/commit/override-run/undo-removal acceptance test; 103/103 core tests (17 mutation) and 21/21 API tests; all package builds; live browser preview added `Review Tax Rate` with one semantic addition, minor bump, one affected component, zero outputs, and 22/22 tests; reject confirmed non-persistence; focused screenshot verified the native input panel and evidence. |
| **Implemented (formula edit / rewire increment)** | Governed `setCellFormula` edits an existing workbook formula through the canonical mutation path: the engine clones and patches the proposed workbook, rebuilds the dependency graph, rejects unparseable formulas, unsupported functions, constant-cell targets, unknown sheets, and introduced cycles, recomputes the canonical calculation inventory/discovery/compatibility, executes the proposed state, and reports diff plus downstream impact on the new graph; AST-canonical comparison classifies ref-style-only edits as cosmetic; commit persists the proposed workbook atomically with model/tests/snapshot/evidence; snapshot undo derives inverse formula edits from recorded calculations; a startup migration backfills `calculations` for models persisted before the canonical inventory existed (derived metadata only, no version or value change); the Context Panel exposes Edit Formula for any selected formula cell. Creating formulas on constants remains future E12.2 scope. |
| **Verification (formula edit / rewire increment)** | Core recompute, dependency-rewire, invalid-formula, unsupported-function, constant-target, and cycle-gate tests; API preview/commit/persisted-run/undo-restored-run acceptance test; 106/106 core tests (20 mutation) and 22/22 API tests; all package builds; live browser edit of `Value Effect!B31` `B8` → `=$B$8` produced one cosmetic change, patch bump, 24 affected components, 11 outputs, and 22/22 tests; reject left version, semver, and formula unchanged; focused screenshot verified the formula editor and evidence. |
| **Implemented (source replacement increment)** | Governed `setParameterSource` converts a hardcoded `CLIENT_MODEL` input into a formula-driven `EXTERNAL_DATA` component: the engine patches the proposed workbook, rebuilds the graph (the cell stops being a root and gains upstream edges), recomputes the canonical calculation inventory, syncs the parameter's value from the proposed computation, and rejects already-formula-driven targets, unknown cells, invalid/unsupported formulas, and introduced cycles; the value-override surface narrows to explicit `setParameterValue`/`addParameter` operations so source-replaced inputs no longer shadow their formula; internal `restoreParameterSource` reverses the conversion through snapshot undo as one atomic batch with the exact value restore; the shared input panel exposes Value, Name, Position, Source, and Remove modes. |
| **Verification (source replacement increment)** | Core constant-to-formula conversion, graph rewiring, dependent recompute, source-sync, and already-formula gate tests; API preview/commit/persisted-run/undo-restored-run acceptance test; 108/108 core tests (22 mutation) and 23/23 API tests; all package builds; live browser preview of `Funded with cash` → `=B19*B20-B22` was correctly rejected by the cycle gate (`Value Effect!B21 → Value Effect!B22`) with no canonical mutation; closing the panel confirmed non-persistence. |
| **Implemented (extract increment)** | Governed `extractFormula` promotes a repeated computation into a reusable virtual component: the engine creates a deterministic `XLent Components!A<n>` cell with sheet-qualified formula references, retargets one existing formula to reference the component, rebuilds the graph so the component gains upstream edges from its inputs and the retargeted cell consumes it, recomputes the canonical calculation inventory, and rejects blank names, name collisions with inputs, non-formula retarget targets, invalid/unsupported formulas, and introduced cycles; component sheets are pruned when no formula references them; snapshot undo restores the original inline formula and removes the component reference. |
| **Verification (extract increment)** | Core component creation, sheet-qualified references, graph rewiring, value preservation, non-formula-target gate, and name-collision gate tests; API preview/commit/persisted-run/undo-restored-run acceptance test; 108/108 core tests (24 mutation) and 24/24 API tests; all package builds; live browser preview extracted `='Value Effect'!B6*'Value Effect'!B7` from `EPS Effect!B21` into `Shared Market Cap` with one added calculation, one modified formula, minor bump, 9 affected components, and 22/22 tests; reject left version, semver, and canonical state unchanged. |
| **Dependencies** | E12.0 |

### E12.2 — Formula Editor

| Field | Value |
|---|---|
| **Scope** | Model-component formula editing with syntax highlighting, function signatures/autocomplete, AST/reference validation, live dependency + impact preview, test/contract status, semantic undo/redo, and version tracking. This is not a generic cell editor. |
| **Files** | New: `packages/web/src/components/FormulaEditor.tsx`, `formulaTokenizer.ts`. Modify: `FormulaEditPanel.tsx`, `ContextPanel.tsx`, `ModelView.tsx`. |
| **Acceptance criteria** | (1) Highlight functions, refs, operators, numbers, strings. (2) Immediate unsupported-function, broken-ref, and introduced-cycle feedback. (3) Dependency arrows and affected outputs update in preview. (4) Relevant tests/contracts run before commit. (5) Accepted formula edit creates a versioned mutation with evidence; failed preview cannot silently persist. |
| **Implemented (tokenized editor increment)** | Client-side tokenizer classifies numbers, strings, booleans, errors, cell refs, sheet refs, functions, and operators; a transparent `<textarea>` overlays a syntax-highlighted `<pre>` with identical layout; live sheet-reference validation flags unknown sheets against the canonical graph; the editor is wired into the Context Panel for any selected formula cell; preview/commit/reject uses the existing governed `setCellFormula` path with full diff, impact, and test evidence. |
| **Verification (tokenized editor increment)** | Web build passes; live browser edit of `Value Effect!B31` `B8` → `=$B$8` produced one cosmetic change, patch bump, 24 affected components, 11 outputs, and 22/22 tests; reject left version, semver, and formula unchanged; focused screenshot verified the highlighted editor and evidence. Autocomplete, in-editor dependency arrows, and semantic undo/redo history are next E12.2 increments. |
| **Dependencies** | E12.1 (formula edit primitive), E0 (AST) |

### E12.3 — Model Debugger, Watches & Breakpoints

| Field | Value |
|---|---|
| **Scope** | Native debugger: trace output to root causes, watch model components across proposed/committed states, compare formulas/states, identify suspicious dependencies, and inspect breakpoint-like conditions. |
| **Files** | Modify: `packages/core/src/mutation/types.ts`, `preview.ts`, `packages/web/src/components/FormulaEditPanel.tsx`. |
| **Acceptance criteria** | (1) Watch list reports before/after values and causal input/assumption changes for a mutation preview. (2) Breakpoints support numeric/boolean conditions (e.g. Debt < 0) and assumption-change conditions. (3) Trace explains an output through dependencies to root causes. (4) Breakpoint/watch evaluation is deterministic and retained as evidence. |
| **Implemented** | Mutation previews execute one base runtime and one proposed runtime to produce exact before/after watches. Optional typed breakpoints support numeric or boolean cell comparisons (`<`, `<=`, `>`, `>=`, `==`, `!=`) and any/specific assumption-change conditions. Affected outputs include deterministic upstream traces, explicit root causes, and before/after values. Watches, breakpoint results, and traces are included in the preview checksum, replayed unchanged by commit/reject, and retained in immutable mutation evidence. The formula editor provides breakpoint controls, hit status, compact watches, and expandable trace-to-root details. |
| **Verification** | Focused core mutation suite passes 25/25, including repeat-run checksum equality, value and assumption-change breakpoint hits, root identification, and removed-output tracing. Core, API, and web builds pass. Live browser preview changed `Value Effect!B48` from `2000` to `2001`; `Value Effect!B48 > 2000` hit, 3 before/after watches rendered, the affected output traced through 42 dependencies to 15 roots, and 22/22 model tests passed. The debugger panel had no horizontal overflow at its 274px width. Reject closed the preview while version remained `1.0.0` and the formula remained `(B45-B46)*B47`. |
| **Dependencies** | E12.1 (formula edit primitive), E12.2 (editor surface) |

### E12.2 — Formula Editor

| Field | Value |
|---|---|
| **Scope** | Model-component formula editing with syntax highlighting, function signatures/autocomplete, AST/reference validation, live dependency + impact preview, test/contract status, semantic undo/redo, and version tracking. This is not a generic cell editor. |
| **Files** | New: `packages/web/src/components/FormulaEditor.tsx`. Modify mutation operations and AST serializer. |
| **Acceptance criteria** | (1) Highlight functions, refs, operators, numbers, strings. (2) Immediate unsupported-function, broken-ref, and introduced-cycle feedback. (3) Dependency arrows and affected outputs update in preview. (4) Relevant tests/contracts run before commit. (5) Accepted formula edit creates a versioned mutation with evidence; failed preview cannot silently persist. |
| **Dependencies** | E12.0, E0, E7, E8, E10 |

### E12.3 — Model Debugger, Watches & Breakpoints

| Field | Value |
|---|---|
| **Scope** | Native debugger: trace output to root causes, watch model components across proposed/committed states, compare formulas/states, identify suspicious dependencies, and inspect breakpoint-like conditions. |
| **Files** | New debugger/watch views and core debug-condition evaluator; integrate E15 Graph focus/trace when available. |
| **Acceptance criteria** | (1) Watch list reports before/after values and causal input/assumption changes for a mutation preview. (2) Breakpoints support numeric/boolean conditions (e.g. Debt < 0) and assumption-change conditions. (3) Trace explains an output through dependencies to root causes. (4) Breakpoint/watch evaluation is deterministic and retained as evidence. |
| **Dependencies** | E12.0, E7; E15 enhances visualization but is not required for core semantics |

### E12.4 — Closed-Loop Review, Testing, Contracts & Evidence

| Field | Value |
|---|---|
| **Scope** | Close `Find → Understand → Change → Test → Review → Validate → Commit`. Findings can produce proposed mutations; affected-graph analysis selects relevant tests; contracts re-evaluate; review and assurance state update only from evidence. |
| **Files** | Integrate mutation routes/UI with findings, tests, contracts, evidence, assurance, and E13 review APIs. |
| **Acceptance criteria** | (1) "Fix" on a finding opens a pre-populated mutation preview, never silently edits. (2) Targeted tests are selected from affected nodes; full suite remains available. (3) Contract violations block or explicitly gate commit by policy. (4) A finding resolves only when evidence proves resolution. (5) Prior review/assurance evidence remains attached to the prior version; new version starts the appropriate reassessment. |
| **Implemented** | Correctable findings expose **Fix with governed preview**, opening the canonical formula editor with source cell, expected formula, rationale, and finding ID pre-populated. Preview derives relevant tests from affected cells, outputs, parameters, behavioral baselines, boundaries, and consistency pairs while still executing the full suite as the commit gate. Contract reconciliation remains a critical commit gate. Commit evidence retains the source finding, relevant/full test IDs, contract finding IDs, debugger evidence, actor, rationale, and resulting version; the new model version resets to `UNASSESSED`. Findings refresh only after a successful evidence-producing commit, so preview/reject cannot mark a finding resolved. |
| **Verification** | Core suite passes 112/112, including a focused affected-vs-unrelated test-selection case; API suite passes 24/24, including preview replay, finding provenance, immutable review evidence, and assurance reset; web typecheck/build passes. Live `buybacks` Debug flow opened `Value Effect!D42` with expected `=D40/D41` and finding rationale, previewed 1 relevant test while all 22 tests passed the full gate, showed the before/after impact, and produced evidence `c8be40bda661`. Reject kept version `1.0.0` and the finding unresolved. |
| **Dependencies** | E12.0–E12.3, E7–E10, E13 |

### E12.5 — Native Model Creation & Templates

| Field | Value |
|---|---|
| **Scope** | Create a computational model without Excel: inputs, assumptions, formulas, constraints, outputs, tests, contracts, documentation, review rules, and scenarios. Templates become governed model packages rather than `.xlsx` files. |
| **Files** | New native-create workflow in web/API/core; template package schema and starter templates. |
| **Acceptance criteria** | (1) Create an executable model with no source workbook. (2) Define model components by semantic names rather than mandatory cell coordinates. (3) Starter template includes contract + tests + documentation. (4) Native model runs through the same runtime, review, assurance, versioning, and deployment paths as an imported model. |
| **Implemented** | `NativeModelDefinition` defines inputs, formulas, outputs, tests, contract, documentation, scenarios, and review rules by semantic key. The compiler deterministically maps those keys to an internal execution artifact consumed by the existing graph, AST interpreter, runtime, test runner, mutation protocol, evidence, snapshots, assurance, packaging, and delivery paths; no uploaded original is created. `GET /models/native/templates` exposes governed packages and `POST /models/native` accepts either a template or full semantic definition. The Unit Economics starter includes 4 inputs, 4 formulas, 3 outputs, 3 tests, a declared contract, documentation, a scenario, bounds, and review rules. The model-list workflow creates a named native model and enters the standard workspace; native models are explicitly labeled. |
| **Verification** | Core suite passes 113/113 and API suite passes 25/25. The focused API case creates with no original binary, runs outputs, executes all seeded tests with evidence, compares the starter scenario, builds a model package, then performs governed preview/commit through contract and full-test gates to version `1.0.1` with immutable evidence and a second snapshot. Web typecheck/Vite build passes. Live browser creation produced model `d54a647e-09fd-493a-bdcf-b81b732d0273`; canonical Run returned Revenue `120,000`, Operating Profit `30,000`, and Operating Margin `25.0%`; all 3 tests passed and the full declared contract rendered. An isolated 390×844 browser context confirmed the creation dialog fits without horizontal overflow. |
| **Dependencies** | E12.0–E12.2 |

### E12.6 — Human-Agent Mutation Protocol

| Field | Value |
|---|---|
| **Scope** | Expose the canonical mutation loop as a model interaction protocol. Agents inspect, hypothesize, propose, execute preview, test, review evidence, accept/reject, commit; failure supports undo/revise/alternative. No direct XLSX mutation or privileged bypass. |
| **Files** | Extend mutation API + `XLentClient`; agent tool schemas; permission/policy checks. |
| **Acceptance criteria** | (1) Agent and UI produce byte-equivalent mutation requests for the same operation. (2) Agent receives semantic diff, impact, test/contract outcomes, and evidence before requesting commit. (3) Agent cannot approve its own consequential review unless policy explicitly grants a human-equivalent role. (4) Failed proposal can be rejected and replaced without altering canonical state. (5) Audit trail identifies actor, rationale, proposal, decision, and resulting version. (6) First-party and third-party agents use the same governed interfaces and authorization model; no native-agent-only integrity capability is required. (7) The engine, not an agent, computes mutation validity, execution results, tests, and evidence. |
| **Implemented** | Human UI, first-party agents, and third-party agents share the canonical typed preview/approve/commit/reject/undo requests and deterministic engine path. `MUTATION_AGENT_TOOLS` publishes vendor-neutral JSON Schema descriptors for all five operations through core and SDK exports. Consequential agent commits require a server-issued HMAC-signed approval bound to the exact preview, independent reviewer, rationale, and model unless server policy grants a human-equivalent reviewer role. Optional `XLENT_API_PRINCIPALS` binds API keys to actor identity/type/roles, preventing actor relabeling. Commit replays the preview checksum and gates on engine-computed tests and critical contract findings; rejection preserves immutable decision evidence without changing canonical state. Commit/reject evidence records proposer, approver, rationale, proposal, preview, decision, and resulting version. |
| **Verification** | Core suite passes 114/114, including the complete public agent tool contract. API suite passes 26/26, including consequential-agent approval denial, self-approval denial, server-signed independent approval, commit evidence, rejection evidence, unchanged rejected state, and authenticated actor-spoofing denial. Core/API/SDK compile cleanly; full workspace build passes. Live HTTP validation exercised preview → denied unapproved commit → signed reviewer approval → commit, then preview → reject, confirming engine evidence and unchanged state after rejection. |
| **Dependencies** | E12.0, E12.4 |

### E12.7 — Excel Export, Publish & Deploy

| Field | Value |
|---|---|
| **Scope** | Generate Excel as a derivative representation and publish a validated canonical model as a controlled runtime artifact. Preserve formulas, structure, metadata, provenance, version, assumptions, and selected evidence where representable. |
| **Files** | New: `packages/core/src/xlsxWriter.ts`. API: `GET /models/:id/export.xlsx`; integrate publish/deploy gates. |
| **Acceptance criteria** | (1) Exported XLSX opens in Excel and preserves formula semantics. (2) Imported-model round trip re-imports with zero semantic diff. (3) Native models receive a deterministic, sensible Excel layout. (4) Export identifies model version/provenance and unsupported representation losses. (5) Deployment requires configured review/assurance policy; execution success alone cannot publish. |
| **Implemented** | `writeWorkbookXlsx` deterministically serializes the canonical parsed workbook into XLSX while overlaying current parameter/output values, preserving sheet layout, formulas, number formats, and named ranges. XLent model ID, slug, semantic/version number, source kind, assurance level, and selected evidence IDs are embedded as workbook custom properties without adding metadata cells to the computational graph. Known compatibility issues are returned as an explicit representation-loss report. `GET /models/:id/export.xlsx` streams the artifact with filename and URI-encoded report headers; `XLentClient.exportWorkbook` exposes the same binary workflow. Publish atomically reruns the full model suite before snapshot/evidence creation and requires the configured assurance level (`XLENT_PUBLISH_MIN_ASSURANCE`, default `VERIFIED`) in addition to the existing `approved → published` review transition. Only published models execute through the controlled `/v1/models/:slug/execute` deployment surface. |
| **Verification** | Core suite passes 116/116, including native layout/formula/provenance export and imported-artifact round trip with zero computational semantic diff. API suite passes 27/27, including XLSX download/reparse, custom metadata, unassessed publish denial, verified publish evidence, and controlled production execution. Core, API, SDK, CLI, and web typecheck cleanly; the web production bundle passes. Live public-API validation created a native model, generated and ran tests with evidence, advanced assurance to `VERIFIED`, completed review lifecycle transitions, published with fresh passing evidence, downloaded/reparsed XLSX, and executed the published `/v1` artifact with canonical outputs. |
| **Dependencies** | E12.4, E0, E3 |

### E12.8 — Live Excel Sync (Deferred)

| Field | Value |
|---|---|
| **Scope** | File watcher or Excel Add-in reconciles changes in either direction through semantic diff and the canonical mutation layer. Excel never bypasses mutation governance. |
| **Files** | TBD — Add-in vs. local agent vs. file watcher. |
| **Acceptance criteria** | (1) Excel change becomes a mutation preview, not direct persistence. (2) XLent commit can update/export XLSX. (3) Concurrent changes produce a semantic conflict UI with both states. (4) Provenance identifies representation and actor. |
| **Dependencies** | E12.0, E12.7, Office.js/file infrastructure |
| **Trigger** | First user requests bidirectional workflow or enterprise requires Excel ↔ XLent parity. |

---

## E13 — Model Review

**Goal:** Add the judgment layer above the engineering capabilities built in E7–E11. A persistent, versioned `ModelReview` artifact lets reviewers convert machine findings into recorded, evidence-backed human decisions — without becoming programmers.

**Source:** `docs/12-Model-Review.md` (normative source: `docs/source/XLent-Model-Review.txt`).

**Constitutional note:** Review is distinct from Assurance (Review ≠ Assurance). E9's ladder records evidence; E13 records judgment. Do not fold into AssuranceView.

**Dependencies:** E7 (findings), E8 (contract intent), E9 (assurance ladder), E10 (behavioral CI), E2 (model diff).

### E13.1 — ModelReview Object & Finding State Machine

| Field | Value |
|---|---|
| **Scope** | New persistent `ModelReview` entity bound to (model_id, model_version). Finding states `OPEN → INVESTIGATING → RESOLVED / ACCEPTED_EXCEPTION / REJECTED / DEFERRED`. Every disposition records who/when/why/evidence/version. Findings never silently disappear. |
| **Files** | New: `packages/api/src/routes/reviews.ts`, review store + `reviews` / `review_findings` tables. Modify: `packages/core/src/types.ts` (`ModelReview`, `ReviewFinding`, `FindingState`, `ReviewStatus`). |
| **Acceptance criteria** | (1) Create a review for a model version. (2) Existing auto-findings (E7) can be attached to a review. (3) Each finding transitions through the state machine; every transition persists actor, timestamp, rationale, evidence ref, model version. (4) A finding cannot be deleted — only transitioned. (5) Review persists across sessions (DB-backed). |
| **Verification** | API tests: create review, attach finding, walk all disposition states, confirm audit trail. tsc clean. |

### E13.2 — Review Comments, Materiality & Impact

| Field | Value |
|---|---|
| **Scope** | Reviewer comments on findings/elements; materiality classification (LOW/MEDIUM/HIGH by affected output, financial magnitude, dependency depth, decision consequence); downstream impact chain attached to each material finding (reuses E7 quantify/impactChain). |
| **Files** | Modify: review store + routes. Modify: `packages/web` Review UI. |
| **Acceptance criteria** | (1) Comment with evidence ref attaches to a finding. (2) Materiality recorded per finding. (3) Material finding shows its downstream output impact chain. (4) Review lists findings grouped by state and materiality. |

### E13.3 — Approval States & Review API

| Field | Value |
|---|---|
| **Scope** | Explicit approval: `DRAFT · IN_REVIEW · CONDITIONAL · APPROVED · APPROVED_WITH_EXCEPTIONS · REJECTED · SUPERSEDED · RETIRED`, bound to a specific version + scope with reviewer metadata. Machine-readable `ModelReview` export. No permanent validity — a change triggers REASSESS. |
| **Files** | Modify: reviews routes. New: `GET /models/:id/reviews/:rid/export`. |
| **Acceptance criteria** | (1) `POST /models/:id/reviews`, `GET /models/:id/reviews`, `GET .../:rid`, `POST .../findings`, `POST .../approve`, `POST .../reject`. (2) Approval binds to version + scope + reviewer. (3) Re-import/model change on an approved version marks it REASSESS. (4) Export yields the full machine-readable ModelReview artifact. (5) Approval is never AI-generated (Constitution: AI confidence ≠ approval). |

### E13.4 — Review Tab (Web UI)

| Field | Value |
|---|---|
| **Scope** | A `Review` tab in the model workspace (Sidebar `Assure` group), rendering the review object, findings with states/materiality/impact, comments, and the approval action. |
| **Files** | New: `packages/web/src/views/ReviewView.tsx`. Modify: Sidebar, App routes. |
| **Acceptance criteria** | (1) Review tab lists findings by state. (2) Reviewer can transition a finding, comment, and set materiality from the UI. (3) Approval button reflects policy state and records the explicit action. (4) Underlying evidence always reachable from any score/summary (score is never a verdict). |

---

## E14 — Programmatic Defect Corpus (PDC)

**Goal:** Generalize the E11.1 seed corpus into XLent's internal, continuously executed assurance system: Golden Models, a programmatic mutation engine, ground-truth comparison (detection/localization/classification/impact/explanation), generative fuzzing, and release gating. PDC tests **XLent itself** — it is the Engineering Constitution applied recursively.

**Source:** `docs/13-Programmatic-Defect-Corpus.md` (normative source: `docs/source/XLent-Programmatic-Defect-Corpus.txt`).

**Constitutional note:** PDC is internal infrastructure, not a customer feature. It embodies the Recursive Principle — XLent must not trust itself merely because its code executes.

**Dependencies:** E11 (seed corpus + execution monitoring), E0 (AST — required for semantic mutation), E7 (detectors under test).

### E14.1 — PDC Schema, Golden Model Format & Comparator

| Field | Value |
|---|---|
| **Scope** | Machine-readable PDC case schema (case_id, golden_model, mutation, defect_class, severity, expected detection/location/classification/impact/explanation, legitimate_exception, provenance). Golden Model format (known inputs, expected outputs, contract, expected graph/formulas/tests/behavior). Ground-truth comparator scoring EXPECTED vs OBSERVED. |
| **Files** | New: `packages/core/src/pdc/schema.ts`, `packages/core/src/pdc/golden.ts`, `packages/core/src/pdc/compare.ts`. |
| **Acceptance criteria** | (1) A PDC case serializes to/from JSON. (2) Comparator scores detection, localization, classification as separate booleans. (3) Cases carry DEFECTIVE / LEGITIMATE / AMBIGUOUS labels (negative knowledge). (4) Severity assigned by consequence, not syntactic unusualness. |

### E14.2 — Mutation Engine

| Field | Value |
|---|---|
| **Scope** | Programmatic mutation of a valid Golden Model into a known defect: formula, reference (off-by-one), range, sign, temporal, hardcode, dependency, logic mutations. Each mutation records expected ground truth. |
| **Files** | New: `packages/core/src/pdc/mutate.ts`. |
| **Acceptance criteria** | (1) Each mutation class produces a mutated model + a ground-truth record. (2) Off-by-one reference mutation is detected + correctly localized by E7 pattern detection. (3) Mutations are deterministic (seeded) and reproducible. (4) Mutation preserves executability unless the defect class is intentional breakage. |

### E14.3 — Execution Harness, Metrics & CLI Runner

| Field | Value |
|---|---|
| **Scope** | Unattended runner: select corpus → execute XLent → compare to ground truth → compute metrics (detection, localization, classification, severity, impact, explanation, false-positive, false-negative, regression rates) → emit report + evidence. Absorbs the E11.1 deterministic corpus as Phase 2 content. |
| **Files** | New: `packages/core/src/pdc/runner.ts`, `packages/core/src/pdc/metrics.ts`, CLI entry. |
| **Acceptance criteria** | (1) `pnpm pdc:run` executes the deterministic corpus and prints metrics. (2) Every resolved real-world defect can be formalized into a permanent regression case. (3) Results persisted as engineering evidence. (4) E11.1 fixtures re-expressed as PDC cases pass. |

### E14.4 — CI Integration & Release Gates

| Field | Value |
|---|---|
| **Scope** | Wire PDC into CI: on-commit smoke suite, nightly full deterministic corpus. Release gates block on regressions in critical-defect detection, high-severity localization, or false-positive threshold breach. |
| **Files** | New: CI workflow config; Modify: `packages/core/src/pdc/gates.ts`. |
| **Acceptance criteria** | (1) On-commit PDC smoke runs and fails the build on a critical-detection regression. (2) A seeded detector regression is caught by the gate. (3) Metrics are reported per run. |

### E14.5 — Generative Mutation, Compound/Masked Defects & Domain Packs (Deferred)

| Field | Value |
|---|---|
| **Scope** | Generative/fuzzing corpus (fresh mutations for novel-failure discovery); compound + interacting + masked faults (e.g. offsetting ±$10M errors); domain packs (Finance, Semiconductor, etc.); AI/agent evaluation harness. |
| **Files** | TBD. |
| **Acceptance criteria** | (1) Generative mode produces novel valid mutations. (2) Masked-defect cases verify XLent detects structural/logical defects even when outputs net to correct. (3) A domain pack adds domain-specific Golden Models + invariants. (4) An agent's "review this model" response is scored against ground truth. |
| **Dependencies** | E14.1–E14.4 |
| **Trigger** | After the deterministic corpus is stable in CI; before claiming broad domain coverage. |

---

## E15 — Graph Reasoning Surface

**Goal:** Evolve the dependency Graph from a read-only DAG visualization into a model reasoning surface: semantic abstraction levels, focus/trace modes, findings and materiality overlays, and semantic model diff — so reviewers answer "why did this output change?" and "what depends on this defect?" directly from the graph.

**Source:** Inspect-group product surface (doc 01, Graph capability); consumes E7 findings, E9 assurance, E10 tests, E2/E0 diff + AST.

**Constitutional note:** Layout and color are never the sole carriers of meaning. Every graph claim must remain inspectable as structured evidence: `Node → Formula → Dependencies → Finding → Impact → Test → Evidence` (Constitution: evidence before judgment; no execution-only validation).

**Dependencies:** E7 (findings overlays), E9 (assurance overlay), E10 (test coverage overlay), E2 (diff for semantic compare). Large-model AST/path indexing benefits from E0.

### E15.1 — Focus & Trace Modes

| Field | Value |
|---|---|
| **Scope** | Selecting a node supports: upstream causes, downstream consequences, shortest path to a selected output, all affected outputs, hide-unrelated-nodes, pin nodes while comparing paths. Turns "where does this connect?" into "why did this output change?" |
| **Files** | Modify: `packages/web/src/views/GraphView.tsx`, `packages/web/src/layout.ts`. Modify: `packages/api/src/routes/models.ts` (`/graph` accepts focus/trace params) or new focused-slice endpoint. |
| **Acceptance criteria** | (1) Click a node → toggle upstream/downstream/both. (2) "Path to output X" highlights the dependency chain. (3) "Affected outputs" lists terminal nodes reachable from selection. (4) Hide-unrelated reduces the visible subgraph without losing pinned nodes. (5) Trace state is shareable via URL params. |
| **Dependencies** | None beyond existing graph endpoint |

### E15.2 — Findings & Materiality Overlays

| Field | Value |
|---|---|
| **Scope** | Overlay E7 findings and computed significance on the graph: critical/warning coloring, broken refs as interrupted edges, circular deps as highlighted SCCs, pattern-break markers, dead-input/disconnected indicators. Selectable visual modes: Reach (node size by downstream reach), Sensitivity, Materiality (estimated output impact), Test coverage, Assurance. |
| **Files** | Modify: `GraphView.tsx`. Modify: API to expose findings + reach/materiality/coverage per node (reuse E7 `analyzeFindings`, `impact.ts` reachCount, E10 test coverage). |
| **Acceptance criteria** | (1) Findings render as badges/colors on their source node. (2) Clicking a flagged node opens explanation + expected formula + impact + regression test. (3) A mode switcher recolors/resizes nodes by reach, sensitivity, materiality, coverage, assurance. (4) Cycles render as a visible strongly-connected-component highlight. (5) Color is never the only signal — each overlay has a text/label equivalent. |
| **Dependencies** | E15.1, E7, E9, E10 |

### E15.3 — Semantic Abstraction Levels & Clustering

| Field | Value |
|---|---|
| **Scope** | Switchable abstraction: Workbook (sheets + cross-sheet flows) → Component (assumptions/revenue/costs/financing/returns) → Cell (exact formula deps) → Output path (only nodes affecting a selected output). Collapse/expand sheets and components so large models stay legible. |
| **Files** | Modify: `GraphView.tsx`, `layout.ts`. Modify: `packages/core/src/graph.ts` (component clustering, sheet grouping) or a new `graphCluster.ts`. |
| **Acceptance criteria** | (1) Level switcher re-renders the same model at each abstraction. (2) Sheet/component clusters collapse to a single node with a count badge. (3) Output-path level shows only nodes upstream of the chosen output. (4) Cross-sheet edges are visible at workbook level. (5) A model with 500+ cells remains navigable at component level. |
| **Dependencies** | E15.1 |

### E15.4 — Semantic Model Diff on the Graph

| Field | Value |
|---|---|
| **Scope** | Version-aware graph comparison (the pull-request equivalent): added/removed nodes, added/removed/redirected edges, formula-semantic changes, changed outputs, impacted tests/contracts, before/after paths to material outputs. |
| **Files** | Modify: `GraphView.tsx` (diff mode), `packages/core/src/diff.ts` (graph-level diff), API diff endpoint. |
| **Acceptance criteria** | (1) v_a vs v_b renders added (green), removed (red), modified (amber) nodes/edges. (2) Redirected dependency shown as old edge (struck) + new edge. (3) Changed outputs listed with before/after values. (4) Selecting a changed node shows formula diff + impacted tests. (5) Layout is stable across versions (stable node coordinates) so the diff is visually diffable. |
| **Dependencies** | E15.1, E2; E0 for full semantic formula diff |

### E15.5 — Performance, Large-Model Scaling & Accessibility (Deferred)

| Field | Value |
|---|---|
| **Scope** | Render thresholds: <500 nodes SVG; 500–5,000 virtualization + Web Worker layout + viewport culling + clustering; >5,000 Canvas/WebGL with an SVG/HTML accessibility layer. Backend: precompute adjacency/SCC/reachability/output-path indexes at import; return graph slices; cache layouts per version+level; stable coordinates across versions. Interaction: search, minimap, breadcrumbs, keyboard nav, accessible node descriptions, saved views, PNG/SVG export. |
| **Files** | Modify: `GraphView.tsx`, `layout.ts`, API graph endpoints; possibly `packages/core/src/graphIndex.ts`. |
| **Acceptance criteria** | (1) Layout of a 5,000-node model does not block the main thread (Worker). (2) Viewport culling renders only visible nodes at scale. (3) Graph slice endpoints return focused subgraphs without transferring the full graph. (4) Keyboard-only navigation reaches every node with an accessible label. (5) Focused path export produces a shareable PNG/SVG evidence artifact. |
| **Dependencies** | E15.1–E15.3 |
| **Trigger** | First model whose node count makes the SVG DAG unreadable or slow; or enterprise import at scale. |

---

## Sequencing Rationale

| Decision | Rationale |
|---|---|
| E0 outstanding debt | AST is prerequisite for semantic diff upgrade and extended function coverage, but current regex approach works for existing models. Pay when E7/E9 demand it. |
| E1–E5 completed first | Tests, evidence, versioning, diff, sensitivity, and package delivery form the operational foundation. |
| E7 before E8 | Debugging produces findings; contracts consume findings. Build the finding system first. |
| E8 before E9 | Assurance Ladder's VALIDATED gate requires a contract. Define contracts before defining the gate. |
| E9 before E10 | CI gates enforce assurance levels. Define the levels before automating enforcement. |
| E10 before E11 | Behavioral tests validate corpus fixtures. Build the test types before building the corpus. |
| E12 after E0+E2+E7–E10 | Model IDE requires AST, semantic diff/versioning, findings, contracts, assurance, and targeted CI. E12.0 establishes the governed mutation boundary before any editor or agent path. E12 can begin before E13, but its closed-loop review work (E12.4) completes only after E13. It is the capstone that makes the canonical model sovereign and turns XLent into a complete model-development system. |
| E3 deferred | Lifecycle/registry is governance infrastructure needed when multiple users/models exist. Not blocking single-tenant + Sil integration. |
| E13 after E7–E11 | Model Review is the judgment layer that *consumes* findings, contracts, assurance, and CI. Those facts must exist before they can be judged. Review ≠ Assurance — it is recorded human decision, not the evidence ladder. |
| E14 after E11 | PDC generalizes the E11.1 seed corpus into a full mutation/ground-truth/release-gate system. It needs E0's AST for semantic mutation and E7's detectors as the system under test. It is XLent testing XLent — internal, never customer-facing. |
| E15 after E7+E9+E10+E2 | The Graph becomes a reasoning surface only once it can overlay findings (E7), assurance (E9), test coverage (E10), and semantic diff (E2). Focus/trace is the entry point; overlays and semantic diff build on it. Performance/scaling deferred until a real model outgrows the SVG DAG. |
