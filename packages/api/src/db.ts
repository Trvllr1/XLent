import Database, { type Database as DatabaseType } from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.XLENT_DB_PATH || path.join(process.cwd(), 'xlent.db');

const db: DatabaseType = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    semver TEXT NOT NULL DEFAULT '1.0.0',
    status TEXT NOT NULL DEFAULT 'draft',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    workbook_name TEXT NOT NULL,
    data TEXT NOT NULL
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_models_slug ON models(slug);

  CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    semver TEXT NOT NULL,
    message TEXT,
    checksum TEXT NOT NULL,
    created_at TEXT NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workbooks (
    model_id TEXT PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS originals (
    model_id TEXT PRIMARY KEY REFERENCES models(id) ON DELETE CASCADE,
    data BLOB NOT NULL
  );

  CREATE TABLE IF NOT EXISTS clients (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    webhook_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS deliveries (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    response_code INTEGER,
    pushed_at TEXT NOT NULL,
    delivered_at TEXT,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS model_tests (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    assertion TEXT NOT NULL,
    description TEXT,
    auto_generated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    model_version INTEGER NOT NULL,
    executed_at TEXT NOT NULL,
    data TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    model_version INTEGER NOT NULL,
    executed_at TEXT NOT NULL,
    duration_ms REAL NOT NULL,
    input_hash TEXT NOT NULL,
    output_hash TEXT NOT NULL,
    success INTEGER NOT NULL DEFAULT 1,
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_executions_model ON executions(model_id, executed_at);
`);

export default db;
