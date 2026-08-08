# 00 — North Star

## Thesis

XLent is ModelOps infrastructure for spreadsheet models.

The spreadsheet is the world's most successful end-user programming environment. It combines data, formulas, business logic, assumptions, calculations, scenarios, outputs, and presentation in a single artifact. But the infrastructure around it never matured.

XLent does not replace the spreadsheet paradigm. It industrializes it — and, over time, offers a native authoring alternative alongside Excel.

> **Build XLent so that a model can be authored in Excel or in XLent's own editor, while always being a structured, testable, versioned, governable, API-accessible computational artifact.**

---

## Guiding Sentences

For any implementation decision, apply these tests:

1. **Does this make the model itself more first-class?** If yes → probably XLent. If it's generic AI chat, BI, or document management → probably elsewhere.

2. **Can a spreadsheet model move from authoring → testing → validation → versioning → publication → deployment → execution → monitoring without losing its spreadsheet-native semantics?** If yes → likely ModelOps.

3. **AI reasons; XLent executes.** The runtime produces deterministic, reproducible results with evidence. AI systems (Sil, agents) consume and interpret those results. XLent never hallucinates arithmetic.

4. **.xlsx ≠ Model.** An xlsx is one serialization. The XMR canonical representation is the model. Source formats are acquisition paths, not architectural boundaries. XLent can also produce xlsx as an export of the model.

5. **Sil is the first customer, not a dependency.** XLent must stand alone. Neither product should be technically coupled to the other.

---

## Proposition Evaluation — Decision Log

Every numbered section of the source strategy documents has been evaluated. This log records the verdict and rationale. The blueprint (docs 01–10) is the source of truth going forward.

### ACCEPTED — unchanged from source docs

| Proposition | Source | Rationale |
|---|---|---|
| .xlsx ≠ Model; XMR is the canonical layer | Supabase §2, §5 | Foundational. Already implemented in `types.ts`. |
| Deterministic execution: "AI reasons, XLent executes" | ModelOps §20 | Strongest competitive differentiator. Prevents LLM arithmetic hallucination. |
| Sil = first customer, not dependency | Supabase §18–22, ModelOps §21–24 | Already architecturally true (separate packages, API boundary). |
| Scoped acquisition over unrestricted access | Supabase §16 | Security-correct. Level-1 upload already works; connectors deferred. |
| Evidence-first: every execution traceable | ModelOps §15 | Core product promise. Partially implemented (Provenance type exists; full evidence record needed). |
| Not BI, not ChatGPT-for-Excel, not Excel replacement | Supabase §17, §23 | Guardrails. XLent occupies a distinct category. |
| 10 product principles | ModelOps §26 | Sound engineering principles; adopted verbatim. |
| Model Package as primary handoff artifact | Supabase §20, ModelOps §23 | Machine-readable package > PDF. |
| Flywheel: Sil encounters hard models → XLent improves | Supabase §22 | Active today via semiconductor cost models. |

### MODIFIED — accepted with architectural adjustment

| Proposition | Source | Modification | Rationale |
|---|---|---|---|
| Full XMR with entities, units, time dimensions, constraints | Supabase §5 | Evolve incrementally from current lean types. Add `xmrVersion` schema field. Populate `Calculation` + `normalizedFormula` (via AST) before adding units/time. | Current types are working and tested. Over-engineering the schema now blocks iteration. |
| Deliverable = Model Package | ModelOps §23, Supabase §20 | Extend existing `Deliverable` type (add `findings`, `test_results`, `evidence`, `assurance_summary`). Don't rename or rewrite. | Backward-compatible evolution; the existing type is already integrated with Sil. |
| Model Explorer as primary UI | Supabase §7 | Keep `@xlent/web` as exploration/debugging surface. Priority shifts to assurance (tests + evidence) over navigation polish. | Navigation already works; the differentiator is verification, not yet another tree view. |
| Formula surface coverage | Supabase §6, ModelOps implicit | Parse 100% to AST (even unsupported functions). Execute supported subset. Report function-level compatibility. | Decouples parse coverage (confidence signal) from execution coverage (runtime correctness). |

### RE-SEQUENCED — accepted but execution order changed

| Proposition | Source order | New position | Rationale |
|---|---|---|---|
| Model testing & evidence | Phase 2 (after full explorer) | **E1** (immediately after E0 AST) | Assurance is the core differentiator AND the biggest current gap. Pull forward. |
| Versioning & diff | Phase 3 (after full assurance) | **E2** (after E1) | Semantic diff requires AST (E0); evidence records (E1) provide baseline for snapshot. Natural sequence. |
| Model Registry | Phase 3 | **E3** (after versioning) | Registry without versioned models is empty bookkeeping. |
| SDK/CLI extraction | Not explicitly sequenced | **E5** (after Prod API stabilizes in E3) | SDK consumers need stable contracts. |

### DEFERRED — recognized as valuable, not near-term

| Proposition | Source | Deferral rationale | Design status |
|---|---|---|---|
| Model CI (automated test gates on commit) | Supabase §9, ModelOps §10 | Requires versioning + tests + publish flow to exist first. No real-world usage pattern yet. | Design notes in doc 05. |
| Model hosting / execution-as-a-service | ModelOps §12 | Current architecture (local SQLite, Hono) is sufficient for single-tenant and Sil integration. Multi-tenant hosting is a product decision, not an engineering dependency. | Deferred to post-Series-A or first enterprise customer. |
| Enterprise connectors (SharePoint, OneDrive, S3) | Supabase §16 | Level-1 upload is adequate for current workflows. Connector security model needs design. | Design notes in doc 05; implementation post-E5. |
| Model monitoring / drift detection | ModelOps §19 | Requires deployed production models with execution history. No data to monitor yet. | Concept only. |
| Branching (forked model state) | Supabase §11, ModelOps §8 | Scenarios (already working) cover the near-term need. Full branching = parent-snapshot + delta-set architecture; designed in doc 05, implementation post-E5. | Designed, not scheduled. |
| Multi-user governance (approval chains, permissions) | ModelOps §18 | Single-user/team usage currently. Premature without registry adoption. | Lifecycle states designed; ACL layer deferred. |

