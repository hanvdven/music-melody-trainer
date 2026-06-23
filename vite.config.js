import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { readBoard, updateTask } from './scripts/kanbanStore.mjs';

// Dev-only read/write API for the in-app kanban board (Han 2026-06-22, Option B: "Bord ↔ live agent-DB").
// The board reads/writes the cyanluna agent store (local SQLite at ~/.claude/kanban-dbs/{project}.db)
// when it exists, else falls back to the repo-root kanban.json. All store logic lives in
// scripts/kanbanStore.mjs (shared with the seed CLI + tests). Endpoints:
//   GET   /api/kanban           → { project, columns, tasks, store: 'db' | 'json' }
//   PATCH /api/kanban/task/:id  → { status, rank } moves one card (writes to the active store)
// Absent in a static production build; the board then falls back to a bundled kanban.json +
// localStorage (see KanbanBoard.jsx).
function kanbanApiPlugin() {
  const jsonPath = path.resolve(process.cwd(), 'kanban.json');
  const project = (() => {
    try { return JSON.parse(fs.readFileSync(jsonPath, 'utf8')).project; }
    catch { return path.basename(process.cwd()); }
  })();
  return {
    name: 'kanban-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        const json = (code, obj) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); };

        if (url.pathname === '/api/kanban' && req.method === 'GET') {
          try { json(200, readBoard({ jsonPath, project })); }
          catch (err) { json(500, { error: err.message }); }
          return;
        }

        const m = url.pathname.match(/^\/api\/kanban\/task\/(\d+)$/);
        if (m && req.method === 'PATCH') {
          let body = '';
          req.on('data', (c) => { body += c; });
          req.on('end', () => {
            try {
              const { status, rank } = JSON.parse(body || '{}');
              const r = updateTask({ jsonPath, project, id: Number(m[1]), status, rank });
              json(r.ok ? 200 : 404, { success: r.ok, store: r.store });
            } catch (err) { json(400, { error: err.message }); }
          });
          return;
        }
        next();
      });
    },
  };
}

const gitBranch = (() => {
  try { return execSync('git rev-parse --abbrev-ref HEAD').toString().trim(); }
  catch { return 'unknown'; }
})();

// Auto-detect the open PR number for the current branch from the GitHub API (no auth needed
// for public repos). Falls back to VITE_PR_NUMBER env var (useful in CI or offline builds).
const fetchPRNumber = async () => {
  if (process.env.VITE_PR_NUMBER) return process.env.VITE_PR_NUMBER;
  const branch = process.env.VITE_GIT_BRANCH || gitBranch;
  if (!branch || branch === 'unknown' || branch === 'HEAD') return '';
  try {
    const url = `https://api.github.com/repos/hanvdven/music-melody-trainer/pulls?head=hanvdven:${encodeURIComponent(branch)}&state=open&per_page=1`;
    const resp = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
    if (!resp.ok) return '';
    const data = await resp.json();
    return Array.isArray(data) && data.length > 0 ? String(data[0].number) : '';
  } catch {
    return '';
  }
};

export default defineConfig(async () => {
  const prNumber = await fetchPRNumber();
  return {
    plugins: [react(), kanbanApiPlugin()],
    define: {
      // Injected at build time so debug overlays can show branch/PR without runtime git access.
      // VITE_PR_NUMBER can be overridden by CI: VITE_PR_NUMBER=42 npm run build
      'import.meta.env.VITE_GIT_BRANCH': JSON.stringify(process.env.VITE_GIT_BRANCH || gitBranch),
      'import.meta.env.VITE_PR_NUMBER': JSON.stringify(prNumber),
    },
  };
});
