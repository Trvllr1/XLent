# 10 — Market Validation

## Pain-Point Evidence

The pain is real and expensively documented.

### Error Rates

- Panko (2008, 2016 meta-analysis): **~88% of operational spreadsheets contain errors.** One of the most replicated findings in end-user computing research.
- EuSpRIG (European Spreadsheet Risks Interest Group): maintains a public database of spreadsheet horror stories spanning decades.
- Powell et al. (2009): 94% of audited spreadsheets contained errors; average 5% of cells in a model have errors.

### Catastrophes on Record

| Incident | Cost | Root Cause |
|---|---|---|
| JPMorgan London Whale (2012) | ~$6B trading loss | VaR model with copy-paste formula error; SUM instead of AVERAGE |
| Reinhart-Rogoff (2013) | Policy impact (austerity) | Excel range selection error excluded data from key calculation |
| TransAlta (2003) | $24M | Clerical copy-paste error in bidding spreadsheet |
| UK COVID Contact Tracing (2020) | 16,000 cases lost | XLS row limit (65,536) silently truncated data |
| MI5 phone tapping (2011) | Legal/operational | Formatting error caused wrong phone numbers to be surveilled |
| Barclays (2008) | Legal costs | Hidden rows in due-diligence spreadsheet included unwanted contracts |

### Regulatory Pressure

- **SR 11-7** (US Federal Reserve): Banks must maintain model inventories, validate models, document assumptions. Currently done in SharePoint + Word.
- **Solvency II** (EU Insurance): Requires model governance and validation for capital calculations.
- **SOX EUC Controls**: End-User Computing controls require organizations to track and audit spreadsheet-based processes.
- **BCBS 239**: Basel Committee principles for risk data aggregation — spreadsheets fail almost every principle.

These regulations create **compliance budgets already allocated** for the problem XLent solves.

---

## Competitive Fragment Map

The market exists in fragments. Each fragment independently sustains companies.

### Model → API / Deployment

| Company | Funding | Approach | Limitation from XLent's perspective |
|---|---|---|---|
| Coherent Spark | $100M+ | Excel-to-API for insurance | Vertical (actuarial only); proprietary; no evidence/verification thesis |
| SpreadsheetWeb | Bootstrap | Excel → web app conversion | Simple form generation; no model understanding |
| EASA | Private | Excel → enterprise app | UI-focused; not model-infrastructure |
| Schematiq | Seed | Excel functions as cloud services | Function-level, not model-level |

### Verification / Audit

| Company | Approach | Limitation |
|---|---|---|
| PerfectXL | Static analysis of xlsx | Analysis only; no runtime, no versioning, no API |
| Operis (OAK) | Financial model audit | Consulting-heavy; not infrastructure |
| ClusterSeven (Mitratech) | EUC inventory & change tracking | Governance metadata only; no computational understanding |
| CIMCON | Spreadsheet risk management | Legacy; policy-focused, not model-focused |

### FP&A / "Keep Excel" Platforms

| Company | Approach | Limitation |
|---|---|---|
| Datarails | Excel add-in + cloud sync | BI layer on Excel; no model verification or API |
| Vena | Excel interface + planning engine | Replaces calc engine; doesn't preserve spreadsheet semantics |
| Cube | Connected planning | Aggregation-focused; not model-infrastructure |

### AI + Spreadsheets

| Company | Approach | Limitation |
|---|---|---|
| Microsoft Copilot | LLM in Excel | Generates formulas; does NOT verify, version, or deploy models |
| Various LLM wrappers | "Chat with your spreadsheet" | Shallow summarization; hallucinate arithmetic; no determinism |

### Key Insight

**Nobody has unified these fragments.** Possibly because the unified buyer doesn't exist — or possibly because nobody has articulated the unifying thesis ("ModelOps") convincingly enough. XLent's bet is the latter.

---

## The Supabase Analogy — Where It Holds and Breaks

### Holds

1. **Infrastructure for a beloved primitive.** Supabase took PostgreSQL (powerful, difficult) and made it accessible. XLent takes spreadsheet models (powerful, unmanaged) and makes them operational.
2. **Timing play.** Supabase rode Firebase-exodus + Postgres renaissance. XLent rides the **AI-agent wave** — agents need deterministic model execution with evidence. "AI reasons, XLent executes" is a genuinely strong, current thesis.
3. **Bundle strategy.** Supabase bundled auth + DB + storage + functions that existed separately. XLent bundles verification + versioning + API + registry that exist separately.

### Breaks

1. **User ≠ buyer ≠ developer.** Supabase sold to developers who self-serve, deploy, and pay. Spreadsheet model authors are analysts who don't deploy. XLent's adopter (engineering/AI/risk teams) is not its author (finance/ops analysts). **Mitigation:** Agent/API-first distribution. The buyer integrates XLent; the author continues in Excel.

2. **One spec vs. a swamp.** PostgreSQL is a spec with one engine. Excel's formula surface (LAMBDA, dynamic arrays, volatile functions, iterative calc, VBA, Power Query) means XLent always executes a subset. **Mitigation:** Parse 100% / execute subset. Precise compatibility reports. Expand coverage over time (E4).

