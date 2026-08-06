# 05 — ModelOps Lifecycle

## Model Identity

### Current State

Models are identified by UUID (`id`) and a `name` derived from the uploaded filename. The `version` field is an integer that increments on re-import.

### Target State (E2)

Every managed model gains a durable identity independent of its filename:

```typescript
{
  id: "uuid-...",                       // Internal, immutable
  slug: "acme-fy27-operating-model",    // Human-readable, unique, URL-safe
  semver: "3.2.0",                      // Semantic version
  name: "Acme FY27 Operating Model",    // Display name
  status: "published",                  // Lifecycle state
  owner: "finance-team",                // Ownership
  tags: ["forecast", "fy27", "board"]   // Discovery metadata
}
```

**Slug rules:**
- Lowercase alphanumeric + hyphens
- Unique within the registry
- Assigned on first import (auto-generated from filename, user-editable)
- Immutable once published (prevents breaking consumers)

**Semver rules:**
- Patch (3.2.x): parameter value changes, cosmetic formula changes
- Minor (3.x.0): new parameters, new outputs, formula logic changes
- Major (x.0.0): structural changes (removed parameters, changed output semantics)
- Auto-suggested based on diff classification; user confirms

---

## Versioning

### Snapshots

A snapshot is an immutable capture of the full model state at a point in time.

```typescript
interface ModelSnapshot {
  id: string;
  modelId: string;
  slug: string;
  semver: string;
  createdAt: string;
  status: ModelStatus;
  data: Model;                          // Complete XMR at snapshot time
  workbookChecksum: string;             // SHA-256 of original .xlsx
  evidenceId?: string;                  // Evidence record from publish-gate execution
}
```

**When snapshots are created:**
- On every import/re-import (automatic)
- On explicit version bump (user action)
- On publish (frozen, immutable)

**Storage:** Snapshots are stored in SQLite as JSON blobs alongside the model record. Published snapshots are immutable — the model record itself can evolve (draft state), but a published snapshot never changes.

---

## Semantic Diff & Migration Reports

### Diff Engine (E2)

Compares two model versions structurally, using ASTs where available.

```typescript
interface ModelDiff {
  fromVersion: string;                  // semver
  toVersion: string;

  // Parameter changes
  parametersAdded: Parameter[];
  parametersRemoved: Parameter[];
  parametersModified: ParameterDiff[];

  // Formula changes (AST-based when available)
  formulasChanged: FormulaDiff[];

  // Output changes
  outputsAdded: Output[];
  outputsRemoved: Output[];
  outputsModified: OutputDiff[];

  // Impact assessment (requires execution)
  impactSummary?: {
    outputDeltas: ComparisonRow[];
    primaryDrivers: string[];           // Parameter IDs most responsible for output changes
  };

  // Classification
  suggestedBump: 'patch' | 'minor' | 'major';
  reasoning: string;
}

interface FormulaDiff {
  cell: CellAddress;
  before: { formula: string; ast?: FormulaAST; normalizedFormula?: string };
  after: { formula: string; ast?: FormulaAST; normalizedFormula?: string };
  semantic: boolean;                    // true = logic changed; false = ref-style/formatting only
  functionsAdded: string[];
  functionsRemoved: string[];
}
```

**Semantic vs. cosmetic changes:**
- `=A1+B1` → `=$A$1+$B$1` → cosmetic (ref-style change)
- `=A1+B1` → `=A1+B1+C1` → semantic (logic change)
- `=SUM(A1:A5)` → `=SUM(A1:A10)` → semantic (range change)

The AST makes this distinction possible. Regex text diff cannot.

### Migration Report

A human-readable summary generated from `ModelDiff`:

