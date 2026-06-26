// Server-side kanban store — reads/writes the repo-root kanban.json.
// Used by the Vite dev-server API (vite.config.js) to serve GET /api/kanban
// and accept PATCH /api/kanban/task/:id from the in-app board.

import fs from 'fs';
import path from 'path';

const JSON_PATH = path.resolve(process.cwd(), 'kanban', 'kanban.json');

function load() {
  return JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
}

// Read the whole board from kanban.json.
// Returns { project, columns, tasks, store: 'json' }.
export function readBoard() {
  const data = load();
  return { ...data, store: 'json' };
}

// Update one task's status (and optionally rank) in kanban.json.
// Returns { store: 'json', ok: boolean }.
export function updateTask({ id, status, rank }) {
  const data = load();
  const task = (data.tasks || []).find((t) => t.id === id);
  if (!task) return { store: 'json', ok: false };
  task.status = status;
  if (rank != null) task.rank = rank;
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2) + '\n');
  return { store: 'json', ok: true };
}
