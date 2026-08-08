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

const semanticKeySchema = z.string().regex(/^[a-z][a-z0-9_]*$/);

const nativeContractSchema = z.object({
  purpose: z.string().min(1),
  declaredInputs: z.array(z.object({
    name: z.string().min(1),
    unit: z.string().optional(),
    description: z.string().optional(),
    bounds: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  })),
  declaredOutputs: z.array(z.object({
    name: z.string().min(1),
    unit: z.string().optional(),
    meaning: z.string().optional(),
    expectation: z.string().optional(),
  })),
  invariants: z.array(z.object({ id: z.string().min(1), expression: z.string().min(1), description: z.string().optional() })),
  rules: z.array(z.object({
    id: z.string().min(1),
    expression: z.string().min(1),
    description: z.string().optional(),
    severity: z.enum(['critical', 'warning', 'info']).optional(),
    scope: z.string().optional(),
  })),
  behaviors: z.array(z.object({ id: z.string().min(1), statement: z.string().min(1), description: z.string().optional() })).optional(),
  version: z.string().min(1),
});

export const nativeDefinitionSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).optional(),
  documentation: z.string().min(1).max(10000),
  inputs: z.array(z.object({
    key: semanticKeySchema,
    name: z.string().min(1).max(200),
    value: z.union([z.number(), z.string(), z.boolean()]),
    type: z.enum(['number', 'string', 'boolean']).optional(),
    unit: z.string().max(100).optional(),
    format: z.string().max(100).optional(),
    description: z.string().max(1000).optional(),
    bounds: z.object({ min: z.number().optional(), max: z.number().optional() }).optional(),
  })).min(1).max(200),
  formulas: z.array(z.object({
    key: semanticKeySchema,
    name: z.string().min(1).max(200),
    expression: z.string().min(1).max(2000),
    unit: z.string().max(100).optional(),
    format: z.string().max(100).optional(),
    description: z.string().max(1000).optional(),
  })).min(1).max(500),
  outputs: z.array(z.object({
    key: semanticKeySchema,
    name: z.string().min(1).max(200),
    component: semanticKeySchema,
    unit: z.string().max(100).optional(),
    format: z.string().max(100).optional(),
    description: z.string().max(1000).optional(),
  })).min(1).max(200),
  contract: nativeContractSchema,
  tests: z.array(z.object({
    name: z.string().min(1).max(200),
    category: z.enum(['structural', 'mathematical', 'business']),
    assertion: testAssertionSchema,
    description: z.string().max(1000).optional(),
  })).min(1).max(100),
  scenarios: z.array(z.object({
    name: z.string().min(1).max(200),
    overrides: z.record(semanticKeySchema, z.unknown()),
  })).max(20).optional(),
  reviewRules: z.array(z.string().min(1).max(1000)).max(50).optional(),
}).strict();

export const createNativeModelSchema = z.object({
  templateId: z.string().min(1).max(100).optional(),
  name: z.string().min(1).max(200).optional(),
  definition: nativeDefinitionSchema.optional(),
}).strict().refine((value) => Boolean(value.templateId) !== Boolean(value.definition), {
  message: 'Provide exactly one of templateId or definition',
});

const mutationRequestFields = {
  actor: z.object({
    id: z.string().min(1).max(200),
    type: z.enum(['human', 'agent']),
  }).strict(),
  rationale: z.string().min(1).max(2000),
  operations: z.array(z.discriminatedUnion('type', [
    z.object({
      type: z.literal('setParameterValue'),
      parameterId: z.string().uuid(),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    }).strict(),
    z.object({
      type: z.literal('renameParameter'),
      parameterId: z.string().uuid(),
      name: z.string().min(1).max(200),
    }).strict(),
    z.object({
      type: z.literal('addParameter'),
      parameterId: z.string().uuid(),
      name: z.string().min(1).max(200),
      parameterType: z.enum(['number', 'string', 'date', 'boolean', 'error', 'blank']),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
    }).strict(),
    z.object({
      type: z.literal('setCellFormula'),
      sourceCell: z.object({
        sheet: z.string().min(1).max(200),
        ref: z.string().regex(/^[A-Z]+\d+$/),
      }).strict(),
      formula: z.string().min(1).max(2000),
    }).strict(),
    z.object({
      type: z.literal('setParameterSource'),
      parameterId: z.string().uuid(),
      formula: z.string().min(1).max(2000),
    }).strict(),
    z.object({
      type: z.literal('extractFormula'),
      componentId: z.string().min(1).max(200),
      componentName: z.string().min(1).max(200),
      formula: z.string().min(1).max(2000),
      retargetCell: z.object({
        sheet: z.string().min(1).max(200),
        ref: z.string().regex(/^[A-Z]+\d+$/),
      }).strict(),
    }).strict(),
    z.object({
      type: z.literal('renameOutput'),
      outputId: z.string().uuid(),
      name: z.string().min(1).max(200),
    }).strict(),
    z.object({
      type: z.literal('addOutput'),
      outputId: z.string().uuid(),
      name: z.string().min(1).max(200),
      sourceCell: z.object({
        sheet: z.string().min(1).max(200),
        ref: z.string().regex(/^[A-Z]+\d+$/),
      }).strict(),
    }).strict(),
    z.object({
      type: z.literal('moveOutput'),
      outputId: z.string().uuid(),
      toIndex: z.number().int().min(0),
    }).strict(),
    z.object({
      type: z.literal('removeOutput'),
      outputId: z.string().uuid(),
    }).strict(),
    z.object({
      type: z.literal('removeParameter'),
      parameterId: z.string().uuid(),
    }).strict(),
    z.object({
      type: z.literal('moveParameter'),
      parameterId: z.string().uuid(),
      toIndex: z.number().int().min(0),
    }).strict(),
  ])).min(1).max(100),
  breakpoints: z.array(z.discriminatedUnion('kind', [
    z.object({
      id: z.string().min(1).max(200),
      kind: z.literal('value'),
      cellId: z.string().regex(/^.+![A-Z]+\d+$/),
      operator: z.enum(['<', '<=', '>', '>=', '==', '!=']),
      value: z.union([z.number(), z.boolean()]),
    }).strict(),
    z.object({
      id: z.string().min(1).max(200),
      kind: z.literal('assumptionChanged'),
      parameterId: z.string().uuid().optional(),
    }).strict(),
  ])).max(50).optional(),
  findingId: z.string().min(1).max(200).optional(),
};

export const mutationPreviewSchema = z.object(mutationRequestFields).strict();

const mutationApprovalSchema = z.object({
  actor: mutationRequestFields.actor,
  decision: z.literal('approved'),
  rationale: z.string().min(1).max(2000),
  previewId: z.string().regex(/^[a-f0-9]{64}$/),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const mutationApproveSchema = z.object({
  actor: mutationRequestFields.actor,
  rationale: z.string().min(1).max(2000),
  previewId: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const mutationCommitSchema = z.object({
  ...mutationRequestFields,
  baseVersion: z.number().int().positive(),
  previewId: z.string().regex(/^[a-f0-9]{64}$/),
  approval: mutationApprovalSchema.optional(),
}).strict();

export const mutationRejectSchema = z.object({
  ...mutationRequestFields,
  baseVersion: z.number().int().positive(),
  previewId: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export const mutationUndoSchema = z.object({
  actor: mutationRequestFields.actor,
  rationale: mutationRequestFields.rationale,
  baseVersion: z.number().int().positive(),
  targetSnapshotId: z.string().uuid(),
}).strict();
