#!/usr/bin/env bash
# Provision a fresh Codespace for music-melody-trainer (Han 2026-06-23).
#
# Installs the app's dependencies AND the kanban tooling GLOBALLY (in $HOME, NOT in this repo) so the
# cyanluna kanban pipeline is ready to use without polluting the app codebase. After the Codespace is
# created, just run `claude` then `/kanban-init`.
set -euo pipefail

echo "→ Installing app dependencies…"
npm install

echo "→ Installing kanban tooling (global, outside the repo)…"
sudo apt-get update && sudo apt-get install -y sqlite3
npm install -g @anthropic-ai/claude-code pnpm

if [ ! -d "$HOME/cyanluna.skills" ]; then
  git clone https://github.com/cyanluna-git/cyanluna.skills.git "$HOME/cyanluna.skills"
fi

# Skill folders go under ~/.claude/skills/ — but kanban-board is a Vite app, not a
# skill, so it must be installed separately at ~/.claude/kanban-board/ (sibling of
# skills/) where `npm run kanban` and per-project start.sh scripts look for it.
mkdir -p "$HOME/.claude/skills"
for d in "$HOME"/cyanluna.skills/kanban*; do
  name=$(basename "$d")
  [ "$name" = "kanban-board" ] && continue
  cp -R "$d" "$HOME/.claude/skills/"
done

# Install the kanban-board UI app (Vite + PGlite). Skip if already present so
# local patches survive reruns. To force a clean reinstall, delete
# ~/.claude/kanban-board first.
SCRIPT_DIR="$( cd -- "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 ; pwd -P )"
if [ ! -d "$HOME/.claude/kanban-board" ]; then
  cp -R "$HOME/cyanluna.skills/kanban-board" "$HOME/.claude/kanban-board"
  pnpm --dir "$HOME/.claude/kanban-board" install
else
  echo "   kanban-board already installed - leaving as-is (delete the folder to force reinstall)."
fi

# Apply our overlay: port pin, pg->PGlite swap, project auto-select. See
# .devcontainer/kanban-board-overlay/README.md for the patch summary and
# how to reconcile when upstream updates.
if [ -d "$SCRIPT_DIR/kanban-board-overlay" ]; then
  echo "   applying kanban-board overlay (PGlite, port 5500, auto-select project)..."
  cp -R "$SCRIPT_DIR/kanban-board-overlay/vite.config.ts" "$HOME/.claude/kanban-board/vite.config.ts"
  cp -R "$SCRIPT_DIR/kanban-board-overlay/plugins/." "$HOME/.claude/kanban-board/plugins/"
  cp -R "$SCRIPT_DIR/kanban-board-overlay/src/." "$HOME/.claude/kanban-board/src/"
  # The overlay's kanban-api.ts uses PGlite; upstream kanban-board only ships
  # `pg`. Idempotent add.
  pnpm --dir "$HOME/.claude/kanban-board" add @electric-sql/pglite
fi

# The kanban API needs ~/.claude/kanban-auth (KANBAN_BASE_URL + KANBAN_AUTH_TOKEN).
# Token is shared across projects, so it is NOT baked into this script — see
# cyanluna.skills/SETUP-KANBAN.md for the exact contents.
if [ ! -f "$HOME/.claude/kanban-auth" ]; then
  echo "⚠  ~/.claude/kanban-auth not found — create it before running /kanban-init."
  echo "   See $HOME/cyanluna.skills/SETUP-KANBAN.md for the required contents."
fi

echo "✅ Codespace ready."
echo "   • App:    npm run dev      (Vite on port 5173)"
echo "   • Board:  npm run kanban   (kanban-board UI)"
echo "   • Kanban: run 'claude', then '/kanban-init' → '/kanban add …' → '/kanban-run <id>'"
