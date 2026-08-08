# XLent

**Turn spreadsheets into software.**

XLent is a standalone platform that transforms spreadsheet-based computational models into structured, inspectable, deterministic, reusable software models.

## Architecture

```
packages/
  core/     — Engine: XLSX parser, model discovery, dependency graph, deterministic runtime, scenario engine
  api/      — REST API (Hono) exposing the model lifecycle
  web/      — React + Vite UI for upload, exploration, and scenarios
```

## API Contract

```
POST /models/import          Upload and parse a workbook
GET  /models/native/templates  List governed native starter packages
POST /models/native          Create from a template or semantic definition
POST /models/:id/analyze     Re-run model discovery
GET  /models                 List models
GET  /models/:id             Get model details
GET  /models/:id/parameters  Get input parameters
GET  /models/:id/outputs     Get computed outputs
POST /models/:id/run         Execute model (with optional overrides)
POST /models/:id/scenarios   Create a named scenario
POST /models/:id/compare     Compare baseline vs scenario
GET  /models/:id/graph       Dependency graph
GET  /models/:id/compatibility   Compatibility report
GET  /models/:id/provenance  Parameter provenance
```

## Quick Start

```bash
npm install
npm run dev
```

- API: http://localhost:4100
- UI: http://localhost:4200

## Integration

Siliconomics consumes XLent via the typed `XLentClient`:

```ts
import { XLentClient } from '@xlent/core';

const xlent = new XLentClient({ baseUrl: 'http://localhost:4100' });
const { model } = await xlent.importWorkbook(file);
const { results } = await xlent.runModel(model.id, overrides);
```

Native models use semantic component keys and the same deterministic runtime,
tests, contracts, evidence, versioning, assurance, and delivery paths as imports.

## Core Principles

- **Deterministic execution** — same model + same inputs = same results
- **Provenance** — every number traceable to its source cell
- **Immutable originals** — uploaded workbooks are never modified
- **AI boundary** — AI assists discovery, never replaces calculation
- **Independence** — XLent operates standalone; Siliconomics is its first customer

## Blueprint

Full product blueprint, architecture spec, and agent-executable roadmap:

→ **[docs/README.md](docs/README.md)**
