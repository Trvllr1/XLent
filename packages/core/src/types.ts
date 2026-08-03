/** Core domain types for XLent model engine. */

export type CellAddress = { sheet: string; ref: string };

export type CellType = 'number' | 'string' | 'date' | 'boolean' | 'error' | 'blank';

export interface Cell {
  address: CellAddress;
  value: unknown;
  type: CellType;
  formula?: string;
  format?: string;
}

export type ParameterSource =
  | 'CLIENT_MODEL'
  | 'USER_OVERRIDE'
  | 'SYSTEM_DEFAULT'
  | 'EXTERNAL_DATA';

export interface Parameter {
  id: string;
  name: string;
  type: CellType;
  unit?: string;
  currentValue: unknown;
  originalValue: unknown;
  allowedRange?: { min?: number; max?: number };
  sourceCell: CellAddress;
  source: ParameterSource;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confirmed: boolean;
}

export interface Calculation {
  id: string;
  sourceCell: CellAddress;
  originalFormula: string;
  normalizedFormula?: string;
  dependencies: string[]; // cell refs
  downstreamOutputs: string[];
}

export interface Output {
  id: string;
  name: string;
  value: unknown;
  sourceCell: CellAddress;
  dependsOn: string[]; // parameter IDs
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confirmed: boolean;
}

export interface DependencyEdge {
  from: string; // cell ref
  to: string; // cell ref
}

export interface DependencyGraph {
  nodes: string[];
  edges: DependencyEdge[];
}

export type CompatibilityStatus = 'VALID' | 'PARTIAL' | 'INVALID';

export interface CompatibilityIssue {
  type: 'unsupported_function' | 'external_reference' | 'circular_dependency' | 'vba' | 'error';
  cell?: CellAddress;
  detail: string;
  severity: 'error' | 'warning' | 'info';
}

export interface CompatibilityReport {
  status: CompatibilityStatus;
  supportedFormulas: number;
  totalFormulas: number;
  issues: CompatibilityIssue[];
}

export interface ModelDiscovery {
  workbookName: string;
  sheets: number;
  formulaCells: number;
  inputCandidates: number;
  outputCandidates: number;
  crossSheetReferences: number;
  externalReferences: number;
  namedRanges: number;
  unsupportedFunctions: number;
  circularDependencies: number;
  compatibility: CompatibilityStatus;
}

export interface Model {
  id: string;
  name: string;
  version: number;
  createdAt: string;
  workbookName: string;
  parameters: Parameter[];
  calculations: Calculation[];
  outputs: Output[];
  graph: DependencyGraph;
  compatibility: CompatibilityReport;
  discovery: ModelDiscovery;
}

export interface ScenarioOverride {
  parameterId: string;
  value: unknown;
}

export interface Scenario {
  id: string;
  modelId: string;
  modelVersion: number;
  name: string;
  overrides: ScenarioOverride[];
  results: Record<string, unknown>; // output id → value
  createdAt: string;
}

export interface ComparisonRow {
  outputId: string;
  outputName: string;
  baseline: unknown;
  scenario: unknown;
  delta: number | null;
  percentDelta: number | null;
}

export interface Comparison {
  modelId: string;
  baselineScenarioId: string | null; // null = model defaults
  comparedScenarioId: string;
  rows: ComparisonRow[];
}

export interface Provenance {
  parameterId: string;
  source: ParameterSource;
  workbook?: string;
  sheet?: string;
  cell?: string;
  modified: boolean;
  modifiedBy?: string;
  modifiedAt?: string;
}
