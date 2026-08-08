# 01 — Product Blueprint

## Product Definition

XLent is infrastructure for building, validating, operating, versioning, and deploying computational models originating from spreadsheets.

It makes spreadsheet models behave like software — without requiring users to abandon the spreadsheet paradigm.

---

## Personas

| Persona | Role | Uses XLent for |
|---|---|---|
| **Model Author** | Finance analyst, engineer, actuary | Continues authoring in Excel; benefits from verification feedback and version tracking |
| **Model Consumer** | AI agent, application, decision-maker | Invokes model via API/SDK; receives structured results + evidence |
| **Model Steward** | Risk officer, FP&A lead, audit | Reviews test results, approves publication, maintains registry |
| **Platform Integrator** | Engineering team (e.g., Sil) | Builds on XLent API/SDK; receives deliverables via webhook |

---

## Capability Map

18 capabilities organized by lifecycle stage. Status reflects verified implementation state as of 2026-08-06.

### Import & Reconstruction

| # | Capability | Status | Notes |
|---|---|---|---|
| 1 | XLSX Import | ✅ Done | `parser.ts` — xlsx lib, formula extraction, multi-sheet |
| 2 | Model Discovery | ✅ Done | `discovery.ts` — auto-classifies inputs/outputs, compatibility scan |
| 3 | Workbook Structure Extraction | ✅ Done | Sheets, cells, named ranges, cross-sheet refs, hidden elements (partial) |

### Representation & Analysis

| # | Capability | Status | Notes |
|---|---|---|---|
| 4 | Canonical Model (XMR) | ✅ Done | `types.ts` — Model, Parameter, Output, Calculation, Graph |
| 5 | Dependency Graph | ✅ Done | `graph.ts` — DAG construction, root/terminal detection, cycle detection |
| 6 | Formula AST | 🔴 Planned (E0) | Currently regex-based; needs proper AST for semantic diff + interpreter |
| 7 | Model Explorer (UI) | ✅ Done | `@xlent/web` — upload, list, view, run, compare |

### Assurance & Evidence

| # | Capability | Status | Notes |
|---|---|---|---|
| 8 | Deterministic Execution | ✅ Done | `runtime.ts` — topological eval, ~30 functions, no eval() |
| 9 | Scenario Execution | ✅ Done | `scenario.ts` — parameter overrides, comparison with deltas |
| 10 | Model Tests | ✅ Done | `testRunner.ts` — structural + assertion tests, auto-generated suites |
| 11 | Evidence Records | ✅ Done | Full execution evidence: inputs, outputs, tests, timestamp, checksums |
| 12 | Sensitivity Analysis | ✅ Done | `sensitivity.ts` — one-at-a-time sweep + impact ranking |

### Model Operations

| # | Capability | Status | Notes |
|---|---|---|---|
| 13 | Model Identity | ✅ Done | UUID + human-readable slug + semver (slug-based routing in API) |
| 14 | Versioning & Snapshots | ✅ Done | Semantic versioning, snapshot persistence, re-import reconciliation |
| 15 | Semantic Diff | ✅ Done | `diff.ts` — interim normalization-based diff; AST-based upgrade → E0 |
| 16 | Lifecycle States & Registry | 🔴 Planned (E3) | States: draft/sandbox/validated/approved/published/deprecated |

### Integration & Deployment

| # | Capability | Status | Notes |
|---|---|---|---|
| 17 | Model API | ✅ Done | Hono REST API, full CRUD + execution + deliverables |
| 18 | SDK / Client | ✅ Done | `XLentClient` in `@xlent/core`; `xlentClient.ts` in Sil |
| 19 | CLI | 🔴 Planned (E5) | `@xlent/cli` — import, run, test, diff, export, package |
| 20 | Webhook Delivery | ✅ Done | Client registration, retry logic, delivery audit |
| 21 | Prod API (versioned, rate-limited) | 🔴 Planned (E3) | `/v1` prefix, version-pinned execution, idempotency, auth scopes |

### Deferred → Constitutional Epics

