# 03 — XMR Spec

XLent Model Representation (XMR) is the canonical type system that represents a spreadsheet model independently of its source format.

---

## Design Principles

1. **Source-format independence.** XMR represents the model, not the xlsx. Future importers (Google Sheets, CSV, ODS) produce the same XMR types.
2. **Incremental evolution.** Types grow via additive fields with `xmrVersion` gating. Never break existing consumers.
3. **Machine-readable first.** Every field is typed, structured, and queryable. Human-readable labels are metadata, not structure.
4. **Deterministic reproducibility.** Given an XMR model + inputs + scenario, the runtime must always produce the same outputs.

---

## Current Types (v1 — implemented)

Source: `packages/core/src/types.ts`

### Model (top-level)

```typescript
interface Model {
  id: string;                           // UUID
  name: string;                         // Human label (from filename)
  version: number;                      // Increments on re-import
  createdAt: string;                    // ISO 8601
  workbookName: string;                 // Original .xlsx filename
  parameters: Parameter[];              // Input candidates
  calculations: Calculation[];          // Intermediate formulas (future population)
  outputs: Output[];                    // Output/KPI candidates
  graph: DependencyGraph;               // DAG of all cell dependencies
  compatibility: CompatibilityReport;   // Formula support assessment
  discovery: ModelDiscovery;            // Auto-analysis summary
}
```

### Parameter (Input)

```typescript
interface Parameter {
  id: string;
  name: string;                         // Inferred from adjacent label cell
  type: CellType;
  unit?: string;
  currentValue: unknown;
  originalValue: unknown;
  allowedRange?: { min?: number; max?: number };
  sourceCell: CellAddress;
  source: ParameterSource;              // 'CLIENT_MODEL' | 'USER_OVERRIDE' | 'SYSTEM_DEFAULT' | 'EXTERNAL_DATA'
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confirmed: boolean;
}
```

### Output (KPI)

```typescript
interface Output {
  id: string;
  name: string;
  value: unknown;
  sourceCell: CellAddress;
  dependsOn: string[];                  // Parameter IDs
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confirmed: boolean;
}
```

### Calculation (Intermediate)

```typescript
interface Calculation {
  id: string;
  sourceCell: CellAddress;
  originalFormula: string;
  normalizedFormula?: string;           // Populated after E0 (AST normalization)
  dependencies: string[];               // Cell references this formula reads
  downstreamOutputs: string[];          // Cells that consume this result
}
```

### Cell (Atomic)

```typescript
interface Cell {
  address: CellAddress;
  value: unknown;
  type: CellType;                       // 'number' | 'string' | 'date' | 'boolean' | 'error' | 'blank'
  formula?: string;
  format?: string;                      // Excel number format
}

type CellAddress = { sheet: string; ref: string };
```

### DependencyGraph (DAG)

```typescript
interface DependencyGraph {
  nodes: string[];                      // Cell IDs (e.g., 'Sheet1!A1')
  edges: DependencyEdge[];
}

interface DependencyEdge {
  from: string;                         // Upstream (dependency)
  to: string;                           // Downstream (dependent)
}
```

### CompatibilityReport

```typescript
interface CompatibilityReport {
  status: 'VALID' | 'PARTIAL' | 'INVALID';
  supportedFormulas: number;
  totalFormulas: number;
  issues: CompatibilityIssue[];
}

interface CompatibilityIssue {
  type: 'unsupported_function' | 'external_reference' | 'circular_dependency' | 'vba' | 'error';
  cell?: CellAddress;
  detail: string;
  severity: 'error' | 'warning' | 'info';
}
```

### Scenario & Comparison

```typescript
interface Scenario {
  id: string;
  modelId: string;
  modelVersion: number;
  name: string;
  overrides: ScenarioOverride[];
  results: Record<string, unknown>;
  createdAt: string;
}

interface ScenarioOverride {
  parameterId: string;
  value: unknown;
}

interface ComparisonRow {
  outputId: string;
  outputName: string;
  baseline: unknown;
  scenario: unknown;
  delta: number | null;
  percentDelta: number | null;
}
```

### Provenance

```typescript
interface Provenance {
  parameterId: string;
  source: ParameterSource;
  workbook?: string;
  sheet?: string;
  cell?: string;
  modified: boolean;
  modifiedBy?: string;
  modifiedAt?: string;
}
```

### Deliverable (Proto–Model Package)

```typescript
interface Deliverable {
  id: string;
  modelId: string;
  modelName: string;
  modelVersion: number;
  executedAt: string;
  outputs: DeliverableItem[];
  parameters: DeliverableItem[];
  overridesApplied: ScenarioOverride[];
  compatibility: CompatibilityReport;
}

interface DeliverableItem {
  id: string;
  name: string;
  value: unknown;
  sourceCell: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}
```

### ModelDiscovery

```typescript
interface ModelDiscovery {
  workbookName: string;
  sheets: number;
  formulaCells: number;
  inputCandidates: number;
  outputCandidates: number;
  crossSheetReferences: number;
  externalReferences: number;
  namedRanges: number;
  unsupportedFunctions: number;
  circularDependencies: number;
  compatibility: CompatibilityStatus;
}
```

---

## Evolution Path

XMR evolves via additive, versioned changes. Breaking changes require a new major `xmrVersion`.

### v1.1 — Formula AST (Epic E0)

Add to `Calculation`:

