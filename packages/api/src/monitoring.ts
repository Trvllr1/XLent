import crypto from 'crypto';
import db from './db.js';

/**
 * E11.3 — Execution monitoring. Every model execution is logged with a
 * timestamp, input hash, output hash, and duration. From that log we derive
 * per-model statistics (frequency, average duration, last run) and flag
 * anomalies: a duration more than 3σ above the historical mean, or an input
 * hash never seen before (input drift).
 */

export interface ExecutionRecord {
  id: string;
  modelId: string;
  modelVersion: number;
  executedAt: string;
  durationMs: number;
  inputHash: string;
  outputHash: string;
  success: boolean;
  error?: string;
}

export interface ExecutionStats {
  modelId: string;
  totalRuns: number;
  lastRunAt: string | null;
  avgDurationMs: number | null;
  stddevDurationMs: number | null;
  distinctInputs: number;
  /** Runs whose duration exceeded mean + 3σ. */
  anomalies: ExecutionRecord[];
  /** The most recent input hash and whether it was ever seen before that run. */
  inputDrift: { lastInputHash: string | null; firstSeenAt: string | null; isNewInput: boolean };
}

function hash(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

const insertStmt = () => db.prepare(`INSERT INTO executions
  (id, model_id, model_version, executed_at, duration_ms, input_hash, output_hash, success, error)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);

/** Record one execution. Call around runtime.run(). */
export function logExecution(entry: Omit<ExecutionRecord, 'id' | 'executedAt' | 'inputHash' | 'outputHash'> & {
  inputs: unknown;
  outputs: unknown;
}): ExecutionRecord {
  const record: ExecutionRecord = {
    id: crypto.randomUUID(),
    modelId: entry.modelId,
    modelVersion: entry.modelVersion,
    executedAt: new Date().toISOString(),
    durationMs: entry.durationMs,
    inputHash: hash(entry.inputs),
    outputHash: hash(entry.outputs),
    success: entry.success,
    error: entry.error,
  };
  insertStmt().run(
    record.id, record.modelId, record.modelVersion, record.executedAt,
    record.durationMs, record.inputHash, record.outputHash,
    record.success ? 1 : 0, record.error ?? null,
  );
  return record;
}

interface Row {
  id: string; model_id: string; model_version: number; executed_at: string;
  duration_ms: number; input_hash: string; output_hash: string; success: number; error: string | null;
}

function toRecord(r: Row): ExecutionRecord {
  return {
    id: r.id, modelId: r.model_id, modelVersion: r.model_version, executedAt: r.executed_at,
    durationMs: r.duration_ms, inputHash: r.input_hash, outputHash: r.output_hash,
    success: r.success === 1, error: r.error ?? undefined,
  };
}

/** Compute monitoring statistics for a model. */
export function executionStats(modelId: string): ExecutionStats {
  const rows = db.prepare('SELECT * FROM executions WHERE model_id = ? ORDER BY executed_at ASC').all(modelId) as Row[];
  const records = rows.map(toRecord);
  const totalRuns = records.length;
  if (totalRuns === 0) {
    return { modelId, totalRuns: 0, lastRunAt: null, avgDurationMs: null, stddevDurationMs: null, distinctInputs: 0, anomalies: [], inputDrift: { lastInputHash: null, firstSeenAt: null, isNewInput: false } };
  }

  const durations = records.map((r) => r.durationMs);
  const mean = durations.reduce((a, b) => a + b, 0) / totalRuns;
  const variance = durations.reduce((a, d) => a + (d - mean) ** 2, 0) / totalRuns;
  const stddev = Math.sqrt(variance);
  const threshold = mean + 3 * stddev;
  const anomalies = stddev > 0 ? records.filter((r) => r.durationMs > threshold) : [];

  const firstSeenByHash = new Map<string, string>();
  for (const r of records) if (!firstSeenByHash.has(r.inputHash)) firstSeenByHash.set(r.inputHash, r.executedAt);

  const last = records[totalRuns - 1];
  const lastFirstSeen = firstSeenByHash.get(last.inputHash) ?? null;

  return {
    modelId,
    totalRuns,
    lastRunAt: last.executedAt,
    avgDurationMs: mean,
    stddevDurationMs: stddev,
    distinctInputs: firstSeenByHash.size,
    anomalies,
    inputDrift: {
      lastInputHash: last.inputHash,
      firstSeenAt: lastFirstSeen,
      // Input drift = the latest run used an input combination never seen in any prior run.
      isNewInput: lastFirstSeen === last.executedAt && totalRuns > 1,
    },
  };
}

/** Recent execution history for a model (newest first). */
export function listExecutions(modelId: string, limit = 50): ExecutionRecord[] {
  const rows = db.prepare('SELECT * FROM executions WHERE model_id = ? ORDER BY executed_at DESC LIMIT ?').all(modelId, limit) as Row[];
  return rows.map(toRecord);
}
