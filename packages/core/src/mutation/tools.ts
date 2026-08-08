export interface MutationAgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const actorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'type'],
  properties: {
    id: { type: 'string', minLength: 1 },
    type: { type: 'string', enum: ['human', 'agent'] },
  },
};

const operationSchema = {
  type: 'object',
  required: ['type'],
  properties: {
    type: {
      type: 'string',
      enum: [
        'setParameterValue', 'renameParameter', 'addParameter', 'removeParameter', 'moveParameter',
        'setCellFormula', 'setParameterSource', 'extractFormula',
        'renameOutput', 'addOutput', 'removeOutput', 'moveOutput',
      ],
    },
    parameterId: { type: 'string', format: 'uuid' },
    outputId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    value: {},
    parameterType: { type: 'string', enum: ['number', 'string', 'date', 'boolean', 'error', 'blank'] },
    formula: { type: 'string' },
    sourceCell: { $ref: '#/$defs/cellAddress' },
    retargetCell: { $ref: '#/$defs/cellAddress' },
    componentId: { type: 'string' },
    componentName: { type: 'string' },
    toIndex: { type: 'integer', minimum: 0 },
  },
};

const requestProperties = {
  actor: actorSchema,
  rationale: { type: 'string', minLength: 1 },
  operations: { type: 'array', minItems: 1, items: operationSchema },
  findingId: { type: 'string' },
  breakpoints: { type: 'array', items: { type: 'object' } },
};

const commonDefinitions = {
  cellAddress: {
    type: 'object',
    additionalProperties: false,
    required: ['sheet', 'ref'],
    properties: {
      sheet: { type: 'string', minLength: 1 },
      ref: { type: 'string', pattern: '^[A-Z]+[0-9]+$' },
    },
  },
};

function mutationSchema(decision: boolean): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: decision
      ? ['modelId', 'actor', 'rationale', 'operations', 'baseVersion', 'previewId']
      : ['modelId', 'actor', 'rationale', 'operations'],
    properties: {
      modelId: { type: 'string', format: 'uuid' },
      ...requestProperties,
      ...(decision ? {
        baseVersion: { type: 'integer', minimum: 1 },
        previewId: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        approval: { type: 'object' },
      } : {}),
    },
    $defs: commonDefinitions,
  };
}

export const MUTATION_AGENT_TOOLS: readonly MutationAgentTool[] = [
  {
    name: 'xlent_preview_mutation',
    description: 'Deterministically preview a proposed model mutation. Returns semantic diff, impacts, tests, contract findings, watches, traces, and preview evidence without persistence.',
    inputSchema: mutationSchema(false),
  },
  {
    name: 'xlent_approve_mutation',
    description: 'Issue a server-signed approval for one preview. Human or policy-authorized human-equivalent reviewer credentials are required.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['modelId', 'actor', 'rationale', 'previewId'],
      properties: {
        modelId: { type: 'string', format: 'uuid' },
        actor: actorSchema,
        rationale: { type: 'string', minLength: 1 },
        previewId: { type: 'string', pattern: '^[a-f0-9]{64}$' },
      },
    },
  },
  {
    name: 'xlent_commit_mutation',
    description: 'Replay and atomically commit an approved mutation. Consequential agent changes require a signed independent approval unless policy grants human-equivalent authority.',
    inputSchema: mutationSchema(true),
  },
  {
    name: 'xlent_reject_mutation',
    description: 'Reject a preview without changing canonical model state and retain immutable decision evidence.',
    inputSchema: mutationSchema(true),
  },
  {
    name: 'xlent_undo_mutation',
    description: 'Restore a prior snapshot through the same deterministic preview, test, contract, evidence, and versioning gates.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['modelId', 'actor', 'rationale', 'baseVersion', 'targetSnapshotId'],
      properties: {
        modelId: { type: 'string', format: 'uuid' },
        actor: actorSchema,
        rationale: { type: 'string', minLength: 1 },
        baseVersion: { type: 'integer', minimum: 1 },
        targetSnapshotId: { type: 'string', format: 'uuid' },
      },
    },
  },
];