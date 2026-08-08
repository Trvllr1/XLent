# 14 — Model IDE: Capstone

**Status:** Strategic Product / Architecture Package
**Epic:** E12
**Designation:** XLent Capstone
**Source of record:** `docs/source/XLent-Model-IDE-Capstone.txt`
**Constitutional impact:** Proposed amendments M-01–M-10; not binding until adopted into the Engineering Constitution

> XLent is not merely a place to inspect models. It is where models are built, understood, debugged, changed, tested, reviewed, assured, versioned, and deployed.

## Executive Thesis

`.xlsx ≠ Model`. A spreadsheet is one representation of a computational model. The canonical model contains inputs, assumptions, formulas, dependencies, logic, constraints, outputs, tests, contracts, scenarios, state, and provenance.

E12 closes the round-trip problem: XLent can already understand and diagnose a model, but users currently leave XLent to remediate it. Model IDE adds the missing capability: **act on what XLent understands**.

```text
IMPORT → UNDERSTAND → DEBUG → REVIEW → EDIT → TEST → VALIDATE
       → VERSION → ASSURE → PUBLISH → DEPLOY → OPERATE
```

## Model Sovereignty

The canonical computational model—not its spreadsheet representation—is the primary editable, executable, testable, versionable, and deployable object.

```text
                 CANONICAL MODEL
             XMR · AST · GRAPH · RUNTIME
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
     Spreadsheet    Model IDE     API / Agent
    representation      │
                       ▼
                    ModelOps
```

Excel remains a first-class authoring surface, delivery format, stakeholder interface, and interchange format. It is not required for model existence and is not the authoritative computational object after import into XLent.

## Not Excel in a Browser

Excel asks: *what is in this cell?* Model IDE asks: *what is this component, what does it mean, what governs it, what depends on it, and what happens when it changes?*

Model IDE is model-native, not cell-native. XLent must not become a generic spreadsheet SaaS or permit unrestricted cell mutation.

## Canonical Mutation Layer

All human and agent edits pass through one governed architectural boundary:

```text
Human / Agent → Mutation Request → Canonical Model
                                  ├─ Validate
                                  ├─ Recalculate
                                  ├─ Targeted Tests
                                  ├─ Contract Checks
                                  ├─ Review / Impact Analysis
                                  └─ Evidence
                                            ↓
                                    Proposed State
                                            ↓
                                     Commit / Reject
```

No trusted actor bypasses this layer. A formula edit is a model mutation—not merely text editing. A material mutation is atomic, traceable, reversible, versioned, and evidence-preserving.

## Native Authoring and Semantic Refactoring

Users can create models without Excel: define inputs, assumptions, parameters, formulas, constraints, outputs, tests, and contracts directly in XLent. Native authoring enables governed templates containing structure, tests, contracts, assumptions, documentation, review rules, and scenarios.

Semantic refactoring includes rename, extract, replace, rewire, introduce, and remove. XLent previews affected formulas, graph edges, tests, contracts, scenarios, and outputs before commit.

## Formula and Structure Editing

The Structure Editor modifies semantic model components safely: add/remove/rename inputs and outputs, reorganize components, and modify relationships. Renames propagate across formulas, tests, contracts, and scenarios.

The Formula Editor provides syntax highlighting, AST validation, dependency and impact preview, reference validation, test/contract status, undo/redo, and version tracking.

## Human-Agent Symmetry

Humans and agents use equivalent governed mutation primitives wherever practical. Agents propose changes; the deterministic model engine evaluates them. Agents receive no privileged mutation pathway.

```text
Goal → Inspect → Hypothesis → Propose Mutation → Execute → Test
     → Review Evidence → Accept / Reject → Commit
```

Failure returns through semantic undo, a revised hypothesis, and another proposed mutation. This is Agent SWE for computational models.

## Debugger, Watches, and Breakpoints

Model IDE incorporates the debugging wedge: traces, watches, impact analysis, suspicious dependencies, formula/state comparison, and breakpoint-like conditions.

- **Watch:** observe components such as Revenue, EBITDA, FCF, Debt, IRR, and MOIC; explain deltas and root causes.
- **Breakpoint:** pause/inspect when a condition holds (e.g. Revenue > $100M, EBITDA margin < 15%, Debt < 0, specified assumption changed).
- **Trace:** traverse Output → Dependencies → Root Causes → Inputs/Assumptions.

## Review, Test, Contract, and Evidence Integration

A finding can produce a proposed mutation at its source. Relevant tests run from the affected graph, contracts are re-evaluated, impact is quantified, and the review state updates only when evidence shows the defect is resolved.

Targeted testing is preferred over blindly running every test after every change. Editing must preserve evidence continuity across versions: findings, tests, contracts, provenance, review status, assurance, rationale, and diff.

## Versioning, Undo, and Semantic Diff

Every meaningful mutation creates a traceable model state with author, timestamp, mutation, rationale, semantic diff, tests, review status, contract status, and evidence.

Undo/redo operates on an entire semantic transaction—not one cell. Semantic diff reports formula, dependency, structure, assumption, contract, test, and output changes.

## Scenario vs. Mutation

- **Scenario:** alternate state; does not change the canonical model.
- **Mutation:** proposed permanent change to the canonical model.
- **Defect mutation:** intentional corruption for internal PDC engineering.

These concepts must never be conflated.

## Export, Deployment, and Control Plane

Excel export reverses the traditional authority direction: Model → Excel. Export should preserve formulas, structure, metadata, provenance, version, selected evidence, and assumptions where possible.

Model IDE becomes the human/agent control plane across Design (edit/refactor/version), Quality (test/review/assure), and Runtime (execute/monitor/deploy). Deployment means making a validated model available as a controlled computational artifact—not saving a workbook somewhere.

## Proposed Constitutional Amendments

The source document proposes, but does not itself enact:

1. **M-01 Model Sovereignty** — canonical model is authoritative; spreadsheets are representations.
2. **M-02 Native Authoring** — models can be created/modified without external spreadsheet tools.
3. **M-03 Semantic Mutation** — material changes target the canonical model, not presentation artifacts.
4. **M-04 Controlled Mutation** — validate, recalculate, test, analyze impact, and version before acceptance.
5. **M-05 Human-Agent Parity** — equivalent governed primitives; no agent bypass.
6. **M-06 Closed-Loop Engineering** — Find → Understand → Change → Test → Review → Validate → Commit.
7. **M-07 Representation Independence** — models may originate from XLSX, XLent, API, agent, template, or another representation.
8. **M-08 Reversibility** — material mutations are traceable and reversible.
9. **M-09 Evidence Continuity** — editing never severs tests, contracts, findings, provenance, or review state.
10. **M-10 Execution Is Not Validation** — successful execution remains insufficient evidence of validity.

## Final Definition

> XLent Model IDE is the native development environment for computational models: a model-centric workspace in which humans and agents can create, inspect, debug, modify, refactor, test, review, validate, version, assure, publish, and deploy models while preserving the spreadsheet as a powerful representation and interchange paradigm.

**Model Review tells you what is wrong. Model IDE lets you do something about it. XLent is where the model lives.**
