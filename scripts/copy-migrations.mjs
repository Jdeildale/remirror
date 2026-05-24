// Copy SQL migration files from src/main/db/migrations/ into out/main/db/migrations/
// so they're co-located with the bundled main process at runtime.
//
// electron-vite uses Rollup to bundle TypeScript; non-JS files aren't carried
// over automatically. We could use a Vite plugin or convert migrations to
// inline strings via `?raw` imports, but a plain copy step is simpler and
// keeps migrations as readable .sql files on disk.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const src = path.join(projectRoot, 'src', 'main', 'db', 'migrations');
const dst = path.join(projectRoot, 'out', 'main', 'db', 'migrations');

if (!fs.existsSync(src)) {
  console.error(`[copy-migrations] source not found: ${src}`);
  process.exit(1);
}

fs.mkdirSync(dst, { recursive: true });

let count = 0;
for (const f of fs.readdirSync(src)) {
  if (!f.endsWith('.sql')) continue;
  fs.copyFileSync(path.join(src, f), path.join(dst, f));
  count++;
}

console.log(`[copy-migrations] copied ${count} .sql file(s) to ${dst}`);
