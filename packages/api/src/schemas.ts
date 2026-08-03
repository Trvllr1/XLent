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
