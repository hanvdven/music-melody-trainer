# Vendored Kanban skills (cyanluna)

These `kanban*` skill folders are **vendored** (copied) into this repo so the kanban workflow
travels with the project. Han chose this on 2026-06-22 (BACKLOG.md P0 entry).

## Source
- Upstream: https://github.com/cyanluna-git/cyanluna.skills
- Vendored commit: `df5be37a7e97a4222f2f3b2f48778e9ffa77149c`
- Vendored on: 2026-06-22

## What is included
The five skill folders the upstream README installs:
`kanban`, `kanban-run`, `kanban-refine`, `kanban-init`, `kanban-explore`.

Because they live under `.claude/skills/`, Claude Code picks them up automatically in any
session on this repo, and they travel with every clone.

## What is deliberately EXCLUDED (and why)
- **`kanban-board/`** (the Vite web UI, ~1.4 MB incl. a built `dist/`) — it's a separate app you
  run locally (`pnpm install` + `start.sh`) and it talks to a **hosted backend**, so it doesn't
  belong in this music-app repo. Get it from upstream if you want the board UI.
- **`docs/`** (~2.8 MB, mostly screenshots) — pure bloat for this repo.
- **`SETUP-KANBAN.md`** and the board scripts — they contain a **shared `KANBAN_AUTH_TOKEN`**
  (a live credential). Committing that to git would leak a secret (the file itself says
  *"Do NOT put this in git"*). Excluded entirely.
- The auxiliary skills (`kanban-batch-run`, `kanban-local`, `kanban-spec`, `kanban-heartbeat`,
  `kanban-gen-wiki`, `worklog-sync`, `review-*`, `project-kickstart`) — not part of the documented
  install; pull from upstream if needed.

## ⚠ Important reality
The **task data does NOT live in this repo.** The kanban stores its cards in an **external hosted
backend** (`cyanlunakanban.vercel.app`) reached with an auth token. So:
- This vendor makes the **skills/instructions** portable — not the board, not the data.
- To actually use it: put the auth token in `~/.claude/kanban-auth` (NEVER in git), set up the
  board from upstream, then run `/kanban-init` in this project and `/kanban add …`.

## 7-column pipeline
Req → Plan → Review Plan → Impl → Review Impl → Test → Done.
