import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import fs from 'fs';
import type { Plugin } from 'vite';

/**
 * Copies src/main/db/migrations/*.sql into the main process's output dir
 * AFTER Vite/Rollup has written the bundle (and cleaned the output dir).
 *
 * Needed because electron-vite bundles main into a single out/main/index.js
 * and clears out/main/ on every build — any files placed there by a predev
 * npm hook get wiped. Hooking into closeBundle ensures the SQLs land in
 * out/main/migrations/ AFTER the wipe, where db/index.ts looks for them at
 * runtime (path.join(__dirname, 'migrations') where __dirname = out/main/).
 */
function copyMigrationsPlugin(): Plugin {
  return {
    name: 'remirror:copy-migrations',
    apply: 'build', // run for both dev and prod builds (electron-vite uses Vite build mode for main)
    closeBundle() {
      const src = resolve('src/main/db/migrations');
      const dst = resolve('out/main/migrations');
      if (!fs.existsSync(src)) return;
      fs.mkdirSync(dst, { recursive: true });
      let count = 0;
      for (const f of fs.readdirSync(src)) {
        if (!f.endsWith('.sql')) continue;
        fs.copyFileSync(resolve(src, f), resolve(dst, f));
        count++;
      }
      // eslint-disable-next-line no-console
      console.log(`[copy-migrations] copied ${count} .sql file(s) to ${dst}`);
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyMigrationsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@shared': resolve('src/shared') },
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@renderer': resolve('src/renderer'),
      },
    },
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
  },
});
