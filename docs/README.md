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

## Source Documents

The `source/` directory contains the original strategy and governance documents for provenance:

- `XLent-Lessons-from-Supabase.txt` — product strategy and positioning
- `XLent-ModelOps.txt` — ModelOps vision and platform design
- `XLent-Engineering-Constitution.txt` — binding engineering doctrine, assurance semantics, and agent-development rules

The blueprint is the source of truth for product capabilities. The constitution is the source of truth for engineering invariants. Source documents are retained for reference only.

## Document Authority Model

Three sibling documents govern XLent:

| Document | Governs | Precedence |
|---|---|---|
| **Engineering Constitution** | Binding invariants, assurance vocabulary, V&V semantics, agent rules, non-negotiable distinctions | Engineering correctness — cannot be overridden by product or sequencing convenience |
| **Product Blueprint** (docs 01–07) | Capabilities, architecture, API contracts, integration design | Product/architecture truth — determines *what* to build and *how* |
| **Roadmap** (doc 08) | Execution order, status, dependencies, acceptance criteria | Sequencing truth — determines *when* and whether work is complete |

**Conflict rule:** Preserve implemented behavior unless it violates a constitutional invariant. Resolve future ambiguity by recording a decision in the Blueprint and scheduling implementation in the Roadmap.

## For Agentic SWE

Each document is self-contained. An agent implementing a roadmap item should read:

1. `08-Roadmap.md` — find the work item and its acceptance criteria
2. The referenced architecture/spec doc — understand constraints
3. The relevant source files listed in the work item

No other context should be needed.