```
MODEL MIGRATION: acme-fy27-operating-model
v3.1.0 → v3.2.0 (minor)

ADDED:
  + Parameter: Churn Rate (Sheet1!C8)

MODIFIED:
  ~ Formula: Revenue (Sheet2!D12)
    Before: =Units * Price
    After:  =Units * Price * (1 - ChurnRate)
  ~ Formula: COGS (Sheet2!D15)
    Before: =Units * UnitCost
    After:  =Units * UnitCost * 1.03

REMOVED:
  - Parameter: Manual Adjustment (Sheet1!C15)

IMPACT (baseline inputs):
  EBITDA:  $4.2M → $3.85M (↓8.4%)
  IRR:     31.5% → 28.4% (↓3.1pp)

PRIMARY DRIVER: Churn Rate addition

SUGGESTED VERSION: 3.2.0 (minor — new parameter, formula logic changes)
```

---

## Lifecycle States

```
┌─────────┐     ┌─────────┐     ┌───────────┐     ┌──────────┐     ┌───────────┐     ┌────────────┐
│  DRAFT  │────▶│ SANDBOX │────▶│ VALIDATED │────▶│ APPROVED │────▶│ PUBLISHED │────▶│ DEPRECATED │
└─────────┘     └─────────┘     └───────────┘     └──────────┘     └───────────┘     └────────────┘
     │                                                                     │
     └─────────────────────────────────────────────────────────────────────┘
                              (new version starts as draft)
```

| State | Meaning | Allowed operations | Transition trigger |
|---|---|---|---|
| **Draft** | Work in progress; editable | Import, re-import, override params, run scenarios | Automatic on import |
| **Sandbox** | Isolated testing environment; safe to experiment | Run, test, scenario, compare; no delivery | User promotes from draft |
| **Validated** | All required tests pass | Run, test, compare; no modification | All model tests pass |
| **Approved** | Human or automated sign-off | Read-only; pending publish | Steward approves |
| **Published** | Immutable, available to consumers | Execute (version-pinned), deliver, API access | Steward publishes |
| **Deprecated** | Superseded; consumers should migrate | Read-only; warnings on execution | Steward deprecates |

**Publish gate (E3):**
- All model tests must pass
- Evidence record generated and stored
- Snapshot created and frozen
- Status transitions to Published
- Model becomes available for version-pinned execution

---

## Registry

The Model Registry provides an organizational inventory of managed models.

### Registry Entry

```typescript
interface RegistryEntry {
  slug: string;
  name: string;
  currentVersion: string;               // Latest published semver
  latestDraft?: string;                 // Latest draft semver (if exists)
  status: ModelStatus;
  owner: string;
  consumers: string[];                  // Client IDs that have received deliveries
  lastPublished?: string;               // ISO 8601
  lastValidated?: string;
  testCount: number;
  testPassRate: number;                 // 0.0–1.0
  tags: string[];
}
```

### Registry Operations

| Operation | Description |
|---|---|
| List | All models with status, version, owner |
| Search | By slug, tag, owner, status |
| Get history | All versions of a model with diffs between adjacent versions |
| Get consumers | Which clients consume this model |
| Get dependencies | Which other models this model references (future) |

---

## Re-Import Reconciliation (Two-Lives Problem)

### The Problem

The model has two lives:
1. **Authoring life** — Excel, where the human edits cells, changes formulas, updates assumptions
2. **Governed life** — XLent, where the model is versioned, tested, published

After initial import, the author continues editing in Excel. Re-importing the modified xlsx must be reconciled with the governed state.

### Design Principles

1. **XLent never modifies the xlsx.** The authoring artifact is owned by the author.
2. **Re-import creates a new draft version.** It does not overwrite published versions.
3. **The diff engine shows what changed.** The steward decides whether to promote.
4. **Published versions are immutable.** A re-import is a new version candidate, not an edit.
5. **Consumers pin to a version.** They are unaffected by re-imports until explicitly migrated.

### Re-Import Flow

```
Author edits .xlsx
       │
       ▼
Re-import to XLent ──────── POST /models/:id/reimport (or POST /models/import with same slug)
       │
       ▼
Parser produces new XMR
       │
       ▼
Diff engine compares ────── new XMR vs. latest snapshot
       │
       ▼
Draft version created ───── status: 'draft', semver: auto-suggested
       │
       ▼
Migration report generated
       │
       ▼
Tests re-run on new version
       │
       ▼
Steward reviews ─────────── diff + test results + impact summary
       │
       ├── Approve → Publish (new version available)
       │
       └── Reject → Draft remains; published version unchanged
```

