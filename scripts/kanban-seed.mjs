#!/usr/bin/env node
// One-time seed of the cyanluna agent DB from the repo-root kanban.json (Han 2026-06-22, Option B).
//
// Usage (local, after `/kanban-init` has created ~/.claude/kanban-dbs/{project}.db — or this script
// creates the DB itself):
//   node scripts/kanban-seed.mjs            # seed only if the project has no rows yet
//   node scripts/kanban-seed.mjs --force    # wipe this project's rows and re-seed
//
// After seeding, run the pipeline with the vendored skills (`/kanban-run <id>`); the in-app board
// reads the same DB live via the dev server.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedFromJson, dbPathFor } from './kanbanStore.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsonPath = path.resolve(__dirname, '..', 'kanban.json');
const project = JSON.parse(fs.readFileSync(jsonPath, 'utf8')).project
  || path.basename(path.resolve(__dirname, '..'));
const force = process.argv.includes('--force');

const result = seedFromJson({ jsonPath, project, force });
if (result.skipped) {
  console.log(`Skipped: project "${project}" already has ${result.existing} task(s). Use --force to re-seed.`);
} else {
  console.log(`Seeded ${result.seeded} task(s) into ${dbPathFor(project)}`);
}
