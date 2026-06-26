// One-shot importer: kanban/kanban.json -> PGlite DB at ~/.claude/kanban-board-data.
// Run with the dev server STOPPED (PGlite holds a single-process file lock).
//
// Usage: node scripts/import-kanban-json.mjs

import { PGlite } from '@electric-sql/pglite';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const SRC = join(process.cwd(), 'kanban', 'kanban.json');
const DB_DIR = process.env.KANBAN_DB_DIR || join(homedir(), '.claude', 'kanban-board-data');

mkdirSync(DB_DIR, { recursive: true });
const db = new PGlite(DB_DIR);

// Minimal schema mirror — only the columns we touch. The board's own
// initializeSchema() runs more migrations on first dev-server boot.
await db.query(`
  CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    project TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    priority TEXT NOT NULL DEFAULT 'medium',
    description TEXT,
    tags TEXT,
    level INTEGER NOT NULL DEFAULT 3,
    rank INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
  )
`);

const src = JSON.parse(readFileSync(SRC, 'utf8'));
const project = src.project || 'music-melody-trainer';
const tasks = src.tasks || [];

const existing = await db.query(
  `SELECT COUNT(*)::int AS n FROM tasks WHERE project = $1`, [project]
);
if (existing.rows[0].n > 0) {
  console.error(`Aborting: ${existing.rows[0].n} tasks already exist for project '${project}'.`);
  console.error(`Delete them first or pass a different project name.`);
  process.exit(1);
}

let imported = 0;
for (const t of tasks) {
  // Preserve original IDs so any external references in BACKLOG.md / commits
  // keep pointing at the right task.
  const tags = Array.isArray(t.tags) ? JSON.stringify(t.tags)
            : typeof t.tags === 'string' ? t.tags
            : null;
  await db.query(
    `INSERT INTO tasks (id, project, title, status, priority, description, tags, level, rank, created_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      t.id,
      project,
      t.title || 'Untitled',
      t.status || 'todo',
      t.priority || 'medium',
      t.description ?? null,
      tags,
      Number.isInteger(t.level) ? t.level : 3,
      Number.isInteger(t.rank) ? t.rank : 0,
      t.created_at || new Date().toISOString(),
      t.status === 'done' ? (t.completed_at || t.created_at || new Date().toISOString()) : null,
    ]
  );
  imported++;
}

// Bump the SERIAL sequence past the max preserved id so new tasks don't collide.
await db.query(`SELECT setval(pg_get_serial_sequence('tasks','id'), COALESCE((SELECT MAX(id) FROM tasks), 1))`);

console.log(`Imported ${imported} tasks into project '${project}'.`);
await db.close();
