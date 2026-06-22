# OneDrive Sync Setup — symlink (macOS + WSL)

Symlink each machine's local OneDrive folder to `~/.claude/kanban-dbs`.
One-time setup per machine, no extra tools required.

```
macOS  ~/.claude/kanban-dbs → ~/Library/CloudStorage/OneDrive-Personal/dev/ai-kanban/dbs/
WSL    ~/.claude/kanban-dbs → /mnt/c/Users/{winuser}/OneDrive/dev/ai-kanban/dbs/
                               ↑ different physical paths, same OneDrive folder ✅
```

## macOS (first time — first machine only)

```bash
ONEDRIVE="$HOME/Library/CloudStorage/OneDrive-Personal"
# If the folder name differs: ls ~/Library/CloudStorage/ | grep -i onedrive

# Create folders in OneDrive
mkdir -p "$ONEDRIVE/dev/ai-kanban/dbs"
mkdir -p "$ONEDRIVE/dev/ai-kanban/images"

# Move existing local DBs → OneDrive
cp ~/.claude/kanban-dbs/* "$ONEDRIVE/dev/ai-kanban/dbs/" 2>/dev/null || true

# Remove local folder and create symlinks
rm -rf ~/.claude/kanban-dbs ~/.claude/kanban-images
ln -s "$ONEDRIVE/dev/ai-kanban/dbs"    ~/.claude/kanban-dbs
ln -s "$ONEDRIVE/dev/ai-kanban/images" ~/.claude/kanban-images

ls ~/.claude/kanban-dbs/   # DB files should appear
```

## WSL (second machine — after OneDrive has synced)

```bash
# Auto-detect Windows username
WINUSER=$(cmd.exe /c "echo %USERNAME%" 2>/dev/null | tr -d '\r\n')

# Check OneDrive folder name (may be "OneDrive", "OneDrive - Personal", etc.)
ls "/mnt/c/Users/$WINUSER/" | grep -i onedrive

# Create symlinks (adjust folder name if needed)
ONEDRIVE="/mnt/c/Users/$WINUSER/OneDrive"
mkdir -p ~/.claude
ln -s "$ONEDRIVE/dev/ai-kanban/dbs"    ~/.claude/kanban-dbs
ln -s "$ONEDRIVE/dev/ai-kanban/images" ~/.claude/kanban-images

ls ~/.claude/kanban-dbs/   # DB files uploaded from macOS should appear
```

## Concurrent write safety

| Scenario | Result |
|---|---|
| PC1: `unahouse.finance`, PC2: `jira.javis` simultaneously | ✅ Separate files — no WAL conflict |
| PC1 and PC2 on the same project simultaneously | ⚠️ Same DB — work sequentially |
