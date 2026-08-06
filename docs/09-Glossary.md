# 09 — Glossary

| Term | Definition |
|---|---|
| **AST** | Abstract Syntax Tree — parsed representation of a formula's internal structure (operators, operands, function calls, references). |
| **Assurance Ladder** | Progressive validity levels: UNASSESSED → TESTED → VERIFIED → VALIDATED. Each gate has explicit requirements. |
| **Assurance Status** | A model's current position on the Assurance Ladder. Determines what claims can be made about its correctness. |
| **Authority Hierarchy** | Precedence order for conflicting information: Contract > Structure > Inference > Workbook metadata. |
| **BYOA** | Bring Your Own Assumptions — Sil feature allowing users to upload proprietary cost models via XLent. |
| **DAG** | Directed Acyclic Graph — the dependency graph connecting cells; determines evaluation order. |
| **Deliverable** | A packaged model execution result ready for delivery to a client. Proto-form of Model Package. |
| **Deterministic execution** | Same model + same inputs + same scenario = same outputs, always. No randomness, no AI inference. |
| **Evidence record** | Immutable structured proof that a result was computed from a specific model state with specific inputs. |
| **Finding** | A classified observation about a model's structural or logical health, with severity (critical/warning/info) and downstream impact context. |
| **Model Contract** | Explicit specification of model intent: declared inputs/outputs, invariants, and purpose statement. Authoritative — overrides inference. |
| **Model CI** | Automated execution of the full test suite on model change, with assurance-level enforcement based on diff classification. |
| **ModelOps** | The lifecycle infrastructure for computational models: import → test → version → publish → deploy → execute → monitor. |
| **Model Package** | Full structured deliverable including manifest, findings, test results, evidence, and assurance summary. Successor to Deliverable. |
| **ModelTest** | A declarative assertion about a model's correctness (structural, mathematical, or business rule). |
| **Normalized formula** | Canonical text representation of a formula (derived from AST); ref-style and formatting insensitive. Used for semantic comparison. |
| **Parameter** | An input to the model — a cell classified as having no upstream dependencies (root node in the DAG). |
| **Output** | A result of the model — a cell classified as having no downstream dependents (terminal node in the DAG). |
| **Provenance** | Metadata tracking where a parameter value came from, whether it was modified, and by whom. |
| **Publish gate** | Automated check that all model tests pass before a model can transition to Published status. |
| **Registry** | Organizational inventory of managed models with identity, version, status, owner, and consumer information. |
| **Scenario** | A named execution of the model with one or more parameter overrides. |
| **Semantic diff** | Comparison of two model versions that distinguishes logic changes (semantic) from cosmetic changes (ref-style, formatting). |
| **Slug** | Human-readable, URL-safe, unique identifier for a model (e.g., `acme-fy27-operating-model`). |
| **Snapshot** | Immutable capture of the full model state at a point in time. Basis for versioning and diffing. |
| **UNASSESSED** | Default assurance status for new/re-imported models. No validity claims can be made. |
| **Validation** | Determining whether a model solves the right problem (contract conformance, business-rule satisfaction). Distinct from verification. |
| **Verification** | Determining whether a model works correctly (structural integrity, computational accuracy). Distinct from validation. |
| **XMR** | XLent Model Representation — the canonical type system representing a spreadsheet model independently of source format. |
| **XLent** | ModelOps infrastructure for spreadsheet models. Makes spreadsheet models behave like software. |