| # | Capability | Status | Notes |
|---|---|---|---|
| 22 | Model Branching | 📐 Designed | Branch = parent snapshot + delta set; implementation post-E5 |
| 23 | Model CI | 📐 Designed → E10 | Automated test gates on model change; requires E1+E2+E3 |
| 24 | Enterprise Connectors | ⏸️ Deferred | SharePoint, OneDrive, Google Drive, S3 |
| 25 | Model Hosting / Multi-tenant | ⏸️ Deferred | Cloud execution service |
| 26 | Model Monitoring | ⏸️ Deferred → E11 | Drift detection, execution anomalies, corpus health |
| 27 | Model Lineage | ⏸️ Deferred | Full source → assumption → output → decision tracing |
| 28 | Debugging Core | 📐 Designed → E7 | Graph tracing, structured findings, impact quantification |
| 29 | Model Contract & Intent Authority | 📐 Designed → E8 | ModelContract type, explicit intent, inference ≠ authority boundary |
| 30 | Assurance Ladder | 📐 Designed → E9 | Validity semantics: UNASSESSED → TESTED → VERIFIED → VALIDATED |
| 31 | Model Editor (Structure) | 📐 Designed → E12 | Add/remove/rename params+outputs in web UI; XMR-native editing |
| 32 | Model Editor (Formulas) | 📐 Designed → E12 | Syntax-aware formula editing with live dependency preview and inline diagnostics |
| 33 | Agent-Mediated Editing | 📐 Designed → E12 | Programmatic edit API; agents propose changes, engine validates |
| 34 | xlsx Export (Round-Trip) | 📐 Designed → E12 | Generate .xlsx from XMR; models can live entirely in XLent |
| 35 | Canonical Mutation Layer | 📐 Designed → E12 | Shared human/agent preview → validate → test → evidence → commit/reject boundary |
| 36 | Semantic Refactoring | 📐 Designed → E12 | Rename/extract/replace/rewire/introduce/remove with impact preview and atomic undo |
| 37 | Model Debugger | 📐 Designed → E12 | Trace, watches, impact/state comparison, deterministic model breakpoints |
| 38 | Native Model Creation & Templates | 📐 Designed → E12 | Create governed models without Excel; templates include contracts/tests/review rules |
| 39 | Model Interaction Protocol | 📐 Designed → E12 | Human-agent parity over equivalent governed mutation primitives |

---

## What NOT to Build

These are explicitly out of scope. They represent traps that dilute focus.

| Anti-pattern | Why it's wrong for XLent |
|---|---|
| "ChatGPT for Excel" | Too generic. XLent is infrastructure, not a chatbot. |
| "AI spreadsheet summarizer" | Too shallow. Summaries without verification are worthless. |
| "Another BI platform" | Wrong category. BI asks "what happened?" — XLent asks "can I trust this model?" |
| "Excel replacement" | Strategically dangerous. Excel remains a first-class authoring/interchange surface; XLent is model-native and makes the canonical model sovereign rather than rebuilding a cell-grid application. |
| "Database connector with spreadsheet support" | Wrong center of gravity. The model is primary, not the data source. |
| "Spreadsheet visualization tool" | Insufficient differentiation. Model Explorer exists to support verification, not to compete with Tableau. |
| "Generic ETL/data pipeline" | XLent transforms models, not data. |

---

## Product Principles

Adopted from source docs, encoding as implementation constraints:

1. **The model is the product.** Not the workbook file.
2. **Excel remains a first-class authoring surface.** Never force paradigm abandonment. XLent's Model Editor is a second authoring surface — models can originate in either. XLent never silently mutates an external xlsx the user didn't ask to change.
3. **XMR is the abstraction layer.** Source formats become model representations.
4. **Every model should be testable.** "Looks right" is not sufficient for production.
5. **Every published model should be identifiable.** Filenames are not identity.
6. **Every deployed model should be reproducible.** Model + inputs + scenario → same result, always.
7. **Every important output should be traceable.** Result → calculation → assumption → source.
8. **AI should not be the execution engine.** AI reasons; XLent deterministically executes and verifies.
9. **Access should be scoped.** Prefer targeted model acquisition over unrestricted org data access.
10. **Sil is an integration, not a dependency.** XLent must stand independently.
