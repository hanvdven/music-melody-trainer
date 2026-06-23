import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readBoard, updateTask, seedFromJson, COLUMNS } from './kanbanStore.mjs';

// Exercises the SQLite-backed kanban store (node:sqlite) + the kanban.json fallback. KANBAN_DB_DIR is
// pointed at a temp dir so the real ~/.claude/kanban-dbs is never touched.
let tmpDir;
let jsonPath;

const fixture = () => ({
  project: 'fixture',
  columns: COLUMNS,
  tasks: [
    { id: 1, title: 'A', status: 'todo', priority: 'high', tags: ['x', 'y'], rank: 1000 },
    { id: 2, title: 'B', status: 'done', priority: 'low', tags: [], rank: 1000 },
  ],
});

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kanban-test-'));
  process.env.KANBAN_DB_DIR = tmpDir;
  jsonPath = path.join(tmpDir, 'kanban.json');
  fs.writeFileSync(jsonPath, JSON.stringify(fixture(), null, 2));
});

afterAll(() => {
  delete process.env.KANBAN_DB_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('kanbanStore', () => {
  it('reads from kanban.json when no DB exists (store: json)', () => {
    const board = readBoard({ jsonPath, project: 'no-such-db' });
    expect(board.store).toBe('json');
    expect(board.tasks).toHaveLength(2);
  });

  it('seeds the DB from kanban.json, then reads it live (store: db)', () => {
    const r = seedFromJson({ jsonPath, project: 'p1' });
    expect(r.seeded).toBe(2);

    const board = readBoard({ jsonPath, project: 'p1' });
    expect(board.store).toBe('db');
    expect(board.columns).toHaveLength(7);
    expect(board.tasks).toHaveLength(2);
    // tags round-trip through the DB's JSON string column back to an array
    const a = board.tasks.find((t) => t.id === 1);
    expect(a.tags).toEqual(['x', 'y']);
  });

  it('skips re-seeding unless forced', () => {
    const again = seedFromJson({ jsonPath, project: 'p1' });
    expect(again.skipped).toBe(true);
    const forced = seedFromJson({ jsonPath, project: 'p1', force: true });
    expect(forced.seeded).toBe(2);
  });

  it('updates a task status in the DB', () => {
    const r = updateTask({ jsonPath, project: 'p1', id: 1, status: 'impl', rank: 2000 });
    expect(r).toEqual({ store: 'db', ok: true });
    const board = readBoard({ jsonPath, project: 'p1' });
    expect(board.tasks.find((t) => t.id === 1).status).toBe('impl');
  });

  it('updates a task in kanban.json when no DB exists', () => {
    const r = updateTask({ jsonPath, project: 'no-such-db', id: 2, status: 'todo', rank: 500 });
    expect(r).toEqual({ store: 'json', ok: true });
    const onDisk = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    expect(onDisk.tasks.find((t) => t.id === 2).status).toBe('todo');
  });
});
