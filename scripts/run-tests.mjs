// Runs vitest, then restores the better-sqlite3 native binary to Electron's
// ABI regardless of whether tests passed or failed. This keeps `npm run dev`
// working after `npm test`, including failing test runs.
//
// Background: Electron 32 ships its own NODE_MODULE_VERSION (128) that does
// not match Node 20's NMV (115). better-sqlite3's native binary has to be
// compiled for one or the other — they cannot share. This script and the
// matching `pretest` hook handle the swap automatically.

import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const isWindows = process.platform === 'win32';

const vitest = spawnSync(
  isWindows ? 'npx.cmd' : 'npx',
  ['vitest', 'run', ...args],
  { stdio: 'inherit', shell: isWindows },
);

const rebuild = spawnSync(
  isWindows ? 'npm.cmd' : 'npm',
  ['run', 'rebuild:electron'],
  { stdio: 'inherit', shell: isWindows },
);

if (rebuild.status !== 0) {
  console.error('[run-tests] WARNING: rebuild:electron failed (exit ' + rebuild.status + '). Run `npm run rebuild:electron` manually before `npm run dev`.');
}

process.exit(vitest.status ?? 0);