3. **Derivative vs. canonical.** Supabase *is* the database. XLent is a *derivative* of the xlsx — the author keeps editing in Excel. Drift between the authoring artifact and the governed model is the hardest unsolved structural risk. **Mitigation:** Re-import reconciliation flow (doc 05); published versions are immutable; consumers pin to versions.

---

## Microsoft Platform Risk

**Risk:** Excel + Copilot + Power Platform could absorb the shallow version of XLent (summarize, explain, even generate tests).

**What Microsoft is structurally unlikely to build:**
- A **neutral** runtime (Microsoft has no incentive to make Excel models portable to non-Microsoft consumers)
- A **deterministic execution layer that AI agents call** (Copilot IS the AI; it doesn't need a separate deterministic substrate)
- An **evidence-producing system** (Microsoft's incentive is to sell Copilot, not to prove Copilot wrong)
- A **versioning/registry/governance layer independent of SharePoint** (Microsoft wants you in SharePoint)

**Moat position:** XLent is the neutral, deterministic, evidence-producing runtime that systems other than Microsoft call. This is architecturally immune to Copilot absorption.

---

## Target Workflows (Ranked by Validation Priority)

### 1. Engineering Cost / Feasibility Models (Active — Sil)

**Workflow:** Analyst uploads vendor or internal cost model → XLent verifies structure → runs scenarios → Sil reasons over evidence → investment decision.

**Status:** Working today. Design-partner flywheel active. Validates the full pipeline.

### 2. Banking / Insurance Model Risk (SR 11-7)

**Workflow:** Risk team inventories spreadsheet models → import to registry → auto-generate structural tests → lifecycle states (draft → validated → approved) → audit evidence.

**Buyer:** Model Risk Management teams. **Budget:** Already allocated (regulatory compliance). **Product fit:** Registry (E3) + tests (E1) + evidence (E1) + lifecycle states (E3).

### 3. PE / IB Deal-Model Diligence

**Workflow:** Associate receives target's operating model → import → structural checks → hardcode detection → formula consistency → scenario comparison → assurance summary for IC memo.

**Buyer:** Private equity / investment banking deal teams. **Budget:** High willingness to pay per-deal. **Product fit:** Level-1 upload (no integration needed), verification + evidence + package. Fast time-to-value.

### 4. Pricing / Quoting Models as Services (CPQ)

**Workflow:** Actuarial or pricing model published as version-pinned API → consumed by CRM/quote system → deterministic pricing with audit trail.

**Buyer:** Insurance, enterprise sales. **Budget:** Proven (Coherent's market). **Product fit:** Prod API (E3) + versioning (E2). Enter after E3.

### 5. FP&A Scenario Governance

**Workflow:** Branches-as-scenarios → semantic diff between board case and base case → "what changed and why did EBITDA move."

**Buyer:** CFO office, FP&A teams. **Crowded space** — enter via AI-agent angle (Sil) not as another planning tool.

### 6. AI-Agent Execution Substrate (Cross-cutting)

**Workflow:** Any agent platform needs to invoke a financial model → gets deterministic results + evidence instead of LLM arithmetic.

**Buyer:** AI platform teams. **Timing:** Matures as agent adoption grows. Horizontal story after verticals prove the runtime.

---

## Falsifiable Validation Milestones

### Validates the thesis

| Milestone | What it proves |
|---|---|
| A second design partner outside Sil's domain uploads a real model and the output is useful without hand-holding | Parse coverage + verification are sufficient for a different vertical |
| An agent workflow demonstrably produces better decisions with XLent execution vs. reading the xlsx directly | The "AI reasons, XLent executes" thesis holds in practice |
| A banking/risk team uses registry + evidence for SR 11-7 compliance | The regulatory buyer exists and will pay |
| Sil's models have >85% formula execution coverage after E4 | The formula surface strategy works for real workloads |

### Falsifies the thesis

| Milestone | What it means |
|---|---|
| Real-world models routinely land at <70% executable formula coverage | The custom runtime thesis needs revision — consider licensed engine (HyperFormula commercial) or fundamentally different approach |
| Model authors refuse the import → verify → publish loop because Excel-side edits keep invalidating published versions | The two-lives problem is fatal to governance; narrow to stateless verify + execute on demand |
| No second vertical adopter after 6 months of availability | The pain may be real but the solution isn't general enough; go deeper in Sil's vertical |
| Microsoft ships model versioning + test + API inside Excel/Power Platform | The shallow version got absorbed; pivot to the deep differentiator (evidence-for-agents) or become a premium layer |

---

## Go-to-Market Verdict

**Vertical-first. Platform emerges from verticals.**

1. Prove the runtime + evidence on Sil (already happening)
2. Validate with one non-Sil vertical (deal diligence or model risk — both require minimal integration)
3. Publish the open-source core (`@xlent/core`) to build developer awareness
4. Let the horizontal story ("ModelOps for any spreadsheet model") emerge from successful vertical deployments

This is, incidentally, also how Supabase actually grew — vertical adoption (developer productivity) before horizontal positioning (Firebase alternative).
