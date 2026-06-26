import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Pin to 5500 with --strictPort so the board never silently lands on a random
// port and never fights this repo's app dev server for 5173.
const dir = join(homedir(), '.claude', 'kanban-board');
const child = spawn(
  'pnpm',
  ['--dir', dir, 'dev', '--', '--port', '5500', '--strictPort'],
  { stdio: 'inherit', shell: true }
);
child.on('exit', (code) => process.exit(code ?? 0));