---

## Architectural Test Questions

Before adding any feature, ask:

1. Does it make the **model** more first-class? (Not the workbook, not the UI, not the chat.)
2. Does it maintain **determinism**? (Same model + inputs + scenario = same outputs, always.)
3. Does it produce or consume **evidence**? (If it neither creates nor uses structured proof, it may belong in the AI layer, not XLent.)
4. Can it work **without Sil**? (If it only makes sense inside Sil, it's a Sil feature.)
5. Does it respect the **parse ≠ execute** boundary? (Parsing gives visibility; execution gives results. Both are valuable independently.)
6. Does it distinguish **execution from validity**? (A model that runs is not necessarily correct — Constitution Rule 8.)
7. Does it preserve the **inference ≠ authority** boundary? (AI-derived or workbook-inferred rules must not silently become requirements — Constitution Rule 12.)

---

## Engineering Constitution Conformance

The Engineering Constitution (`source/XLent-Engineering-Constitution.txt`) defines 25 binding implementation rules and 18 agent-engineering rules. The table below maps each constitutional rule to its implementation status.

### Implementation Rules (Constitution §50)

| # | Rule | Status | Evidence |
|---|---|---|---|
| 1 | The model is the product | ✅ | XMR types, slug identity, Model ≠ xlsx separation throughout |
| 2 | Excel remains a first-class authoring surface | ✅ (amended) | Import/interchange remains first-class; Model IDE (E12, doc 14) makes the canonical model authoritative without silently mutating XLSX or rebuilding Excel in a browser. |
| 3 | XMR is the abstraction layer | ✅ | `types.ts` Model/Parameter/Output/Calculation, parser produces XMR |
| 4 | Treat spreadsheets as applications | ✅ | Graph, runtime, tests, scenarios, versioning |
| 5 | Debug before beautifying | 🔲 E7 | Debugging Core epic; graph tracing exists, structured findings needed |
| 6 | Every meaningful model should be testable | ✅ | `testRunner.ts`, auto-generated structural tests, assertion framework |
| 7 | Every bug fix requires a regression test | 🔲 E10 | Framework exists; enforcement via Model CI not yet implemented |
| 8 | Successful execution is not validity | ✅ | Separate runtime/tests/assurance; execution ≠ approval |
| 9 | Never declare valid solely because it executes | ✅ | AssuranceSummary requires test evidence; no auto-approval |
| 10 | Distinguish verification from validation | 🔲 E9 | Test categories exist; explicit V&V labeling needed in findings |
| 11 | Model intent must be explicit | 🔲 E8 | Model Contract type + API not yet implemented |
| 12 | Inference is not authority | ✅ | `autoGenerated` flag, `confidence` field, discovery is advisory |
| 13 | Deterministic execution must remain deterministic | ✅ | No eval/Function/LLM in runtime; topological evaluation |
| 14 | Every important result should have provenance | ✅ | Evidence records, execution tracing, sourceCell refs |
| 15 | Every assumption should have impact visibility | 🟡 | Sensitivity analysis exists; full downstream impact tracing → E7 |
| 16 | Models must be reproducible | ✅ | Evidence checksums, deterministic runtime |
| 17 | Models must be versionable | ✅ | Slug + semver + snapshots |
| 18 | Model changes must be inspectable | ✅ | `diff.ts` — interim normalization; AST-based semantic diff → E0 |
| 19 | Scenarios ≠ workbook proliferation | ✅ | Scenario objects, parameter overrides, comparison engine |
| 20 | Assurance must expose uncertainty | 🔲 E9 | UNASSESSED state not yet in AssuranceStatus |
| 21 | Never turn confidence into truth | ✅ | Assurance is structured claim + evidence, not a score |
| 22 | Explain defects in terms of impact | 🔲 E7 | Findings exist but lack downstream impact quantification |
| 23 | Prefer model-level abstractions | ✅ | Architecture design principle; no workbook-specific hacks |
| 24 | Preserve semantics during transformation | ✅ | Parser preserves formulas; runtime doesn't alter model |
| 25 | Sil is a customer, not a dependency | ✅ | Separate packages, API boundary, no Sil imports in XLent |

### Agent Engineering Rules (Constitution §53)

All 18 agent rules are adopted as binding development practice. Key rules operationally verified:

- Rule 3 (no LLM as calc engine): runtime uses topological eval only
- Rule 6 (every bug fix → regression test): framework ready; enforcement via E10
- Rule 7 (every parser capability → fixture): 10 realistic fixtures exist; intentional-defect corpus → E11
- Rule 16 (evidence as first-class artifact): EvidenceRecord type + API + storage implemented

---

## Version

| Field | Value |
|---|---|
| Blueprint version | 1.1.0 |
| Last updated | 2026-08-06 |
| Derived from | `source/XLent-Lessons-from-Supabase.txt`, `source/XLent-ModelOps.txt`, `source/XLent-Engineering-Constitution.txt` |
| Authority | This document + Engineering Constitution govern XLent. Blueprint for product; Constitution for engineering invariants. |
