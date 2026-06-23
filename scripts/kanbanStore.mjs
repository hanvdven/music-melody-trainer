// Server-side kanban store (Han 2026-06-22, Option B: "Bord ↔ live agent-DB").
//
// Single access point used by the Vite dev-server API (vite.config.js), the seed CLI
// (kanban-seed.mjs), and the unit test. It reads/writes the cyanluna agent store — a local SQLite
// DB at ~/.claude/kanban-dbs/{project}.db (the SAME file the vendored /kanban-* skills + agents use,
// see .claude/skills/kanban/schema.md) — and falls back to the repo-root kanban.json when no DB
// exists yet.
//
// node:sqlite is built into Node 22+ (experimental). We use it instead of the sqlite3 CLI because
// the CLI isn't always installed; the .db file format is identical, so the cyanluna skills and this
// module interoperate on the same file.

import { createRequire } from 'node:module';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Load node:sqlite via a runtime require. A static `import ... from 'node:sqlite'` makes vite's
// transform pipeline (used by vitest) try to bundle the experimental builtin and fail; a require()
// is opaque to that analyzer and resolves natively in Node 22+.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite');

// The 7-column cyanluna pipeline. The DB doesn't store column metadata, so this is the source of
// truth for column order/labels in DB mode (matches kanban.json's columns for JSON mode).
export const COLUMNS = [
  { id: 'todo', title: 'Req' },
  { id: 'plan', title: 'Plan' },
  { id: 'plan_review', title: 'Review Plan' },
  { id: 'impl', title: 'Impl' },
  { id: 'impl_review', title: 'Review Impl' },
  { id: 'test', title: 'Test' },
  { id: 'done', title: 'Done' },
];

// Verbatim from .claude/skills/kanban/schema.md so a DB we create is byte-compatible with what
// /kanban-init expects (its idempotent ADD COLUMN migrations will top up anything missing).
const TASKS_DDL = `
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    description TEXT,
    plan TEXT,
    implementation_notes TEXT,
    tags TEXT DEFAULT '[]',
    review_comments TEXT DEFAULT '[]',
    plan_review_comments TEXT DEFAULT '[]',
    test_results TEXT DEFAULT '[]',
    agent_log TEXT DEFAULT '[]',
    notes TEXT DEFAULT '[]',
    current_agent TEXT,
    plan_review_count INTEGER NOT NULL DEFAULT 0,
    impl_review_count INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 3,
    attachments TEXT DEFAULT '[]',
    decision_log TEXT,
    done_when TEXT,
    rank INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    started_at TEXT,
    planned_at TEXT,
    reviewed_at TEXT,
    tested_at TEXT,
    completed_at TEXT
  )
`;

// The timestamp column cyanluna stamps when a task enters a given status (see kanban-api.ts).
const STATUS_TIMESTAMP = {
  plan: 'started_at',
  plan_review: 'planned_at',
  test: 'tested_at',
  done: 'completed_at',
};

export function dbPathFor(project) {
  // KANBAN_DB_DIR override exists for tests; default is the cyanluna convention.
  const dir = process.env.KANBAN_DB_DIR || path.join(os.homedir(), '.claude', 'kanban-dbs');
  return path.join(dir, `${project}.db`);
}

function safeParseTags(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; }
}

// Read the whole board. DB wins when its file exists; otherwise the kanban.json file.
// Returns { project, columns, tasks, store: 'db' | 'json' }.
export function readBoard({ jsonPath, project }) {
  const dbPath = dbPathFor(project);
  if (fs.existsSync(dbPath)) {
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const rows = db.prepare(
        `SELECT id, title, status, priority, description, tags, rank, created_at
         FROM tasks WHERE project = ? ORDER BY rank, id`
      ).all(project);
      const tasks = rows.map((r) => ({ ...r, tags: safeParseTags(r.tags) }));
      return { project, columns: COLUMNS, tasks, store: 'db' };
    } finally {
      db.close();
    }
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  return { columns: COLUMNS, ...data, store: 'json' };
}

// Update one task's column (and optionally rank). DB mode → UPDATE row; JSON mode → rewrite file.
// Returns { store, ok }.
export function updateTask({ jsonPath, project, id, status, rank }) {
  const dbPath = dbPathFor(project);
  if (fs.existsSync(dbPath)) {
    const db = new DatabaseSync(dbPath);
    try {
      const sets = ['status = ?', 'rank = ?', "updated_at = datetime('now')"];
      const vals = [status, rank];
      const tsCol = STATUS_TIMESTAMP[status];
      if (tsCol) sets.push(`${tsCol} = datetime('now')`);
      vals.push(id, project);
      const info = db.prepare(
        `UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND project = ?`
      ).run(...vals);
      return { store: 'db', ok: info.changes > 0 };
    } finally {
      db.close();
    }
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const task = (data.tasks || []).find((t) => t.id === id);
  if (!task) return { store: 'json', ok: false };
  task.status = status;
  if (rank != null) task.rank = rank;
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n');
  return { store: 'json', ok: true };
}

// One-time seed: push kanban.json tasks into the DB (creating it if needed). Skips if the project
// already has rows, unless force=true (which clears this project's rows first). Returns { seeded, skipped }.
export function seedFromJson({ jsonPath, project, force = false }) {
  const dbPath = dbPathFor(project);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(TASKS_DDL);
    const existing = db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE project = ?').get(project).n;
    if (existing > 0 && !force) return { seeded: 0, skipped: true, existing };
    if (force) db.prepare('DELETE FROM tasks WHERE project = ?').run(project);

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const insert = db.prepare(
      `INSERT INTO tasks (id, project, title, status, priority, description, tags, rank, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let seeded = 0;
    for (const t of data.tasks || []) {
      insert.run(
        t.id, project, t.title, t.status || 'todo', t.priority || 'medium',
        t.description || null, JSON.stringify(t.tags || []), t.rank || 0,
        t.created_at || new Date().toISOString()
      );
      seeded++;
    }
    return { seeded, skipped: false };
  } finally {
    db.close();
  }
}
