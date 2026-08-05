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
  type: z.enum(['equals', 'gt', 'lt', 'gte', 'lte', 'between', 'balance', 'non_negative', 'custom']),
  left: z.string().min(1),
  right: z.unknown().optional(),
  rightB: z.unknown().optional(),
  tolerance: z.number().min(0).optional(),
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
