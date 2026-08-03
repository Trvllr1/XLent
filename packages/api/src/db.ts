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
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    workbook_name TEXT NOT NULL,
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
`);

export default db;
