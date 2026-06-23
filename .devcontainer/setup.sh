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
npm install -g @anthropic-ai/claude-code

if [ ! -d "$HOME/cyanluna.skills" ]; then
  git clone https://github.com/cyanluna-git/cyanluna.skills.git "$HOME/cyanluna.skills"
fi
mkdir -p "$HOME/.claude/skills"
cp -R "$HOME"/cyanluna.skills/kanban* "$HOME/.claude/skills/"

echo "✅ Codespace ready."
echo "   • App:    npm run dev   (Vite on port 5173)"
echo "   • Kanban: run 'claude', then '/kanban-init' → '/kanban add …' → '/kanban-run <id>'"
