import type { DebugFinding, Model, ModelDiff, ModelTestDefinition, ModelTestResult } from '../types.js';

export interface MutationActor {
  id: string;
  type: 'human' | 'agent';
}

export interface SetParameterValueOperation {
  type: 'setParameterValue';
  parameterId: string;
  value: unknown;
}

export interface RenameParameterOperation {
  type: 'renameParameter';
  parameterId: string;
  name: string;
}

export type MutationOperation = SetParameterValueOperation | RenameParameterOperation;

export interface MutationRequest {
  actor: MutationActor;
  rationale: string;
  operations: MutationOperation[];
}

export interface MutationCommitRequest extends MutationRequest {
  baseVersion: number;
  previewId: string;
}

export interface MutationUndoRequest {
  actor: MutationActor;
  rationale: string;
  baseVersion: number;
  targetSnapshotId: string;
}

export interface MutationValidationIssue {
  code: 'empty_batch' | 'duplicate_target' | 'parameter_not_found' | 'invalid_type' | 'outside_allowed_range' | 'invalid_name' | 'duplicate_name';
  operationIndex?: number;
  message: string;
}

export interface MutationPreview {
  valid: boolean;
  baseVersion: number;
  previewId?: string;
  proposedModel?: Model;
  proposedTests?: ModelTestDefinition[];
  diff?: ModelDiff;
  affectedComponents: string[];
  affectedOutputs: string[];
  evidenceRefs: Array<{ kind: 'preview'; checksum: string }>;
  testResults: ModelTestResult[];
  allTestsPass: boolean;
  contractFindings: DebugFinding[];
  validationIssues: MutationValidationIssue[];
}

export interface MutationCommitResult {
  model: Model;
  diff: ModelDiff;
  affectedComponents: string[];
  affectedOutputs: string[];
  tests: ModelTestResult[];
  contractFindings: DebugFinding[];
  snapshotId: string;
  evidenceId: string;
}