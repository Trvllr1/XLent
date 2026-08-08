import type { DebugFinding, Model, ModelDiff, ModelTestDefinition, ModelTestResult, Output, Parameter } from '../types.js';

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

export interface RenameOutputOperation {
  type: 'renameOutput';
  outputId: string;
  name: string;
}

export interface MoveOutputOperation {
  type: 'moveOutput';
  outputId: string;
  toIndex: number;
}

export interface RemoveOutputOperation {
  type: 'removeOutput';
  outputId: string;
}

export interface RestoreOutputOperation {
  type: 'restoreOutput';
  outputId: string;
  output: Output;
  index: number;
}

export interface RemoveParameterOperation {
  type: 'removeParameter';
  parameterId: string;
}

export interface MoveParameterOperation {
  type: 'moveParameter';
  parameterId: string;
  toIndex: number;
}

export interface RestoreParameterOperation {
  type: 'restoreParameter';
  parameterId: string;
  parameter: Parameter;
  index: number;
  graphIndex: number;
}

export type MutationOperation = SetParameterValueOperation | RenameParameterOperation | RenameOutputOperation | MoveOutputOperation | RemoveOutputOperation | RestoreOutputOperation | RemoveParameterOperation | MoveParameterOperation | RestoreParameterOperation;

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
  code: 'empty_batch' | 'duplicate_target' | 'parameter_not_found' | 'output_not_found' | 'parameter_already_exists' | 'output_already_exists' | 'invalid_type' | 'outside_allowed_range' | 'invalid_name' | 'duplicate_name' | 'invalid_index' | 'parameter_has_consumers' | 'parameter_has_contract_refs' | 'parameter_has_test_refs' | 'output_has_contract_refs' | 'output_has_test_refs';
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