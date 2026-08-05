# 07 — Sil Integration

## Boundary Rules

These are inviolable:

1. **Sil never parses Excel.** XLent owns all workbook ingestion and model reconstruction.
2. **XLent never reasons.** XLent produces deterministic results and evidence. Sil interprets meaning, compares to reference models, and makes recommendations.
3. **Neither is a dependency of the other.** Both must function independently. The integration is via HTTP API and structured data contracts.

---

## Architecture

```
                         SIL
              Reasoning & Decision Layer
                         │
                    HTTP / SDK
                         │
                         ▼
                       XLENT
                 ModelOps Infrastructure
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
     Import           Verify           Execute
        ▼                ▼                ▼
       XMR           Evidence          Results
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                  Model Package
                         │
                         ▼
                        SIL
              Reference Model Comparison
              Agent Reasoning → Decision
```

---

## Current Integration (Verified)

### Sil → XLent (BYOA Flow)

**Files:**
- `src/utils/xlentClient.ts` — API wrapper functions
- `src/components/referenceModels/ByoaImport.tsx` — upload + execution UI
- `src/components/referenceModels/XLentConnector.tsx` — field mapping UI

**Flow:**
```
User selects .xlsx in Sil BYOA tab
       │
       ▼
xlentImport(file) ──────── POST http://localhost:4100/models/import
       │
       ▼
Model discovered; parameters + outputs displayed
       │
       ▼
User optionally overrides parameters
       │
       ▼
xlentRun(modelId, overrides) ──── POST /models/:id/run
       │
       ▼
Results displayed; user maps XLent outputs → Sil DesignModel fields
       │
       ▼
xlentCompare(modelId, ...) ──── POST /models/:id/compare
       │
       ▼
Comparison displayed (baseline vs scenario deltas)
```

### XLent → Sil (Webhook Delivery)

**Files:**
- `server.ts` — `/api/xlent-webhook` endpoint + inbox endpoints
- `src/components/referenceModels/XLentInbox.tsx` — inbox UI
- `src/App.tsx` — `xlentInbox` state + localStorage persistence

**Flow:**
```
XLent executes model and packages Deliverable
       │
       ▼
POST /models/:id/deliver { clientId: "sil" }
       │
       ▼
XLent POSTs to Sil's webhook URL ──── POST /api/xlent-webhook
       │                                Headers: x-xlent-signature
       ▼
Sil validates signature, stores in xlentInbox
       │
       ▼
Inbox UI shows pending deliverables
       │
       ├── Promote → creates Preview Build with XLent-derived fields
       │
       └── Dismiss → removes from inbox
```

### Field Mapping (XLent Output → Sil DesignModel)

The `XLentConnector` component auto-maps XLent output names to Sil's `DesignModel` fields:

| XLent Output Name | Sil DesignModel Field |
|---|---|
| Die Area | `dieArea` |
| Wafer Cost | `waferCost` |
| Transistor Count | `transistorCount` |
| TDP | `tdp` |
| Defect Density | `defectDensity` |
| Yield | `yield` |
| Unit Cost | `unitCost` |

Mapping is name-based with fuzzy matching. Unmapped fields require manual assignment.

### Build Derivation Tracking

When a Build is created from XLent data, it carries provenance:

```typescript
// In src/types.ts
interface Build {
  // ... existing fields ...
  derivationSource?: {
    type: 'xlent';
    modelId: string;
    modelName: string;
    pushedAt: string;
    fieldOverrides: Record<string, {
      xlentOutputId: string;
      xlentOutputName: string;
      value: unknown;
      confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    }>;
  };
}
```

---

## Sil API Surface (XLent-related)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/xlent-webhook` | POST | Receive deliverables from XLent |
| `/api/xlent-inbox` | GET | List pending inbox items |
| `/api/xlent-inbox/:id/promote` | POST | Convert inbox item to Build |
| `/api/xlent-inbox/:id/dismiss` | POST | Remove inbox item |

---

## Environment Configuration

```
# In Sil's .env
VITE_XLENT_API_URL=http://localhost:4100

# In XLent's .env (for webhook delivery back to Sil)
# Configured per-client via POST /clients { webhookUrl: "http://localhost:3000/api/xlent-webhook" }
```

---

## What Sil Asks (vs. What XLent Asks)

| XLent answers | Sil answers |
|---|---|
| What is this model? | So what? |
| How does it work? (structure, formulas) | What does it mean for our thesis? |
| Is it internally coherent? (tests, evidence) | How does it compare to our reference models? |
| What happens under different scenarios? | Which scenario should we adopt? |
| What evidence supports the result? | What should we recommend to the board? |

---

## Reverse Integration (XLent → Sil)

A user may discover XLent independently and want to continue analysis in Sil.

**Not yet implemented.** Design:

```
User imports model in XLent
       │
       ▼
XLent analyzes, tests, generates evidence
       │
       ▼
User clicks "Continue in Sil" (XLent web UI, future)
       │
       ▼
XLent packages Model Package
       │
       ▼
Redirects to Sil with package reference
       │
       ▼
Sil loads package, creates Build, begins reasoning
```

**Implementation trigger:** When XLent has its own user base separate from Sil users.

---

## Model Package v2 Consumption (E5)

When the Deliverable evolves into the full Model Package (doc 06), Sil's inbox and connector must be updated:

**Changes to Sil:**
1. Inbox displays assurance summary (pass/conditional/fail badge)
2. Findings shown before promote (critical findings block promotion)
3. Evidence record linked from Build for audit trail
4. Field mapping uses confidence scores from package

**Changes to XLent:**
1. `POST /models/:id/deliver` sends `ModelPackage` instead of `Deliverable`
2. Webhook payload versioned: `x-xlent-payload-version: 2`
3. Sil webhook handler accepts both v1 (Deliverable) and v2 (ModelPackage)

---

## Integration Testing

The E2E test (`XLent/test-e2e.mjs`) validates the XLent side of the pipeline. Sil-side integration is tested by:

1. Starting XLent API (`npm run dev` in XLent/)
2. Starting Sil server (`npm run dev` in Siliconomics root)
3. Uploading a model via Sil's BYOA tab
4. Verifying the round-trip: import → run → compare → deliver → inbox → promote

This is currently a manual integration test. Automating it is not prioritized until both APIs stabilize (post-E3).
