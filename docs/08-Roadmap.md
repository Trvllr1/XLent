# 08 — Roadmap

## Epic Sequence

```
COMPLETED:  E1 ──▶ E2 ──▶ E4 ──▶ E5 (Model Package v2, SDK scaffolded)
            Tests   Version Runtime  Package
            Evidence Diff    Depth    Delivery

OUTSTANDING DEBT:
            E0 (Formula AST) — blocks semantic diff upgrade and extended function coverage

NEXT (Constitutional Epics):
            E7 ──▶ E8 ──▶ E9 ──▶ E10 ──▶ E11
            Debug   Contract Assurance  CI     Corpus
            Core    Intent   Ladder     Gates  Monitor

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

## Sequencing Rationale

| Decision | Rationale |
|---|---|
| E0 outstanding debt | AST is prerequisite for semantic diff upgrade and extended function coverage, but current regex approach works for existing models. Pay when E7/E9 demand it. |
| E1–E5 completed first | Tests, evidence, versioning, diff, sensitivity, and package delivery form the operational foundation. |
| E7 before E8 | Debugging produces findings; contracts consume findings. Build the finding system first. |
| E8 before E9 | Assurance Ladder's VALIDATED gate requires a contract. Define contracts before defining the gate. |
| E9 before E10 | CI gates enforce assurance levels. Define the levels before automating enforcement. |
| E10 before E11 | Behavioral tests validate corpus fixtures. Build the test types before building the corpus. |
| E3 deferred | Lifecycle/registry is governance infrastructure needed when multiple users/models exist. Not blocking single-tenant + Sil integration. |
