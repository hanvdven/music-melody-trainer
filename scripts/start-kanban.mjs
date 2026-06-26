import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

// Pin to 5500 with --strictPort so the board never silently lands on a random
// port and never fights this repo's app dev server for 5173.
const dir = join(homedir(), '.claude', 'kanban-board');

// Tell the board which project launched it, so its UI can auto-select that
// project on first boot (no "select a project first" friction when adding a
// task from a fresh browser). Prefer .codex/kanban.json's explicit name, fall
// back to the repo folder name.
let callerProject = basename(process.cwd());
try {
  const cfg = JSON.parse(readFileSync(join(process.cwd(), '.codex', 'kanban.json'), 'utf8'));
  if (typeof cfg.project === 'string' && cfg.project) callerProject = cfg.project;
} catch { /* no .codex/kanban.json — fall back to folder name */ }

// Port is pinned in ~/.claude/kanban-board/vite.config.ts (server.port=5500,
// strictPort=true) — args via `pnpm dev --` don't reliably forward on Windows.
const child = spawn(
  'pnpm',
  ['--dir', dir, 'dev'],
  { stdio: 'inherit', shell: true, env: { ...process.env, KANBAN_CALLER_PROJECT: callerProject } }
);
child.on('exit', (code) => process.exit(code ?? 0));
