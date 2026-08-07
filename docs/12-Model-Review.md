# 12 — Model Review

**Status:** Product & Engineering Specification (capability layer)
**Applies to:** XLent Core, ModelOps, Model Assurance, Runtime, Integrations, Domain Packs
**Source of record:** `docs/source/XLent-Model-Review.txt` (full normative text)
**Related:** Engineering Constitution (assurance semantics, AI-authority rules); docs `04` (Runtime & Verification), `05` (ModelOps Lifecycle), `08` (Roadmap E13)

> A spreadsheet model should be reviewable with the rigor developers apply to software — without requiring the reviewer to become a programmer.

Model Review translates software-engineering review discipline into a model-native workflow. It sits **between Engineering and Assurance**:

- **Engineering** establishes what the model *is* and *does* (facts).
- **Review** evaluates whether that behavior is *acceptable* (judgment).
- **Assurance** records the *evidence* supporting the determination.

```text
INTENT → CONTRACT → ENGINEERING → REVIEW → DECISION → ASSURANCE → RELEASE
                        (facts)   (acceptability)        (evidence)
```

Model Review is **not** spreadsheet auditing. Auditing (formula errors, broken refs, hardcodes, links, formatting) is a *component*; Review evaluates the model as a computational system — structure, computation, business logic, assumptions, dependencies, outputs, scenarios, behavioral consistency, materiality, change, tests, exceptions, evidence, and reviewer judgment.

---

## The Model Review Object

A persistent artifact bound to a specific model version, surviving the session and joining the model's lifecycle history:

```text
MODEL REVIEW
  Model · Version · Review date · Owner · Reviewer(s)
  Status: IN REVIEW
  Model Health: 91/100            (summary only — never a validity verdict)
  Tests: 48/50 PASS
  Findings: 7 OPEN · 3 RESOLVED · 2 ACCEPTED EXCEPTIONS
  Assurance: PENDING
```

## Canonical Review Lifecycle (risk-sensitive)

```text
SUBMIT → DISCOVER → INSPECT → REVIEW → FINDINGS → RESOLVE → TEST → VERIFY → ASSURE → APPROVE → RELEASE
```

Not every model needs every stage. A personal model may be `Inspect → Review → Approve`; a board model the full chain; a production API model the complete lifecycle.

- **Discover** — reconstruct the model (sheets, formulas, I/O, named ranges, links, dependencies, patterns, types, graph, complexity). Answer *"What am I reviewing?"* before *"Is it correct?"*
- **Inspect** — automated examination producing *findings, not verdicts*. Classes: structural, formula, dependency, semantic.
- **Review** — convert machine observations into human judgment: *"Does this matter?"* and *"Is this intended?"*

## Finding Taxonomy (MUST distinguish)

| Class | Meaning | Example |
|---|---|---|
| **Anomaly** | Deviation from an expected pattern — not necessarily an error | Formula differs from neighbors |
| **Finding** | Observation requiring reviewer attention | Revenue growth formula deviates from established pattern |
| **Defect** | A finding that violates an established model requirement | 2030 forecast omits the contracted growth assumption |
| **Exception** | A deviation intentionally accepted by the reviewer | 2030 growth intentionally lower (capacity constraint) |
| **Failure** | A required property/test not satisfied | Balance sheet does not reconcile |
| **Informational** | Understanding aid; no remediation required | — |

This taxonomy exists so XLent never declares every anomaly a "bug."

## Finding States (controlled; never silently disappear)

```text
OPEN → INVESTIGATING → RESOLVED / ACCEPTED EXCEPTION / REJECTED / DEFERRED
```

Every disposition preserves: who, when, why, supporting evidence, affected model version. Reviewers attach comments + evidence to findings and model elements — turning institutional knowledge into a persistent model artifact.

## Relationship to the Model Contract

Review cannot judge correctness without a representation of intent. The **Model Contract** (E8) defines intended behavior — inputs, outputs, constraints, invariants, rules, relationships, assumptions, units, tolerances, permitted exceptions, prohibited conditions. The loop:

```text
CONTRACT (intended) → EXECUTION (actual) → REVIEW (intent vs. implementation)
```

**Central question:** does the executable model behave according to its declared intent? Decomposed into structural, computational, logical, behavioral, domain, and operational validity.

## Model Diff (the pull-request equivalent)

