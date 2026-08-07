# 13 — Programmatic Defect Corpus (PDC)

**Status:** Internal Engineering Package (assurance substrate)
**Primary audience:** XLent Engineering, QA, Research, Agent SWE
**Source of record:** `docs/source/XLent-Programmatic-Defect-Corpus.txt` (full normative text)
**Related:** Engineering Constitution (embodies it — see "Recursive Principle"); doc `12` (Model Review); Roadmap E11 (seed corpus) → E14 (PDC)

> XLent must continuously test its ability to understand models that are correct, incorrect, unusual, and intentionally altered.

The **Programmatic Defect Corpus (PDC)** is XLent's internal, machine-executable body of known model defects, mutations, anomalies, edge cases, and legitimate exceptions. It continuously determines whether XLent can correctly **detect, localize, classify, assess materiality, trace impact, distinguish defects from legitimate exceptions, explain findings, avoid false positives, preserve semantics, and maintain performance across releases.**

**PDC is XLent's laboratory for testing XLent.** It is not a customer feature.

## The Fundamental Distinction

| Concept | Purpose |
|---|---|
| **Scenario** | Explore a legitimate alternate model state |
| **Model Test** | Determine whether a defined property holds |
| **Model Review** | Determine whether a model is acceptable |
| **Fault Injection** | Deliberately introduce a fault to test model resilience |
| **PDC** | Deliberately introduce known faults to test *XLent's own* capabilities |

> A scenario changes the world. A test challenges the model. A mutation breaks the implementation. PDC uses broken implementations to challenge XLent.

Customers never see "PDC-17,392" or "XLent passed 98.7% of PDC defects" — they benefit indirectly through Model Review, Testing, Assurance, Health, and Resilience that the PDC keeps working.

## Ground-Truth Principle

Every canonical PDC case has known ground truth:

```text
Correct Model + Mutation/Condition + Expected Outcome
  + Expected Detection + Expected Location + Expected Classification
  + Expected Impact
```

XLent compares **EXPECTED vs. OBSERVED** — never subjective judgment.

## Golden Models

The foundation is the **Golden Model** — a model whose intended behavior is established enough to serve as a reference artifact: known inputs, expected outputs, Model Contract, invariants, dependencies, tests, domain semantics, expected formula patterns/behavior. Golden Models are the source from which controlled mutations are generated.

## Programmatic Mutation

A mutation is a deliberate transformation of a valid model into a known defect/test condition. Classes include:

- **Formula** (`=A1*B1 → =A1+B1`), **Reference** (`=B12 → =B13`), **Range** (`=SUM(B2:B12) → =SUM(B2:B11)`)
- **Sign** (`=Revenue−Cost → =Revenue+Cost`), **Temporal** (`Growth[2029] → Growth[2028]`)
- **Hardcode** (`=Revenue*Margin → =Revenue*0.23`), **Dependency** (redirect to unintended upstream), **Logic** (incorrect-but-executable rule)

## Defect Taxonomy

Formal classes — **Structural** (missing/unexpected sheet, malformed structure, hidden dependency, broken named range/link), **Formula** (incorrect/off-by-one reference, wrong range, missing/inconsistent formula, wrong operator/function, absolute/relative error, accidental hardcode), **Dependency** (unintended dep, orphaned input, circular, bypass, unexpected downstream), **Data** (wrong type/unit, missing/duplicated/stale value, date/sign/scaling error), **Logic** (wrong rule/conditional/threshold/temporal/aggregation), **Behavioral** (unexpected sensitivity, monotonicity/boundary/invariant violation, scenario inconsistency), **Integration** (broken source, changed schema, invalid import, stale dependency, interface mismatch).

## Legitimate Anomalies (PDC-06 Negative Knowledge)

Not every deviation is an error. A `8% / 8% / 3% / 8%` growth series may be a defect *or* an intentional capacity constraint, contractual condition, one-time event, or legitimate boundary. PDC must contain **DEFECTIVE**, **LEGITIMATE**, and **AMBIGUOUS** cases — this is how XLent optimizes false-positive behavior.

## Case Schema (machine-readable)

```text
PDC Case
├── case_id · version · domain · golden_model · mutation
├── defect_class · severity (INFO/LOW/MEDIUM/HIGH/CRITICAL by *consequence*)
├── intended_behavior · expected_behavior · observed_behavior
├── affected_components
├── expected_detection · expected_location · expected_classification
├── expected_impact · expected_explanation
├── legitimate_exception · required_tests · provenance
```

## Expected Detection / Localization / Impact / Explanation

Benchmarks distinguish escalating capability:

```text
Detected → Detected + Correctly Localized → Detected + Correctly Classified → Detected + Correctly Explained
```

- **Detection** — is the seeded defect found at all?
- **Localization** — does XLent identify *where* ("Returns!H82", not "somewhere")?
- **Impact** — does it trace the downstream chain (Defect → Revenue → EBITDA → FCF → Debt → IRR)?
- **Explanation** — does the explanation answer: what is wrong, where, what should happen, what actually happens, why it matters, what's affected? PDC tests *explanation quality*, not just detection.

## Execution, Orchestration, Scheduling

