import crypto from 'crypto';
import { buildCalculations, discoverModel } from './discovery.js';
import { buildGraph } from './graph.js';
import { ModelRuntime } from './runtime.js';
import type { ParsedWorkbook } from './parser.js';
import type {
  CellType,
  Model,
  ModelTestDefinition,
  NativeModelDefinition,
  NativeScenarioDefinition,
} from './types.js';

export interface CompiledNativeModel {
  model: Model;
  workbook: ParsedWorkbook;
  tests: ModelTestDefinition[];
  scenarios: NativeScenarioDefinition[];
}

export interface NativeTemplate {
  id: string;
  name: string;
  description: string;
  definition: NativeModelDefinition;
}

const KEY_PATTERN = /^[a-z][a-z0-9_]*$/;

export function compileNativeModel(
  definition: NativeModelDefinition,
  metadata: { id?: string; slug?: string; createdAt?: string } = {},
): CompiledNativeModel {
  validateDefinition(definition);

  const modelId = metadata.id ?? crypto.randomUUID();
  const createdAt = metadata.createdAt ?? new Date().toISOString();
  const slug = metadata.slug ?? definition.slug ?? slugify(definition.name);
  const componentRows = new Map<string, number>();
  const componentNames = new Map<string, string>();
  let row = 1;

  for (const input of definition.inputs) {
    componentRows.set(input.key, row++);
    componentNames.set(input.key, input.name);
  }
  for (const formula of definition.formulas) {
    componentRows.set(formula.key, row++);
    componentNames.set(formula.key, formula.name);
  }

  const cells = [];
  for (const input of definition.inputs) {
    const inputRow = componentRows.get(input.key)!;
    cells.push(
      { address: { sheet: 'Model', ref: `A${inputRow}` }, value: input.name, type: 'string' as const },
      {
        address: { sheet: 'Model', ref: `B${inputRow}` },
        value: input.value,
        type: (input.type ?? inferCellType(input.value)) as CellType,
        format: input.format,
      },
    );
  }
  for (const formula of definition.formulas) {
    const formulaRow = componentRows.get(formula.key)!;
    cells.push(
      { address: { sheet: 'Model', ref: `A${formulaRow}` }, value: formula.name, type: 'string' as const },
      {
        address: { sheet: 'Model', ref: `B${formulaRow}` },
        value: null,
        type: 'number' as const,
        formula: compileExpression(formula.expression, componentRows),
        format: formula.format,
      },
    );
  }

  const workbook: ParsedWorkbook = {
    name: `${slug}.xlent`,
    sheets: [{ name: 'Model', cells }],
    namedRanges: [...componentRows].map(([key, componentRow]) => ({
      name: key,
      ref: `Model!$B$${componentRow}`,
      sheet: 'Model',
    })),
  };
  const graph = buildGraph(workbook);
  const discovery = discoverModel(workbook);
  const parameters = definition.inputs.map((input) => ({
    id: crypto.randomUUID(),
    semanticKey: input.key,
    name: input.name,
    type: (input.type ?? inferCellType(input.value)) as CellType,
    unit: input.unit,
    format: input.format,
    currentValue: input.value,
    originalValue: input.value,
    allowedRange: input.bounds,
    sourceCell: { sheet: 'Model', ref: `B${componentRows.get(input.key)!}` },
    source: 'SYSTEM_DEFAULT' as const,
    confidence: 'HIGH' as const,
    confirmed: true,
  }));
  const calculations = buildCalculations(workbook, graph).map((calculation) => {
    const semanticKey = [...componentRows].find(([, componentRow]) => calculation.sourceCell.ref === `B${componentRow}`)?.[0];
    return { ...calculation, semanticKey };
  });
  const outputs = definition.outputs.map((output) => ({
    id: crypto.randomUUID(),
    semanticKey: output.key,
    name: output.name,
    value: null,
    format: output.format,
    sourceCell: { sheet: 'Model', ref: `B${componentRows.get(output.component)!}` },
    dependsOn: [],
    confidence: 'HIGH' as const,
    confirmed: true,
  }));

  const model: Model = {
    id: modelId,
    name: definition.name,
    sourceKind: 'native',
    documentation: definition.documentation,
    nativeDefinition: structuredClone(definition),
    reviewRules: definition.reviewRules ?? [],
    slug,
    semver: '1.0.0',
    version: 1,
    status: 'draft',
    assuranceLevel: 'UNASSESSED',
    createdAt,
    workbookName: '',
    parameters,
    calculations,
    outputs,
    graph,
    compatibility: {
      status: discovery.compatibility,
      supportedFormulas: discovery.formulaCells - discovery.unsupportedFunctions,
      totalFormulas: discovery.formulaCells,
      issues: [],
    },
    discovery: {
      ...discovery,
      workbookName: '',
      inputCandidates: definition.inputs.length,
      outputCandidates: definition.outputs.length,
    },
    contract: structuredClone(definition.contract),
  };

  const results = new ModelRuntime(model, workbook).run();
  model.outputs = model.outputs.map((output) => ({ ...output, value: results[output.id] }));

  const outputRefs = new Map<string, string>();
  for (const output of model.outputs) {
    outputRefs.set(output.semanticKey!, output.id);
    outputRefs.set(output.name, output.id);
  }
  for (const [key, componentRow] of componentRows) {
    if (!outputRefs.has(key)) outputRefs.set(key, `Model!B${componentRow}`);
  }
  const tests: ModelTestDefinition[] = definition.tests.map((test) => ({
    id: crypto.randomUUID(),
    modelId,
    name: test.name,
    category: test.category,
    assertion: { ...test.assertion, left: outputRefs.get(test.assertion.left) ?? test.assertion.left },
    description: test.description,
    autoGenerated: false,
  }));

  return { model, workbook, tests, scenarios: structuredClone(definition.scenarios ?? []) };
}

