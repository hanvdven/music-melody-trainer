import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// Dev-only read/write API for the in-app kanban board (Han 2026-06-22).
// "Los: bord = kanban.json" — the board is a standalone viewer/editor of the repo-root kanban.json,
// NOT cyanluna's Postgres-backed board. This is a clean-room JSON-file endpoint (no pg / no DB):
//   GET  /api/kanban  → returns kanban.json
//   POST /api/kanban  → overwrites kanban.json (pretty-printed, so git diffs stay readable)
// In a static production build this middleware is absent; the board then falls back to a bundled
// copy of kanban.json + localStorage (read-only persistence) — see KanbanBoard.jsx.
function kanbanJsonApiPlugin() {
  const file = path.resolve(process.cwd(), 'kanban.json');
  return {
    name: 'kanban-json-api',
    configureServer(server) {
      server.middlewares.use('/api/kanban', (req, res, next) => {
        if (req.method === 'GET') {
          try {
            res.setHeader('Content-Type', 'application/json');
            res.end(fs.readFileSync(file, 'utf8'));
          } catch {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'kanban.json not found' }));
          }
          return;
        }
        if (req.method === 'POST') {
          let body = '';
          req.on('data', (c) => { body += c; });
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body);               // validate before writing
              fs.writeFileSync(file, JSON.stringify(parsed, null, 2) + '\n');
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'invalid JSON: ' + err.message }));
            }
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
    plugins: [react(), kanbanJsonApiPlugin()],
    define: {
      // Injected at build time so debug overlays can show branch/PR without runtime git access.
      // VITE_PR_NUMBER can be overridden by CI: VITE_PR_NUMBER=42 npm run build
      'import.meta.env.VITE_GIT_BRANCH': JSON.stringify(process.env.VITE_GIT_BRANCH || gitBranch),
      'import.meta.env.VITE_PR_NUMBER': JSON.stringify(prNumber),
    },
  };
});
