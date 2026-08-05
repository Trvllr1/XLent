# 09 — Glossary

| Term | Definition |
|---|---|
| **AST** | Abstract Syntax Tree — parsed representation of a formula's internal structure (operators, operands, function calls, references). |
| **BYOA** | Bring Your Own Assumptions — Sil feature allowing users to upload proprietary cost models via XLent. |
| **DAG** | Directed Acyclic Graph — the dependency graph connecting cells; determines evaluation order. |
| **Deliverable** | A packaged model execution result ready for delivery to a client. Proto-form of Model Package. |
| **Deterministic execution** | Same model + same inputs + same scenario = same outputs, always. No randomness, no AI inference. |
| **Evidence record** | Immutable structured proof that a result was computed from a specific model state with specific inputs. |
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
| **XMR** | XLent Model Representation — the canonical type system representing a spreadsheet model independently of source format. |
| **XLent** | ModelOps infrastructure for spreadsheet models. Makes spreadsheet models behave like software. |
