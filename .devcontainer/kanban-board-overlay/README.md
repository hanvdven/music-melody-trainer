# kanban-board-overlay

Patched copies of three files from upstream `cyanluna.skills/kanban-board`. Both
`setup.sh` and `setup.ps1` copy this whole folder over `~/.claude/kanban-board/`
after the initial `pnpm install`, so Codespaces and fresh Windows hosts pick up
the same local-mode behavior we use day-to-day:

| File | Patch summary |
|---|---|
| `vite.config.ts` | Pin dev server to port 5500 with `strictPort: true`. |
| `plugins/kanban-api.ts` | Replace `pg.Pool` with PGlite (Postgres-in-WASM). DB persists at `~/.claude/kanban-board-data/`. `/api/info` returns `process.env.KANBAN_CALLER_PROJECT` when set. |
| `src/main.ts` | In `loadProjectInfo()`, auto-set `currentProject` from `/api/info` when localStorage is empty, so "Add task" works on first visit without manual project selection. |

## Reconciling with upstream

This overlay replaces the upstream files wholesale. **If `cyanluna.skills`
updates any of these files, the overlay silently keeps the old version.** To
update:

1. `cd ~/cyanluna.skills && git pull`
2. `diff -u ~/cyanluna.skills/kanban-board/src/main.ts .devcontainer/kanban-board-overlay/src/main.ts` (etc.)
3. Re-apply the three patches by hand and refresh the overlay files.

We chose overlay over `*.patch` because patch files fail in subtle line-offset
ways across platforms; full-file overlay either works or breaks loudly.