Version-aware comparison establishing *semantic impact*, not just "cell F82 changed": what changed, why, what it affected, was it intentional. Reviewers must see output deltas (e.g. IRR 24.7% → 21.3%), the primary driver, and the formula change behind it.

## Materiality & Impact Analysis

Distinguish trivial from material findings — by affected output, financial magnitude, dependency depth, decision consequence, model criticality, sensitivity, regulatory requirement, user thresholds. Every meaningful finding traces downstream (Wrong Assumption → Revenue → EBITDA → Cash Flow → Debt → Exit → IRR). The reviewer sees *"this finding affects these outputs."* This is the core difference from cell-centric auditing.

## Review / Verification / Validation / Assurance (MUST remain distinct)

- **Verification** — did we implement the model correctly per its specification?
- **Validation** — is the model appropriate for its intended real-world purpose?
- **Review** — has a qualified reviewer judged it acceptable?
- **Assurance** — can we substantiate that determination with evidence?

`Verification ≠ Validation ≠ Review ≠ Assurance.` They cooperate; they cannot collapse into one score.

## AI's Role (Constitution-aligned)

AI may explain formulas, summarize dependencies, propose findings, suggest tests, translate findings into domain language. AI must **not** declare a model valid, dismiss findings, rewrite business logic, approve models, fabricate evidence, or substitute probabilistic reasoning for deterministic execution.

> AI assists review. Evidence establishes review. Humans retain authority over consequential judgment.

## Score, Approval, and Non-Permanence

- A health/review score (e.g. `91/100`) summarizes conditions but is **never** a validity verdict; the UI must always expose underlying evidence.
- Approval is an **explicit state**: `DRAFT · IN REVIEW · CONDITIONAL · APPROVED · APPROVED WITH EXCEPTIONS · REJECTED · SUPERSEDED · RETIRED`, with metadata (reviewer, role, date, version, scope, tests, exceptions, assurance status). Approval binds to a *specific version + defined scope*.
- **No permanent validity** — a change, assumption change, or requirement change triggers `REASSESS`. Validity is versioned and contextual.

## Review Principles (binding)

1. **No Silent Mutation** — proposals create a new revision, re-tested and re-reviewed; original evidence stays intact.
2. **No Silent Approval** — no AI "looks good" constitutes approval; approval is explicit action under policy.
3. **Evidence Before Judgment** — Decision → Finding → Evidence → Execution → Model must be navigable.
4. **Intent vs. Execution** — every serious review compares INTENDED → IMPLEMENTED → OBSERVED → ACCEPTED?

## Product Surface & API

The Review tab is where XLent's underlying capabilities converge (not an isolated tool). Workspace: `Overview · Structure · Graph · Assumptions · Outputs · Findings · Tests · Contract · Versions · Diff · Evidence · Review · Assurance`.

Every review exports as a machine- and human-readable `ModelReview` artifact (`model_id, model_version, review_id, scope, reviewer(s), findings[], tests[], exceptions[], evidence[], decisions[], approvals[], assurance_state, timestamp`) — consumable by agents, auditors, and enterprise systems.

Planned API (see Roadmap E13):

```text
POST /models/{id}/reviews
GET  /models/{id}/reviews
GET  /models/{id}/reviews/{review_id}
POST /reviews/{review_id}/findings
POST /reviews/{review_id}/approve
POST /reviews/{review_id}/reject
```

## Roles, Policies, Automation, Runtime

- **Roles:** Model Owner, Author, Reviewer, Domain Reviewer, Technical Reviewer, Approver, Auditor. Critical models may require separation of duties.
- **Policies:** org-defined review thresholds (e.g. ">$100M exposure requires independent review"; "any IRR-affecting change requires regression testing").
- **Automation:** XLent auto-determines review rigor from model characteristics (complexity, materiality, external data, production deployment).
- **Runtime loop:** Review → Approval → Deployment → Monitoring → New Finding → Re-review — Review is continuous, not merely pre-release.

## Relationship to existing work

Model Review is the **judgment layer above** the capabilities already built — findings (E7), contract intent (E8), assurance ladder (E9), behavioral CI (E10), execution monitoring (E11). Those supply the facts and evidence; Review turns them into a recorded, evidence-backed human decision. Implementation is sequenced as **Roadmap E13**. Review must not be folded into the Assurance view — Review and Assurance are constitutionally distinct.