export function listNativeTemplates(): NativeTemplate[] {
  return [structuredClone(UNIT_ECONOMICS_TEMPLATE)];
}

export function getNativeTemplate(id: string): NativeTemplate | undefined {
  return listNativeTemplates().find((template) => template.id === id);
}

function compileExpression(expression: string, componentRows: Map<string, number>): string {
  let compiled = expression.replace(/^\s*=\s*/, '');
  for (const [key, componentRow] of [...componentRows].sort(([left], [right]) => right.length - left.length)) {
    compiled = compiled.replace(new RegExp(`\\b${key}\\b`, 'g'), `B${componentRow}`);
  }
  return compiled.replace(/\s+/g, '');
}

function validateDefinition(definition: NativeModelDefinition): void {
  if (!definition.documentation.trim()) throw new Error('Native model documentation is required');
  if (!definition.contract) throw new Error('Native model contract is required');
  if (definition.tests.length === 0) throw new Error('Native model must include at least one test');

  const keys = [...definition.inputs.map((input) => input.key), ...definition.formulas.map((formula) => formula.key)];
  for (const key of keys) {
    if (!KEY_PATTERN.test(key)) throw new Error(`Invalid semantic key: ${key}`);
  }
  if (new Set(keys).size !== keys.length) throw new Error('Native model component keys must be unique');
  for (const output of definition.outputs) {
    if (!KEY_PATTERN.test(output.key)) throw new Error(`Invalid semantic key: ${output.key}`);
    if (!keys.includes(output.component)) throw new Error(`Unknown output component: ${output.component}`);
  }
}

function inferCellType(value: number | string | boolean): CellType {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'string';
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'native-model';
}

const UNIT_ECONOMICS_TEMPLATE: NativeTemplate = {
  id: 'unit-economics',
  name: 'Unit Economics',
  description: 'Revenue, contribution, operating profit, and operating margin with governed defaults.',
  definition: {
    name: 'Unit Economics Model',
    slug: 'unit-economics-model',
    documentation: 'A native operating model for evaluating revenue, contribution, operating profit, and margin from unit volume and cost assumptions.',
    inputs: [
      { key: 'units', name: 'Units', value: 1000, unit: 'units', bounds: { min: 0 }, description: 'Units sold in the modeled period.' },
      { key: 'price', name: 'Price per Unit', value: 120, unit: 'USD/unit', bounds: { min: 0 } },
      { key: 'variable_cost', name: 'Variable Cost per Unit', value: 65, unit: 'USD/unit', bounds: { min: 0 } },
      { key: 'fixed_cost', name: 'Fixed Cost', value: 25000, unit: 'USD', bounds: { min: 0 } },
    ],
    formulas: [
      { key: 'revenue', name: 'Revenue', expression: 'units * price', unit: 'USD' },
      { key: 'contribution', name: 'Contribution', expression: 'units * (price - variable_cost)', unit: 'USD' },
      { key: 'operating_profit', name: 'Operating Profit', expression: 'contribution - fixed_cost', unit: 'USD' },
      { key: 'operating_margin', name: 'Operating Margin', expression: 'operating_profit / revenue', unit: 'ratio', format: '0.0%' },
    ],
    outputs: [
      { key: 'revenue_output', name: 'Revenue', component: 'revenue', unit: 'USD' },
      { key: 'profit_output', name: 'Operating Profit', component: 'operating_profit', unit: 'USD' },
      { key: 'margin_output', name: 'Operating Margin', component: 'operating_margin', unit: 'ratio', format: '0.0%' },
    ],
    contract: {
      purpose: 'Evaluate operating unit economics from explicit volume, price, and cost assumptions.',
      declaredInputs: [
        { name: 'Units', unit: 'units', bounds: { min: 0 } },
        { name: 'Price per Unit', unit: 'USD/unit', bounds: { min: 0 } },
        { name: 'Variable Cost per Unit', unit: 'USD/unit', bounds: { min: 0 } },
        { name: 'Fixed Cost', unit: 'USD', bounds: { min: 0 } },
      ],
      declaredOutputs: [
        { name: 'Revenue', unit: 'USD', expectation: 'non-negative' },
        { name: 'Operating Profit', unit: 'USD' },
        { name: 'Operating Margin', unit: 'ratio' },
      ],
      invariants: [{ id: 'UE-C001', expression: 'Units >= 0', description: 'Volume cannot be negative.' }],
      rules: [
        { id: 'UE-R001', expression: 'Revenue = Units × Price per Unit', severity: 'critical' },
        { id: 'UE-R002', expression: 'Operating Profit = Units × (Price per Unit - Variable Cost per Unit) - Fixed Cost', severity: 'critical' },
      ],
      behaviors: [{ id: 'UE-B001', statement: 'Increasing price must not reduce revenue when units are constant.' }],
      version: '1.0.0',
    },
    tests: [
      { name: 'Revenue matches starter baseline', category: 'mathematical', assertion: { type: 'equals', left: 'revenue_output', right: 120000 } },
      { name: 'Operating profit matches starter baseline', category: 'mathematical', assertion: { type: 'equals', left: 'profit_output', right: 30000 } },
      { name: 'Revenue is non-negative', category: 'business', assertion: { type: 'non_negative', left: 'revenue_output' } },
    ],
    scenarios: [{ name: 'Higher volume', overrides: { units: 1250 } }],
    reviewRules: ['Review any negative operating margin.', 'Require evidence before changing price or cost assumptions.'],
  },
};