Fully unattended. Conceptual orchestrator: **Generate Cases / Select Corpus / Schedule → Execute XLent → Detect / Localize / Explain → Compare to Ground Truth → Score → Report.** Execution frequencies:

| Cadence | Corpus | Purpose |
|---|---|---|
| On commit | fast regression suite | detect immediate breakage |
| Nightly | full deterministic corpus | continuous regression |
| Weekly | expanded mutation generation | explore new combinations/edges |
| Pre-release | full assurance suite | release qualification |
| On demand | developer-selected subsets | targeted investigation |

**Continuous-assurance loop:** Developer Change → Build → Unit → Integration → PDC Smoke → PDC Full → Benchmark → Assurance Gates → PASS/FAIL.

## Release Gates

A release may be **blocked** when thresholds are violated: no regression in critical-defect detection or high-severity localization; false-positive rate under threshold; no critical category below minimum coverage; runtime correctness, importer fidelity, and graph reconstruction must not regress. PDC is a **release-quality gate**.

## Deterministic vs. Generative

- **Deterministic** — stable known cases (`PDC-000001…`) for regression, reproducibility, release comparison.
- **Generative** — freshly generated mutations/combinations for exploration, fuzzing, novel-failure discovery, robustness.

## Mutation Combinatorics & Masked Defects

Real models contain multiple interacting issues, so PDC eventually tests single → paired → compound → interacting → **masking** faults. Masked defects (e.g. `+$10M` and `−$10M` netting to zero) are critical: **output correctness alone does not establish model validity.**

## Metrics

Detection rate · Localization rate · Classification accuracy · Severity accuracy · Impact accuracy · Explanation accuracy · False-positive rate · False-negative rate · Regression rate · Repair safety (fixes that resolve without introducing new defects). An internal dashboard exposes corpus size, defect classes, domains, and these rates — illustrative, never targets.

## Regression & Feedback Loop

Once XLent detects a defect, that capability must not silently vanish: **New Failure → Investigate → Fix XLent → Formalize Defect → Add to PDC → Permanent Regression Case.** Novel failure modes are reproduced, classified, given ground truth, mutated, and added — so XLent's accumulated engineering knowledge grows. The corpus gets progressively more representative and difficult.

## Domain Packs

PDC is extensible by domain (Core, Finance, Accounting, Engineering, Semiconductor, Supply Chain, Logistics, Operations, Healthcare, Custom Enterprise). The core engine stays domain-agnostic; packs add domain-specific defect classes, Golden Models, Contracts, invariants, and benchmarks.

## Privacy & Customer Data

PDC does **not** depend on collecting customer workbooks. The corpus is primarily synthetic/generated models, controlled mutations, licensed public models, explicitly contributed artifacts, and legally permitted anonymized patterns. Customer-derived cases require explicit governance (authorization, anonymization, ownership, retention, isolation, permitted use). The value derives from **structured defect knowledge, not indiscriminate data accumulation.**

## PDC and AI / Agents

PDC provides an evaluation substrate for AI components (finding generation, explanation, classification, root-cause, remediation, review summaries) measured against known ground truth — preventing subjective claims like "the agent seems pretty good at spreadsheets." An agent asked "review this model" can be scored: PDC knows what defects exist, what should be detected, what evidence should be cited, what should be ignored, and the correct explanation.

## Non-Goals

PDC is not a customer spreadsheet repository; does not replace Model Review, Scenario Analysis, or Model Testing; does not auto-declare customer models invalid or silently repair them; is not a general analytics DB or training-data vacuum; does not substitute statistical benchmarks for deterministic ground truth. **Its job is to test XLent.**

## Core Engineering Principles (PDC-01 … PDC-14)

Ground Truth · Reproducibility · Automation · Regression · Mutation · Negative Knowledge · Materiality · End-to-End · No Execution-Only Validation · No AI-Only Assurance · Continuous Execution · Release Gating · Controlled Evolution (the corpus itself is versioned) · Evidence.

## The Recursive Principle

> XLent should apply its own engineering philosophy to itself.

XLent tells customers *don't trust a model simply because it executes*; PDC tells XLent *don't trust XLent simply because its code executes*. XLent tells customers *test against known behavior*; PDC tests XLent against known behavior. XLent tells customers *preserve evidence*; PDC preserves evidence of XLent's own behavior. PDC is the Engineering Constitution embodied as an executable system.

## Final Definition

> The Programmatic Defect Corpus is XLent's continuously executed internal assurance system comprising known-good models, programmatically generated mutations, known defects, legitimate anomalies, edge cases, expected behaviors, and ground-truth outcomes, used to benchmark, regression-test, optimize, and release XLent's model understanding and assurance capabilities.

## Relationship to existing work

The E11.1 intentional-defect corpus ([defectCorpus.test.ts](../packages/core/src/__tests__/defectCorpus.test.ts) + manifest) is the **deterministic-corpus seed** — PDC Phase 1/2 in miniature. E11.3 execution monitoring supplies run evidence. PDC generalizes both: Golden Models, a mutation engine, a ground-truth comparator with localization/classification/explanation metrics, generative fuzzing, domain packs, and release gating. Implementation is sequenced as **Roadmap E14**, phased per the source document's own five-phase plan (schema + Golden Model + mutation framework + comparator + CLI runner first).
