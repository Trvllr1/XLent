# XLent Blueprint

Master documentation suite for XLent — ModelOps infrastructure for spreadsheet models.

## Documents

| # | Document | Purpose |
|---|----------|---------|
| 00 | [North Star](00-North-Star.md) | Thesis, guiding sentences, proposition evaluation decision log |
| 01 | [Product Blueprint](01-Product-Blueprint.md) | Product definition, capability map, what-NOT-to-build |
| 02 | [Architecture](02-Architecture.md) | Monorepo layout, package responsibilities, data flow, target architecture |
| 03 | [XMR Spec](03-XMR-Spec.md) | Canonical model representation: current types + evolution path |
| 04 | [Runtime & Verification](04-Runtime-and-Verification.md) | Execution semantics, AST & DAG roles, function catalog, test taxonomy, evidence |
| 05 | [ModelOps Lifecycle](05-ModelOps-Lifecycle.md) | Identity, versioning, diffs, lifecycle states, registry, re-import reconciliation |
| 06 | [API Contract](06-API-Contract.md) | Current + planned endpoints, auth, Model Package schema, webhook contract |
| 07 | [Sil Integration](07-Sil-Integration.md) | BYOA flow, webhook/inbox, field mapping, boundary rules |
| 08 | [Roadmap](08-Roadmap.md) | Epics E0–E6 with agent-executable work items |
| 09 | [Glossary](09-Glossary.md) | Term definitions |
| 10 | [Market Validation](10-Market-Validation.md) | Pain-point evidence, competitive map, target workflows, falsifiable milestones |
| 11 | [GTM Strategy](11-GTM-Strategy.md) | GTM wedge, positioning, ICP, pricing, PMF definition, commercialization flywheel |
| 12 | [Model Review](12-Model-Review.md) | Review discipline: findings taxonomy/states, materiality, impact analysis, approval, review-as-API |
| 13 | [Programmatic Defect Corpus](13-Programmatic-Defect-Corpus.md) | Internal assurance substrate: Golden Models, mutation engine, ground-truth metrics, release gates |
| 14 | [Model IDE: Capstone](14-Model-IDE-Capstone.md) | E12 authority: model sovereignty, governed mutation, native authoring, human-agent parity |

## Source Documents

The `source/` directory contains the original strategy and governance documents for provenance:

- `XLent-Lessons-from-Supabase.txt` — product strategy and positioning
- `XLent-ModelOps.txt` — ModelOps vision and platform design
- `XLent-Engineering-Constitution.txt` — binding engineering doctrine, assurance semantics, and agent-development rules
- `XLent-GTM-PMF-Commercialization.txt` — GTM, PMF, and commercialization strategy
- `XLent-Model-Review.txt` — Model Review discipline (normative source for doc 12)
- `XLent-Programmatic-Defect-Corpus.txt` — Programmatic Defect Corpus internal assurance system (normative source for doc 13)
- `XLent-Model-IDE-Capstone.txt` — Model IDE strategic architecture and proposed constitutional amendments (normative source for doc 14 / E12)

The blueprint is the source of truth for product capabilities. The constitution is the source of truth for engineering invariants. Source documents are retained for reference only.

## Document Authority Model

Three sibling documents govern XLent:

| Document | Governs | Precedence |
|---|---|---|
| **Engineering Constitution** | Binding invariants, assurance vocabulary, V&V semantics, agent rules, non-negotiable distinctions | Engineering correctness — cannot be overridden by product or sequencing convenience |
| **Product Blueprint** (docs 01–07, 12–14) | Capabilities, architecture, API contracts, integration design, Model Review, PDC, and Model IDE capstone | Product/architecture truth — determines *what* to build and *how* |
| **Roadmap** (doc 08) | Execution order, status, dependencies, acceptance criteria | Sequencing truth — determines *when* and whether work is complete |

**Conflict rule:** Preserve implemented behavior unless it violates a constitutional invariant. Resolve future ambiguity by recording a decision in the Blueprint and scheduling implementation in the Roadmap.

## For Agentic SWE

Each document is self-contained. An agent implementing a roadmap item should read:

1. `08-Roadmap.md` — find the work item and its acceptance criteria
2. The referenced architecture/spec doc — understand constraints
3. The relevant source files listed in the work item

No other context should be needed.
