# 04 — Runtime & Verification

## Execution Semantics

### Current Implementation (`packages/core/src/runtime.ts`)

The `ModelRuntime` class provides deterministic formula evaluation:

1. **Topological sort** — cells ordered by dependency DAG so every cell evaluates after its dependencies.
2. **Parameter override injection** — overridden parameter values replace `currentValue` before evaluation.
3. **Formula evaluation** — each cell's formula is resolved by substituting cell references with their computed numeric values, then evaluated via pattern-based function replacement.
4. **Output collection** — terminal nodes (outputs) are read after full evaluation.

**Guarantees:**
- Same model + same inputs + same scenario = same outputs (deterministic).
- No `eval()`, no `Function()` constructor, no arbitrary code execution.
- Evaluation halts if the topological sort detects a cycle.

### Limitations of Current Approach

| Issue | Impact | Resolution |
|---|---|---|
| Regex-based reference extraction | Misses refs inside string literals, misparses complex ranges | E0: AST-based extraction |
| Regex-substitution evaluation | Fragile for nested functions, operator precedence edge cases | E0: AST tree-walking interpreter |
| ~30 functions supported | Many real-world models use VLOOKUP, INDEX/MATCH, SUMIFS, NPV, IRR | E4: function library expansion |
| Range refs (A1:A10) only in SUM/AVERAGE | Cannot use ranges in other contexts | E0/E4: proper range resolution |
| No step/time limits | Pathological formulas could hang | E0: sandboxed interpreter |

---

## Formula Surface Strategy

### Parse ≠ Execute (Architectural Decision)

**Goal:** Parse 100% of formulas into ASTs. Execute the supported subset.

This gives two independent value signals:
- **Parse coverage** → precise compatibility report (function-level, not keyword blocklist)
- **Execution coverage** → deterministic results for supported formulas

A model with 80% execution coverage still produces a useful compatibility report for the remaining 20% — the user knows exactly which functions are unsupported and which cells cannot be computed.

### Engine Choice (ADR — to be resolved in E0 spike)

| Option | Pros | Cons |
|---|---|---|
| **Custom recursive-descent parser + tree-walking interpreter** | Full control; no license risk; tailored to XMR needs | High effort for grammar; must handle Excel's syntax edge cases |
| **fast-formula-parser (MIT)** | ~280 functions; Excel-compatible grammar; parser + evaluator | Tightly coupled parser+evaluator; may need forking for AST access |
| **HyperFormula (GPLv3 / Commercial)** | ~400 functions; built-in dependency graph; battle-tested | GPL incompatible with proprietary use without commercial license ($$$) |
| **formulajs (MIT)** | Function library only; clean implementations of Excel functions | No parser; must pair with a separate grammar |
| **Hybrid: custom parser + formulajs functions** | Best of both; MIT throughout; AST ownership; function coverage | Integration work; must validate formulajs accuracy per function |

