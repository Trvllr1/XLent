import type { Model, ModelDiff } from '../types.js';

export interface MutationActor {
  id: string;
  type: 'human' | 'agent';
}

export interface SetParameterValueOperation {
  type: 'setParameterValue';
  parameterId: string;
  value: unknown;
}

export type MutationOperation = SetParameterValueOperation;

export interface MutationRequest {
  actor: MutationActor;
  rationale: string;
  operations: MutationOperation[];
}

export interface MutationValidationIssue {
  code: 'empty_batch' | 'duplicate_target' | 'parameter_not_found' | 'invalid_type' | 'outside_allowed_range';
  operationIndex?: number;
  message: string;
}

export interface MutationPreview {
  valid: boolean;
  baseVersion: number;
  proposedModel?: Model;
  diff?: ModelDiff;
  affectedOutputs: string[];
  validationIssues: MutationValidationIssue[];
}