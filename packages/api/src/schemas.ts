import { z } from 'zod';

export const runModelSchema = z.object({
  overrides: z.array(z.object({
    parameterId: z.string().uuid(),
    value: z.unknown(),
  })).optional(),
});

export const createScenarioSchema = z.object({
  name: z.string().min(1).max(200),
  overrides: z.array(z.object({
    parameterId: z.string().uuid(),
    value: z.unknown(),
  })).min(1),
});

export const compareSchema = z.object({
  baselineOverrides: z.array(z.object({
    parameterId: z.string().uuid(),
    value: z.unknown(),
  })).optional(),
  scenarioOverrides: z.array(z.object({
    parameterId: z.string().uuid(),
    value: z.unknown(),
  })).min(1),
  scenarioId: z.string().optional(),
});

export const deliverablePushSchema = z.object({
  callbackUrl: z.string().url(),
  overrides: z.array(z.object({
    parameterId: z.string().uuid(),
    value: z.unknown(),
  })).optional(),
});

export const deliverToClientSchema = z.object({
  clientId: z.string().uuid(),
  overrides: z.array(z.object({
    parameterId: z.string().uuid(),
    value: z.unknown(),
  })).optional(),
});

export const testAssertionSchema = z.object({
  type: z.enum(['equals', 'gt', 'lt', 'gte', 'lte', 'between', 'balance', 'non_negative', 'is_numeric', 'custom', 'regression_baseline', 'boundary', 'consistency']),
  left: z.string().min(1),
  right: z.unknown().optional(),
  rightB: z.unknown().optional(),
  tolerance: z.number().min(0).optional(),
  // E10.1 behavioral fields
  baseline: z.record(z.string(), z.unknown()).optional(),
  boundaryParams: z.array(z.object({ parameterId: z.string(), min: z.number(), max: z.number() })).optional(),
  consistencyPair: z.tuple([z.string(), z.string()]).optional(),
  regressionFor: z.string().optional(),
});

export const createTestSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(['structural', 'mathematical', 'business']),
  assertion: testAssertionSchema,
  description: z.string().max(1000).optional(),
});

export const createTestsSchema = z.object({
  tests: z.array(createTestSchema).min(1).max(100),
});

export const runTestsSchema = z.object({
  overrides: z.array(z.object({
    parameterId: z.string().uuid(),
    value: z.unknown(),
  })).optional(),
});

export const statusTransitionSchema = z.object({
  status: z.enum(['draft', 'sandbox', 'validated', 'approved', 'published', 'deprecated']),
});

export const metadataSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  owner: z.string().max(200).optional(),
  tags: z.array(z.string().min(1).max(60)).max(20).optional(),
});

const mutationRequestFields = {
  actor: z.object({
    id: z.string().min(1).max(200),
    type: z.enum(['human', 'agent']),
  }).strict(),
  rationale: z.string().min(1).max(2000),
  operations: z.array(z.object({
    type: z.literal('setParameterValue'),
    parameterId: z.string().uuid(),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }).strict()).min(1).max(100),
};

export const mutationPreviewSchema = z.object(mutationRequestFields).strict();

export const mutationCommitSchema = z.object({
  ...mutationRequestFields,
  baseVersion: z.number().int().positive(),
  previewId: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const mutationRejectSchema = mutationCommitSchema;

export const mutationUndoSchema = z.object({
  actor: mutationRequestFields.actor,
  rationale: mutationRequestFields.rationale,
  baseVersion: z.number().int().positive(),
  targetSnapshotId: z.string().uuid(),
}).strict();