```typescript
interface Calculation {
  // ... existing fields ...
  ast?: FormulaAST;                     // Parsed abstract syntax tree
  normalizedFormula: string;            // Canonical text form (populated from AST)
  functionCalls: string[];              // Functions used in this formula (e.g., ['SUM', 'IF'])
}
```

New types:

```typescript
interface FormulaAST {
  type: ASTNodeType;
  // Tree structure TBD during E0 ADR — likely reuses or wraps
  // fast-formula-parser output nodes if that library is adopted
}

type ASTNodeType =
  | 'number' | 'string' | 'boolean' | 'error'
  | 'cell_ref' | 'range_ref' | 'named_ref'
  | 'function_call' | 'binary_op' | 'unary_op'
  | 'array' | 'parentheses';
```

### v1.2 — Evidence Records (Epic E1)

New top-level types:

```typescript
interface ModelTest {
  id: string;
  modelId: string;
  name: string;
  category: 'structural' | 'mathematical' | 'business';
  assertion: TestAssertion;
  status: 'pass' | 'fail' | 'error' | 'skip';
  message?: string;
  executedAt: string;
}

interface TestAssertion {
  type: 'equals' | 'gt' | 'lt' | 'gte' | 'lte' | 'between' | 'balance' | 'non_negative' | 'custom';
  left: CellReference | string;        // Output/cell to check
  right?: unknown;                      // Expected value or bound
  tolerance?: number;                   // For floating-point comparison
}

interface EvidenceRecord {
  id: string;
  modelId: string;
  modelVersion: number;
  executedAt: string;
  inputs: Record<string, unknown>;      // Parameter ID → value at execution time
  scenario?: string;                    // Scenario name if applicable
  outputs: Record<string, unknown>;     // Output ID → computed value
  tests: ModelTest[];                   // Test results at execution time
  reproducible: boolean;                // Re-execution matches stored outputs
  checksum: string;                     // Hash of (model version + inputs + outputs)
}
```

### v1.3 — Identity & Versioning (Epic E2)

Add to `Model`:

```typescript
interface Model {
  // ... existing fields ...
  slug: string;                         // Human-readable identifier (e.g., 'acme-fy27-model')
  semver: string;                       // Semantic version (e.g., '3.2.0')
  status: ModelStatus;                  // Lifecycle state
  owner?: string;
  tags?: string[];
}

type ModelStatus = 'draft' | 'sandbox' | 'validated' | 'approved' | 'published' | 'deprecated';
```

New types:

```typescript
interface ModelSnapshot {
  id: string;
  modelId: string;
  semver: string;
  createdAt: string;
  data: Model;                          // Full model state at snapshot time
  checksum: string;
}

interface ModelDiff {
  fromVersion: string;
  toVersion: string;
  parametersAdded: Parameter[];
  parametersRemoved: Parameter[];
  parametersModified: ParameterDiff[];
  formulasChanged: FormulaDiff[];
  outputsChanged: OutputDiff[];
  impactSummary: {
    outputDeltas: ComparisonRow[];      // Reuses existing type
  };
}

interface FormulaDiff {
  cell: CellAddress;
  before: { formula: string; ast?: FormulaAST };
  after: { formula: string; ast?: FormulaAST };
  semantic: boolean;                    // true = logic changed; false = only ref-style/formatting
}
```

### v2.0 — Future (post-roadmap)

Potential additions (design only, not scheduled):

- `units: UnitSystem` — dimensional analysis (USD, %, mm², days)
- `timeDimension: TimeSeries` — period-aware calculations
- `constraints: ModelConstraint[]` — explicit bounds and invariants
- `entities: Entity[]` — named business objects (Revenue, COGS, etc.)
- `lineage: LineageGraph` — full source → decision tracing

These will be designed when a real use case demands them. They are NOT pre-built speculatively.

---

## Schema Versioning Contract

```typescript
interface XMREnvelope {
  xmrVersion: string;                   // Semver of the XMR schema itself
  model: Model;
}
```

Rules:
- Additive fields (optional) = patch or minor version bump
- Removing/renaming fields = major version bump (requires migration)
- Consumers check `xmrVersion` and degrade gracefully for unknown fields
- The API always returns the latest XMR version; older consumers ignore new fields

---

## AST & DAG Roles

These two structures serve complementary purposes:

### AST — Intra-cell semantics

The formula AST represents the computation **within a single cell**.

**Used for:**
- Precise dependency extraction (replaces regex ref-matching)
- `normalizedFormula` generation (canonical text form, ref-style insensitive)
- Semantic diff (detect logic changes vs. cosmetic changes)
- Function inventory (list all functions used in a model)
- Interpreter evaluation (walk the tree, evaluate nodes)
- Security sandbox (step/time limits on tree traversal)

### DAG — Inter-cell structure

The dependency graph represents relationships **between cells**.

**Used for:**
- Topological sort (execution order)
- Cycle detection (DFS)
- Root node identification (inputs = cells with no upstream)
- Terminal node identification (outputs = cells with no downstream)
- Upstream/downstream tracing (provenance, impact analysis)
- Sensitivity targets (which parameters ultimately affect which outputs)

### Relationship

```
Formula text (e.g., "=SUM(A1:A3) + Sheet2!B4 * 1.1")
         │
         ▼
    ┌─────────┐
    │   AST   │  ← intra-cell: tree of operations
    └────┬────┘
         │
         │ extract references from AST leaf nodes
         ▼
    ┌─────────┐
    │   DAG   │  ← inter-cell: graph of dependencies
    └─────────┘
```

The AST feeds the DAG. The DAG orders the execution. The AST drives each cell's evaluation.