### Conflict Scenarios

| Scenario | Resolution |
|---|---|
| Author adds a parameter | New draft has the parameter; published version doesn't; consumers unaffected until migration |
| Author removes a parameter | Diff flags removal; major version bump suggested; consumers on old version continue working |
| Author changes formula logic | Semantic diff detects change; impact assessment shows output movement; steward decides |
| Author only reformats | Cosmetic diff; no semantic change; patch version; auto-promotable |
| Two re-imports in rapid succession | Each creates a draft; only one can be promoted; other remains as historical draft |

### Future: Continuous Sync (Deferred)

A connector-based model could detect xlsx changes and auto-trigger re-import. This is deferred until:
- Enterprise connectors are built (post-E5)
- The re-import flow is proven with manual uploads
- A customer explicitly needs it

---

## Branching (Designed, Implementation Deferred)

### Design

A branch represents a model variation that inherits from a parent snapshot and records only its differences.

```typescript
interface ModelBranch {
  id: string;
  modelId: string;
  name: string;                         // e.g., 'investor_case', 'downside'
  parentSnapshot: string;               // Snapshot ID this branch inherits from
  overrides: ScenarioOverride[];        // Parameter differences from parent
  formulaOverrides?: FormulaPatch[];    // Formula changes (future)
  createdAt: string;
  createdBy?: string;
}
```

**Branch vs. Scenario:**
- A **Scenario** is a single execution with parameter overrides. Ephemeral.
- A **Branch** is a persistent, named variation that can itself be versioned, tested, and published.

**Why deferred:**
- Scenarios (already working) cover 90% of the near-term need (base/upside/downside cases)
- Branches require the full versioning + diff infrastructure (E2) plus formula-level overrides
- No current customer has requested persistent branches beyond what scenarios provide

**Implementation trigger:** When a user needs to *modify formulas* (not just parameters) between cases, or needs to version/publish a branch independently.

---

## Model CI (Designed, Implementation Deferred)

### Concept

```
Model change (re-import)
       │
       ▼
Auto-run model tests
       │
       ├── ALL PASS → auto-promote to Validated
       │
       └── ANY FAIL → block; notify steward
```

### Prerequisites (all must exist first)
- Model tests (E1) ✓ designed
- Versioning + snapshots (E2) ✓ designed
- Lifecycle states + publish gate (E3) ✓ designed
- Re-import reconciliation flow (above) ✓ designed

### Why deferred
- No production models with test suites exist yet
- The manual review flow (steward inspects diff + tests) is more appropriate for initial adoption
- CI is an optimization of an already-working manual process

### Implementation trigger
When a model has a stable test suite AND frequent re-imports AND the steward trusts auto-promotion for patch-level changes.

---

## Constitutional Alignment

This document implements the following constitutional requirements:

| Constitution Section | Requirement | Implementation |
|---|---|---|
| §§15–17 (Model Contract) | Model intent must be explicit; contracts override inference | ModelContract type governs VALIDATED gate (E8) |
| §§18–20 (Authority) | Contract > Structure > Inference > Metadata | Authority hierarchy in discovery + reconciliation (E8) |
| §§22–25 (Assurance) | Validity progression: UNASSESSED → TESTED → VERIFIED → VALIDATED | Lifecycle states map to assurance ladder (E9) |
| §50 Rule 11 | Model intent must be explicit | Contract-required for VALIDATED status |
| §50 Rule 12 | Inference is not authority | Auto-discovered facts marked `autoGenerated`; contract overrides |
| §50 Rule 17 | Models must be versionable | Slug + semver + snapshots + diff |
| §50 Rule 18 | Model changes must be inspectable | Semantic diff engine + migration reports |
| §50 Rule 19 | Scenarios ≠ workbook proliferation | Scenario = parameter overrides; Branch = persistent variation (deferred) |
