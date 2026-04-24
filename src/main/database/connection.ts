import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

let db: Database.Database | null = null

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL DEFAULT 'Untitled Guide',
  description    TEXT NOT NULL DEFAULT '',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  thumbnail_path TEXT,
  step_count     INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'draft'
);

CREATE TABLE IF NOT EXISTS steps (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  order_index      REAL NOT NULL,
  action_type      TEXT NOT NULL DEFAULT 'click',
  x                INTEGER,
  y                INTEGER,
  scroll_delta_x   INTEGER,
  scroll_delta_y   INTEGER,
  typed_text       TEXT,
  key_name         TEXT,
  app_name         TEXT,
  window_title     TEXT,
  url              TEXT,
  screenshot_path  TEXT,
  screenshot_width  INTEGER,
  screenshot_height INTEGER,
  description      TEXT NOT NULL DEFAULT '',
  ai_raw_response  TEXT,
  ai_status        TEXT NOT NULL DEFAULT 'pending',
  ai_error         TEXT,
  annotations      TEXT NOT NULL DEFAULT '[]',
  captured_at      INTEGER NOT NULL,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_steps_project_order ON steps(project_id, order_index);
CREATE INDEX IF NOT EXISTS idx_steps_ai_pending ON steps(project_id, ai_status) WHERE ai_status = 'pending';
`

const MIGRATIONS = [
  {
    version: 1,
    alters: [
      'ALTER TABLE steps ADD COLUMN full_screenshot_path TEXT',
      'ALTER TABLE steps ADD COLUMN crop_x INTEGER',
      'ALTER TABLE steps ADD COLUMN crop_y INTEGER',
      'ALTER TABLE steps ADD COLUMN crop_radius INTEGER',
      'ALTER TABLE steps ADD COLUMN scale_factor REAL'
    ]
  }
]

function runMigrations(database: Database.Database): void {
  for (const m of MIGRATIONS) {
    const already = database.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(m.version)
    if (already) continue
    for (const sql of m.alters) {
      try { database.exec(sql) } catch { /* column may already exist */ }
    }
    database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(m.version, Date.now())
  }
}

export function initDatabase(): Database.Database {
  const dbDir = join(app.getPath('userData'), 'data')
  mkdirSync(dbDir, { recursive: true })
  const dbPath = join(dbDir, 'sopbuilder.db')

  db = new Database(dbPath)
  db.exec(SCHEMA)
  runMigrations(db)

  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

export function closeDatabase(): void {
  db?.close()
  db = null
}