**Recommendation:** Hybrid approach — own the parser/grammar (or adopt fast-formula-parser's grammar if MIT-extractable), use formulajs for function implementations where accurate. Verify licenses during E0 spike.

**Non-negotiable constraints:**
- No GPL dependencies in the production runtime
- AST must be a first-class XMR artifact (stored, diffable, queryable)
- Interpreter must have step limits and time bounds (security sandbox)
- Unsupported functions produce a typed `#UNSUPPORTED` error, not a crash

---

## Security Sandbox

The formula interpreter operates within strict bounds:

| Control | Mechanism |
|---|---|
| No eval/Function | AST tree-walking only |
| Step limit | Max N node evaluations per cell (prevents infinite loops in recursive formulas) |
| Time limit | Wall-clock timeout per model execution (prevents pathological workbooks from hanging the server) |
| No I/O | Interpreter cannot read files, make network calls, or access environment |
| No VBA | VBA/macros are flagged in compatibility report but never executed |
| Cell count limit | Models exceeding N cells rejected at import (configurable) |

---

## Function Catalog

### Currently Supported (~30)

| Category | Functions |
|---|---|
| Arithmetic | `+`, `-`, `*`, `/`, `%` |
| Math | `ABS`, `SQRT`, `LN`, `LOG`, `LOG10`, `EXP`, `INT`, `MOD`, `POWER` |
| Rounding | `FLOOR`, `CEILING` |
| Constants | `PI`, `TRUE`, `FALSE` |
| Aggregates | `SUM`, `AVERAGE`, `MIN`, `MAX` |
| Logic | `IF`, `AND`, `OR`, `NOT` |
| Comparison | `>`, `<`, `>=`, `<=`, `=`, `<>` |

### Planned — E4 (Runtime Depth)

| Category | Functions | Priority |
|---|---|---|
| Financial | `NPV`, `IRR`, `XNPV`, `XIRR`, `PMT`, `PV`, `FV`, `RATE`, `NPER` | High — Sil models use these |
| Lookup | `VLOOKUP`, `HLOOKUP`, `INDEX`, `MATCH`, `XLOOKUP` | High — ubiquitous |
| Conditional aggregates | `SUMIF`, `SUMIFS`, `COUNTIF`, `COUNTIFS`, `AVERAGEIF` | High |
| Math (extended) | `ROUND`, `ROUNDUP`, `ROUNDDOWN`, `TRUNC`, `SIGN`, `RAND` (deterministic seed) | Medium |
| Text | `LEFT`, `RIGHT`, `MID`, `LEN`, `CONCATENATE`, `TEXT`, `VALUE` | Medium |
| Date | `DATE`, `YEAR`, `MONTH`, `DAY`, `EOMONTH`, `DATEDIF` | Medium |
| Statistical | `MEDIAN`, `STDEV`, `VAR`, `PERCENTILE` | Low |

### Permanently Unsupported

| Function | Reason |
|---|---|
| `GETPIVOTDATA` | Requires pivot table engine |
| `CUBE*` | Requires OLAP connection |
| `RTD` | Requires real-time data server |
| `WEBSERVICE` | External network call — violates sandbox |
| `FILTERXML` | XML processing outside scope |
| VBA/Macros | Security risk; out of paradigm |

---

## Test Taxonomy

Model tests are categorized into three tiers. Each tier can be auto-generated from model analysis or manually authored.

### Structural Tests

Verify model integrity without evaluating formulas.

| Test type | Description | Auto-generatable? |
|---|---|---|
| Broken references | Cell references to non-existent cells/sheets | Yes (from DAG) |
| Circular dependencies | Cycles in dependency graph | Yes (from graph.detectCycles) |
| Formula inconsistencies | Adjacent cells in a range with mismatched formula patterns | Yes (from AST comparison) |
| Hard-coded values in formula ranges | Constants where formulas are expected | Yes (from pattern analysis) |
| Hidden dependencies | Formulas referencing hidden sheets/rows | Yes (from workbook metadata) |
| External references | Links to other workbooks (`[Book1]Sheet!A1`) | Yes (from discovery) |
| Missing formulas | Empty cells in expected formula ranges | Partially |

### Mathematical Tests

Verify computational correctness.

| Test type | Description | Auto-generatable? |
|---|---|---|
| Balance check | Assets = Liabilities + Equity (or similar identity) | No (domain-specific) |
| Roll-forward reconciliation | Opening + changes = closing | No (domain-specific) |
| Non-negativity constraints | Revenue ≥ 0, Headcount ≥ 0 | Partially (from field semantics) |
| Range validation | Values within expected bounds | Partially (from allowedRange) |
| Sum reconciliation | Detail sums equal to reported totals | Partially (from SUM formulas) |
| Unit consistency | Percentages between 0–100%, not 0–1 | Future (requires unit inference) |

### Business Tests

Verify domain-specific rules and constraints.

| Test type | Description | Auto-generatable? |
|---|---|---|
| Margin constraints | Gross margin > 0, EBITDA margin within range | No |
| Debt constraints | DSCR ≥ 1.2x, leverage ≤ 5x | No |
| Capacity limits | Production ≤ max capacity | No |
| Policy rules | Minimum cash balance, maximum capex | No |
| Pricing bounds | Unit price within market range | No |
| Growth sanity | Revenue growth < 200% YoY (anomaly detection) | Partially |

### Test Definition Schema

```typescript
interface ModelTestDefinition {
  id: string;
  name: string;
  category: 'structural' | 'mathematical' | 'business';
  assertion: TestAssertion;
  description?: string;
  autoGenerated: boolean;
}
```

Tests are stored per model and executed on demand or as part of the publish gate.

---

## Evidence Record Schema

Every model execution can produce an evidence record. Evidence is the structured proof that a result was deterministically computed from a specific model state.

```typescript
interface EvidenceRecord {
  id: string;
  modelId: string;
  modelVersion: number;
  semver?: string;
  executedAt: string;                   // ISO 8601

  // What went in
  inputs: Record<string, unknown>;      // Parameter ID → value
  overrides: ScenarioOverride[];
  scenario?: string;

  // What came out
  outputs: Record<string, unknown>;     // Output ID → value

  // Verification
  tests: ModelTestResult[];             // Test outcomes at execution time
  allTestsPass: boolean;
  compatibility: CompatibilityReport;

  // Reproducibility
  checksum: string;                     // SHA-256 of (modelId + version + sorted inputs + sorted outputs)
  reproducible: boolean;                // Re-execution matches stored outputs

  // Traceability
  executedBy?: string;                  // User/agent/system identifier
  purpose?: string;                     // 'scenario_run' | 'publish_gate' | 'delivery' | 'manual'
}
```

Evidence records are:
- **Immutable** once created
- **Queryable** by model, version, date range, test status
- **Attachable** to deliverables (Model Package v2 includes evidence)
- **Diffable** — compare evidence from two scenarios or two versions

---

## Sensitivity Analysis (E4)

One-at-a-time parameter sweep:

1. For each parameter P:
   - Hold all other parameters at baseline
   - Vary P across its `allowedRange` (or ±10%, ±25%, ±50% of current value)
   - Record output changes
2. Rank parameters by impact on each output
3. Produce sensitivity table:

```typescript
interface SensitivityResult {
  modelId: string;
  baselineOutputs: Record<string, number>;
  sensitivities: ParameterSensitivity[];
}

interface ParameterSensitivity {
  parameterId: string;
  parameterName: string;
  variations: SensitivityPoint[];
  impactRanking: Record<string, number>; // Output ID → rank (1 = highest impact)
}

interface SensitivityPoint {
  parameterValue: number;
  outputs: Record<string, number>;
  deltas: Record<string, number>;        // vs. baseline
}
```

---

## Execution Modes

| Mode | Trigger | Produces | Evidence? |
|---|---|---|---|
| **Default run** | `POST /models/:id/run` | Output values | Optional |
| **Scenario run** | `POST /models/:id/scenarios` | Named scenario with results | Optional |
| **Comparison** | `POST /models/:id/compare` | Baseline vs scenario deltas | Optional |
| **Validated run** | `POST /models/:id/run` with `?evidence=true` | Output values + evidence record | Yes |
| **Publish gate** | Internal (E3) | Tests + evidence | Yes (required) |
| **Delivery** | `POST /models/:id/deliver` | Deliverable package | Yes (included) |
