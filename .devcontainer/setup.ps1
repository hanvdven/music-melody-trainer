# Provision a fresh Windows host for music-melody-trainer (Han 2026-06-26).
#
# Windows equivalent of setup.sh. Installs the app's dependencies AND the kanban tooling
# GLOBALLY (in $HOME, NOT in this repo) so the cyanluna kanban pipeline is ready to use
# without polluting the app codebase. After this runs, just launch `claude` then `/kanban-init`.
#
# Run from PowerShell at the repo root:
#   powershell -ExecutionPolicy Bypass -File .devcontainer\setup.ps1

$ErrorActionPreference = 'Stop'

function Need-Cmd($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

Write-Host "-> Installing app dependencies..."
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

Write-Host "-> Installing kanban tooling (global, outside the repo)..."

# sqlite3 CLI is needed by the `kanban` skill (local-DB mode). Try winget; if it
# isn't available, warn rather than fail - the kanban-board (Postgres-backed) UI
# will still work without it.
if (-not (Need-Cmd 'sqlite3')) {
    if (Need-Cmd 'winget') {
        Write-Host "   installing sqlite3 via winget..."
        winget install --id SQLite.SQLite --silent --accept-source-agreements --accept-package-agreements
    } else {
        Write-Warning "sqlite3 CLI not found and winget unavailable - install manually if you use the local 'kanban' skill."
    }
}

if (-not (Need-Cmd 'claude')) {
    npm install -g '@anthropic-ai/claude-code'
    if ($LASTEXITCODE -ne 0) { throw "claude-code install failed" }
}
if (-not (Need-Cmd 'pnpm')) {
    # Pin to pnpm 10: pnpm 11 requires Node >=22.13 and this repo targets older Node.
    npm install -g pnpm@10
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }
}

$skillsRepo = Join-Path $HOME 'cyanluna.skills'
if (-not (Test-Path $skillsRepo)) {
    git clone https://github.com/cyanluna-git/cyanluna.skills.git $skillsRepo
    if ($LASTEXITCODE -ne 0) { throw "cyanluna.skills clone failed" }
}

# Skill folders go under ~/.claude/skills/ - but kanban-board is a Vite app, not a
# skill, so it must be installed separately at ~/.claude/kanban-board/ (sibling of
# skills/) where `npm run kanban` and per-project start.sh scripts look for it.
$skillsDest = Join-Path $HOME '.claude\skills'
New-Item -ItemType Directory -Force -Path $skillsDest | Out-Null
Get-ChildItem -Path $skillsRepo -Directory -Filter 'kanban*' |
    Where-Object { $_.Name -ne 'kanban-board' } |
    ForEach-Object {
        $target = Join-Path $skillsDest $_.Name
        if (Test-Path $target) { Remove-Item -Recurse -Force $target }
        Copy-Item -Recurse -Force $_.FullName $target
    }

# Install the kanban-board UI app (Vite + PGlite). Skip if already present so
# local patches (e.g. pg -> PGlite swap in plugins/kanban-api.ts) survive reruns.
# To force a clean reinstall, delete ~/.claude/kanban-board first.
$boardDest = Join-Path $HOME '.claude\kanban-board'
if (-not (Test-Path $boardDest)) {
    Copy-Item -Recurse -Force (Join-Path $skillsRepo 'kanban-board') $boardDest
    pnpm --dir $boardDest install
    if ($LASTEXITCODE -ne 0) { throw "kanban-board pnpm install failed" }
} else {
    Write-Host "   kanban-board already installed - leaving as-is (delete the folder to force reinstall)."
}

# The kanban API needs ~/.claude/kanban-auth (KANBAN_BASE_URL + KANBAN_AUTH_TOKEN).
# Token is shared across projects, so it is NOT baked into this script - see
# cyanluna.skills/SETUP-KANBAN.md for the exact contents.
$authFile = Join-Path $HOME '.claude\kanban-auth'
if (-not (Test-Path $authFile)) {
    Write-Warning "$authFile not found - create it before running /kanban-init."
    Write-Warning "See $skillsRepo\SETUP-KANBAN.md for the required contents."
}

Write-Host ""
Write-Host "OK - Windows host ready." -ForegroundColor Green
Write-Host "   * App:    npm run dev      (Vite on port 5173)"
Write-Host "   * Board:  npm run kanban   (kanban-board UI)"
Write-Host "   * Kanban: run 'claude', then '/kanban-init' -> '/kanban add ...' -> '/kanban-run <id>'"
