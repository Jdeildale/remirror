# Remirror Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Remirror Phase 1 capture engine — a tray-resident Electron app on Windows that silently records work sessions to a local SQLite database, classifies them by keyword matching, respects an exclusion list, and exposes a minimal status UI for verification and manual reclassification. No Claude API calls in Phase 1.

**Architecture:** Electron main process owns all capture logic; React renderer reads from SQLite via IPC and never writes to it directly. Capture is **input-gated polling** (`uiohook-napi` triggers a debounced 1.5s tick that reads foreground window + cursor + idle state). Two-tier idle handling (active 0–120s, paused 120–600s, retroactively closed >600s) preserves ADHD thinking blocks. Numbered SQL migrations from day one, `better-sqlite3` in WAL mode with foreign keys ON.

**Tech Stack:** Electron 32 • TypeScript • electron-vite • React 18 + Tailwind 3 • better-sqlite3 • get-windows • uiohook-napi • electron-log • electron-store • vitest

**Spec:** [`docs/superpowers/specs/2026-05-23-remirror-phase1-design.md`](../specs/2026-05-23-remirror-phase1-design.md)

---

## File map

Created across this plan (in approximate build order):

```
remirror/
├─ package.json                              # task 1
├─ tsconfig.json                             # task 1
├─ tsconfig.node.json                        # task 1
├─ electron.vite.config.ts                   # task 2
├─ electron-builder.yml                      # task 2
├─ tailwind.config.js                        # task 4
├─ postcss.config.js                         # task 4
├─ vitest.config.ts                          # task 6
├─ .gitignore                                # task 1
├─ .env.example                              # task 1
├─ README.md                                 # task 40
├─ src/
│  ├─ shared/
│  │  ├─ types.ts                            # task 7
│  │  ├─ ipc-contract.ts                     # task 30
│  │  └─ branding.ts                         # task 1
│  ├─ main/
│  │  ├─ index.ts                            # task 3, expanded across many tasks
│  │  ├─ store.ts                            # task 5
│  │  ├─ log.ts                              # task 5
│  │  ├─ ulid.ts                             # task 11
│  │  ├─ db/
│  │  │  ├─ index.ts                         # task 7
│  │  │  ├─ migrate.ts                       # task 8
│  │  │  └─ migrations/
│  │  │     ├─ 001_init.sql                  # task 7
│  │  │     └─ 002_seed_exclusions.sql       # task 9
│  │  ├─ capture/
│  │  │  ├─ classifier.ts                    # task 10
│  │  │  ├─ exclusions.ts                    # task 11
│  │  │  ├─ idle.ts                          # task 12
│  │  │  ├─ sessions.ts                      # task 13
│  │  │  ├─ window-poller.ts                 # task 14
│  │  │  ├─ cursor.ts                        # task 15
│  │  │  ├─ input-gate.ts                    # task 16
│  │  │  ├─ engine.ts                        # task 17
│  │  │  └─ lifecycle.ts                     # task 18
│  │  ├─ ipc.ts                              # task 30
│  │  ├─ hotkey.ts                           # task 22
│  │  ├─ tray.ts                             # task 21
│  │  └─ windows/
│  │     ├─ create.ts                        # task 19
│  │     └─ main-window.ts                   # task 20
│  ├─ preload/
│  │  └─ index.ts                            # task 31
│  └─ renderer/
│     ├─ index.html                          # task 4
│     ├─ index.tsx                           # task 32
│     ├─ styles.css                          # task 4
│     ├─ App.tsx                             # task 32
│     ├─ routes/
│     │  ├─ Onboarding.tsx                   # task 33
│     │  └─ Status.tsx                       # task 35
│     ├─ ui/
│     │  ├─ Button.tsx                       # task 32
│     │  ├─ Input.tsx                        # task 32
│     │  ├─ ProjectEditor.tsx                # task 34
│     │  ├─ ExclusionEditor.tsx              # task 34
│     │  └─ SessionRow.tsx                   # task 35
│     └─ hooks/
│        └─ useRemirror.ts                   # task 32
├─ resources/
│  └─ icons/
│     ├─ tray.ico                            # task 21 (placeholder)
│     └─ app.ico                             # task 2 (placeholder)
└─ tests/
   ├─ classifier.test.ts                     # task 10
   ├─ exclusions.test.ts                     # task 11
   ├─ idle.test.ts                           # task 12
   ├─ sessions.test.ts                       # task 13
   ├─ migrate.test.ts                        # task 8
   └─ db.test.ts                             # task 7
```

---

## Phase A — Project scaffold

### Task 1: Initialize package.json, TypeScript config, gitignore

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/shared/branding.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "remirror",
  "version": "0.1.0",
  "description": "ADHD-aware screen-attention recorder. All data local.",
  "main": "out/main/index.js",
  "type": "module",
  "author": "Remirror",
  "private": true,
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "build:win": "npm run build && electron-builder --win --config electron-builder.yml",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "postinstall": "electron-builder install-app-deps"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.43.0",
    "better-sqlite3": "^11.5.0",
    "electron-log": "^5.2.0",
    "electron-store": "^8.2.0",
    "get-windows": "^9.2.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "ulid": "^2.3.0",
    "uiohook-napi": "^1.5.4"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^20.16.10",
    "@types/react": "^18.3.11",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.2",
    "autoprefixer": "^10.4.20",
    "electron": "^32.1.2",
    "electron-builder": "^25.0.5",
    "electron-vite": "^2.3.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2",
    "vite": "^5.4.8",
    "vitest": "^2.1.2"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "noUnusedLocals": false,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["src/shared/*"],
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"]
    }
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 3: Create `tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["electron.vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
out/
dist/
.env
.env.local
*.log
.DS_Store
Thumbs.db
*.tsbuildinfo
.vite/
.vitest/
coverage/
```

- [ ] **Step 5: Create `.env.example`**

```
# Phase 1 does not use this. Reserved for Phase 2+ when the user provides
# their own Anthropic API key via Settings, stored via Electron safeStorage.
ANTHROPIC_API_KEY=
```

- [ ] **Step 6: Create `src/shared/branding.ts` (single source of all branding strings)**

```typescript
// All user-facing branding lives here. Renaming is one-edit.
export const BRAND = {
  appName: 'Remirror',
  appId: 'com.remirror.app',
  tagline: 'An honest mirror for your attention.',
  tray: {
    active: 'Remirror — Active',
    paused: 'Remirror — Paused',
    excluded: 'Remirror — Excluded app active',
  },
  hotkey: {
    default: 'Alt+Shift+R',
  },
  windowTitle: 'Remirror',
} as const;
```

- [ ] **Step 7: Install dependencies**

Run: `npm install`
Expected: completes without errors. `node_modules/` populated. `postinstall` rebuilds native modules for Electron.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json .gitignore .env.example src/shared/branding.ts
git commit -m "chore: scaffold package.json, TypeScript, branding"
```

---

### Task 2: electron-vite config + electron-builder config + placeholder app icon

**Files:**
- Create: `electron.vite.config.ts`
- Create: `electron-builder.yml`
- Create: `resources/icons/app.ico` (placeholder — any 256x256 ico for now)

- [ ] **Step 1: Create `electron.vite.config.ts`**

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
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
```

- [ ] **Step 2: Create `electron-builder.yml`**

```yaml
appId: com.remirror.app
productName: Remirror
directories:
  output: dist
  buildResources: resources
files:
  - out/**/*
  - resources/icons/**/*
asar: true
asarUnpack:
  - "**/*.node"
win:
  target: nsis
  icon: resources/icons/app.ico
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  artifactName: ${productName}-Setup-${version}.${ext}
```

- [ ] **Step 3: Provide placeholder `resources/icons/app.ico`**

```bash
mkdir -p resources/icons
# Use any existing 256x256 .ico for now. If none exists, run:
node -e "const fs=require('fs');const buf=Buffer.alloc(8540);buf.write('icoplaceholder');fs.writeFileSync('resources/icons/app.ico',buf);"
# (This creates an invalid-but-present file that satisfies the build path.
# Replace before first real release.)
```

Note: a real `.ico` is required before `npm run build:win` will produce a working installer. For development (`npm run dev`) it's not required.

- [ ] **Step 4: Commit**

```bash
git add electron.vite.config.ts electron-builder.yml resources/icons/app.ico
git commit -m "chore: electron-vite + electron-builder config"
```

---

### Task 3: Minimal Electron main entry — proves dev server boots

**Files:**
- Create: `src/main/index.ts`

- [ ] **Step 1: Create `src/main/index.ts` (smoke version)**

```typescript
import { app } from 'electron';
import { BRAND } from '@shared/branding';

// Single-instance lock — non-negotiable. Two instances would corrupt the DB.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.setAppUserModelId(BRAND.appId);

app.whenReady().then(() => {
  console.log(`[${BRAND.appName}] main process ready`);
});

app.on('window-all-closed', () => {
  // Remirror lives in the tray — do nothing on window close.
});
```

- [ ] **Step 2: Boot the dev server**

Run: `npm run dev`
Expected: electron-vite builds main+preload+renderer; an Electron process launches; console prints `[Remirror] main process ready`. No window appears (intended). Kill with Ctrl+C.

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(main): minimal entry with single-instance lock"
```

---

### Task 4: Renderer skeleton — Tailwind + HTML + placeholder index.tsx

**Files:**
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `src/renderer/index.html`
- Create: `src/renderer/styles.css`
- Create: `src/renderer/index.tsx`

- [ ] **Step 1: Create `tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{tsx,ts,html}'],
  theme: {
    extend: {
      colors: {
        // Dark, calm palette per spec — no red anywhere.
        bg: '#0f1115',
        surface: '#171a20',
        text: '#e6e8eb',
        muted: '#8a93a0',
        accent: '#5fb6c4', // calm teal for goal-aligned signals
        amber: '#d2a04a',
        gray: '#5a6270',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Create `postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 3: Create `src/renderer/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Remirror</title>
  </head>
  <body class="bg-bg text-text font-sans antialiased">
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `src/renderer/styles.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root { height: 100%; }
body { -webkit-font-smoothing: antialiased; }
```

- [ ] **Step 5: Create `src/renderer/index.tsx` (placeholder until task 32)**

```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
root.render(
  <div className="flex items-center justify-center h-full">
    <span className="text-muted">Remirror renderer loading…</span>
  </div>
);
```

- [ ] **Step 6: Verify dev server still boots with renderer**

Run: `npm run dev`
Expected: builds without errors. No window shown yet (no `BrowserWindow` is opened in main yet). Kill with Ctrl+C.

- [ ] **Step 7: Commit**

```bash
git add tailwind.config.js postcss.config.js src/renderer/index.html src/renderer/styles.css src/renderer/index.tsx
git commit -m "chore(renderer): Tailwind + placeholder index"
```

---

### Task 5: Logging and prefs store

**Files:**
- Create: `src/main/log.ts`
- Create: `src/main/store.ts`

- [ ] **Step 1: Create `src/main/log.ts`**

```typescript
import log from 'electron-log/main.js';
import { app } from 'electron';
import path from 'path';

// Files land at %APPDATA%/Remirror/logs/main.log on Windows.
log.transports.file.resolvePathFn = () =>
  path.join(app.getPath('userData'), 'logs', 'main.log');
log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB
log.transports.console.format = '[{h}:{i}:{s}.{ms}] [{level}] {text}';
log.initialize({ preload: true });

export default log;
```

- [ ] **Step 2: Create `src/main/store.ts`**

```typescript
import Store from 'electron-store';

type Prefs = {
  hotkey: string;
  // Slot reserved for future license-key validation. Phase 1 does not check it.
  licenseKey?: string;
  capturePausedByUser: boolean;
};

export const store = new Store<Prefs>({
  defaults: {
    hotkey: 'Alt+Shift+R',
    licenseKey: undefined,
    capturePausedByUser: false,
  },
});
```

- [ ] **Step 3: Wire log into `src/main/index.ts`**

```typescript
import { app } from 'electron';
import { BRAND } from '@shared/branding';
import log from './log';

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.setAppUserModelId(BRAND.appId);

app.whenReady().then(() => {
  log.info(`${BRAND.appName} main process ready`);
});

app.on('window-all-closed', () => {
  /* tray-resident; do nothing */
});
```

- [ ] **Step 4: Run dev and verify log file appears**

Run: `npm run dev`
Expected: `%APPDATA%\Remirror\logs\main.log` contains `[INFO] Remirror main process ready`. Kill with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add src/main/log.ts src/main/store.ts src/main/index.ts
git commit -m "feat(main): electron-log + electron-store"
```

---

## Phase B — Database

### Task 6: Vitest config

**Files:**
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@main': resolve('src/main'),
    },
  },
});
```

- [ ] **Step 2: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: vitest config"
```

---

### Task 7: Shared types + DB init migration + connection module

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/main/db/migrations/001_init.sql`
- Create: `src/main/db/index.ts`
- Create: `tests/db.test.ts`

- [ ] **Step 1: Create `src/shared/types.ts`**

```typescript
export type SessionKind = 'work' | 'transition' | 'meeting' | 'idle' | 'excluded';

export interface Session {
  id: string;
  start_time: number;       // Unix ms
  end_time: number | null;
  app_name: string | null;
  window_title: string | null;
  display_id: number | null;
  project_label: string | null;
  confidence: number;
  kind: SessionKind;
  frames_sampled: number;
  paused_ms: number;
}

export interface Project {
  id: string;
  label: string;
  category: string | null;
  keywords: string[];        // parsed from JSON
  goal_id: string | null;
  display_order: number;
}

export interface Exclusion {
  id: string;
  app_name: string | null;
  window_title_contains: string | null;
  reason: string | null;
}

export type EngineStatus = 'active' | 'paused' | 'excluded' | 'stopped';
```

- [ ] **Step 2: Create `src/main/db/migrations/001_init.sql`**

```sql
-- Sessions: the core record
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  app_name TEXT,
  window_title TEXT,
  display_id INTEGER,
  project_label TEXT,
  confidence REAL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'work',
  frames_sampled INTEGER DEFAULT 0,
  paused_ms INTEGER DEFAULT 0
);
CREATE INDEX idx_sessions_start_time ON sessions(start_time);
CREATE INDEX idx_sessions_project_label ON sessions(project_label);
CREATE INDEX idx_sessions_kind ON sessions(kind);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT,
  keywords TEXT NOT NULL DEFAULT '[]',
  goal_id TEXT,
  display_order INTEGER DEFAULT 0
);

CREATE TABLE exclusions (
  id TEXT PRIMARY KEY,
  app_name TEXT,
  window_title_contains TEXT,
  reason TEXT
);

-- Reserved for Phases 2-5; created now to avoid future schema breaks.
CREATE TABLE meetings (
  id TEXT PRIMARY KEY,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  platform TEXT DEFAULT 'zoom',
  meeting_id TEXT,
  participants TEXT,
  fathom_summary TEXT,
  action_items TEXT,
  fathom_meeting_id TEXT,
  raw_transcript TEXT
);
CREATE TABLE screenshots (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id),
  captured_at INTEGER NOT NULL,
  file_path TEXT,
  classified INTEGER DEFAULT 0,
  delete_after INTEGER
);
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT,
  tracking_keywords TEXT,
  created_at INTEGER,
  active INTEGER DEFAULT 1
);
CREATE TABLE weekly_targets (
  id TEXT PRIMARY KEY,
  week_start INTEGER NOT NULL,
  metric_name TEXT,
  baseline_value REAL,
  target_value REAL,
  actual_value REAL,
  target_description TEXT,
  met INTEGER
);
CREATE TABLE daily_briefs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  generated_at INTEGER,
  content TEXT,
  best_focus_block_id TEXT,
  context_switch_count INTEGER,
  fragmentation_score REAL,
  goal_alignment_score REAL
);
CREATE TABLE weekly_mirrors (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  generated_at INTEGER,
  content TEXT,
  target_id TEXT,
  open_loops TEXT,
  top_insight TEXT
);

CREATE TABLE _migrations (
  filename TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
```

- [ ] **Step 3: Write failing DB test**

`tests/db.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDatabase, closeDatabase } from '@main/db/index';
import path from 'path';
import fs from 'fs';
import os from 'os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remirror-db-'));
});

afterEach(() => {
  closeDatabase();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('openDatabase', () => {
  it('creates the database file and applies PRAGMAs', () => {
    const db = openDatabase(path.join(tmpDir, 'test.db'));
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('runs the init migration and creates sessions table', () => {
    const db = openDatabase(path.join(tmpDir, 'test.db'));
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
    ).get();
    expect(row).toEqual({ name: 'sessions' });
  });

  it('closes any orphan sessions (NULL end_time) on startup', () => {
    const dbPath = path.join(tmpDir, 'test.db');
    let db = openDatabase(dbPath);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    db.prepare(
      "INSERT INTO sessions (id, start_time, end_time) VALUES (?, ?, NULL)"
    ).run('orphan-1', oneHourAgo);
    closeDatabase();

    db = openDatabase(dbPath);
    const orphan = db.prepare("SELECT end_time FROM sessions WHERE id='orphan-1'").get() as { end_time: number };
    expect(orphan.end_time).not.toBeNull();
    // Capped at start + 5min
    expect(orphan.end_time).toBe(oneHourAgo + 5 * 60 * 1000);
  });
});
```

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL (`openDatabase` not defined).

- [ ] **Step 4: Create `src/main/db/index.ts`**

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { runMigrations } from './migrate';
import log from '../log';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function openDatabase(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  const migrationsDir = path.join(__dirname, 'migrations');
  runMigrations(db, migrationsDir);

  recoverOrphanSessions(db);

  log.info(`DB opened at ${dbPath}`);
  return db;
}

export function getDatabase(): Database.Database {
  if (!db) throw new Error('Database not opened');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

function recoverOrphanSessions(db: Database.Database): void {
  const now = Date.now();
  const fiveMinMs = 5 * 60 * 1000;
  // Any session with NULL end_time gets closed at start + 5min (capped at now).
  const result = db
    .prepare(
      `UPDATE sessions
       SET end_time = MIN(start_time + ?, ?)
       WHERE end_time IS NULL`
    )
    .run(fiveMinMs, now);
  if (result.changes > 0) {
    log.warn(`Recovered ${result.changes} orphan session(s) on startup`);
  }
}
```

Note: `runMigrations` will be implemented in Task 8. We need it imported here, but the test will fail until then. Order of operations: stub the import for now so tests can drive the implementation.

- [ ] **Step 5: Create a stub `src/main/db/migrate.ts` so test compiles**

```typescript
import type Database from 'better-sqlite3';

export function runMigrations(db: Database.Database, migrationsDir: string): void {
  throw new Error('runMigrations not implemented yet — see task 8');
}
```

- [ ] **Step 6: Run the DB tests**

Run: `npx vitest run tests/db.test.ts`
Expected: FAIL — but the failure should now be "runMigrations not implemented yet" from inside `openDatabase`. This confirms we're wired correctly; the test will pass once migrate.ts is implemented in Task 8.

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/db/index.ts src/main/db/migrate.ts src/main/db/migrations/001_init.sql tests/db.test.ts
git commit -m "feat(db): connection module + 001 init migration + failing tests"
```

---

### Task 8: Migration runner (TDD)

**Files:**
- Modify: `src/main/db/migrate.ts`
- Create: `tests/migrate.test.ts`

- [ ] **Step 1: Write failing tests for migrate**

`tests/migrate.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import path from 'path';
import fs from 'fs';
import os from 'os';

let tmpDir: string;
let migrationsDir: string;
let db: Database.Database;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'remirror-migrate-'));
  migrationsDir = path.join(tmpDir, 'migrations');
  fs.mkdirSync(migrationsDir);
  db = new Database(':memory:');
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('runMigrations', () => {
  it('creates _migrations table if missing', () => {
    runMigrations(db, migrationsDir);
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'"
    ).get();
    expect(row).toEqual({ name: '_migrations' });
  });

  it('applies a single migration file', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '001_test.sql'),
      'CREATE TABLE foo (id TEXT PRIMARY KEY);'
    );
    runMigrations(db, migrationsDir);
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='foo'"
    ).get();
    expect(row).toEqual({ name: 'foo' });
    const tracked = db.prepare(
      "SELECT filename FROM _migrations WHERE filename='001_test.sql'"
    ).get();
    expect(tracked).toEqual({ filename: '001_test.sql' });
  });

  it('does not re-apply a migration on second run', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '001_test.sql'),
      'CREATE TABLE foo (id TEXT PRIMARY KEY);'
    );
    runMigrations(db, migrationsDir);
    // Second run should be a no-op (would otherwise throw "table foo already exists")
    expect(() => runMigrations(db, migrationsDir)).not.toThrow();
  });

  it('applies migrations in alphanumeric order', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '002_second.sql'),
      'INSERT INTO ordering (n) VALUES (2);'
    );
    fs.writeFileSync(
      path.join(migrationsDir, '001_first.sql'),
      'CREATE TABLE ordering (n INTEGER); INSERT INTO ordering (n) VALUES (1);'
    );
    runMigrations(db, migrationsDir);
    const rows = db.prepare('SELECT n FROM ordering ORDER BY n').all();
    expect(rows).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('runs each migration inside a transaction', () => {
    fs.writeFileSync(
      path.join(migrationsDir, '001_bad.sql'),
      'CREATE TABLE good (id TEXT); INSERT INTO nonexistent VALUES (1);'
    );
    expect(() => runMigrations(db, migrationsDir)).toThrow();
    // The 'good' table from the first statement should be rolled back.
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='good'"
    ).get();
    expect(row).toBeUndefined();
  });
});
```

Run: `npx vitest run tests/migrate.test.ts`
Expected: FAIL with "runMigrations not implemented yet".

- [ ] **Step 2: Implement `runMigrations` in `src/main/db/migrate.ts`**

```typescript
import type Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export function runMigrations(db: Database.Database, migrationsDir: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const applied = new Set(
    db.prepare('SELECT filename FROM _migrations').all().map(
      (r: any) => r.filename as string
    )
  );

  if (!fs.existsSync(migrationsDir)) return;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const filename of files) {
    if (applied.has(filename)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf-8');
    const apply = db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (filename, applied_at) VALUES (?, ?)')
        .run(filename, Date.now());
    });
    apply();
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/migrate.test.ts tests/db.test.ts`
Expected: ALL PASS (both migrate tests and the db tests from Task 7 now pass).

- [ ] **Step 4: Commit**

```bash
git add src/main/db/migrate.ts tests/migrate.test.ts
git commit -m "feat(db): migration runner with transaction isolation"
```

---

### Task 9: Seed default exclusions migration

**Files:**
- Create: `src/main/db/migrations/002_seed_exclusions.sql`

- [ ] **Step 1: Create `002_seed_exclusions.sql`**

```sql
-- Idempotent insert: uses INSERT OR IGNORE keyed on (app_name, window_title_contains).
-- The IDs are deterministic so re-running doesn't duplicate.

INSERT OR IGNORE INTO exclusions (id, app_name, window_title_contains, reason) VALUES
  ('seed-app-1password', '1Password', NULL, 'Password manager'),
  ('seed-app-bitwarden', 'Bitwarden', NULL, 'Password manager'),
  ('seed-app-keychain', 'Keychain Access', NULL, 'Password manager'),
  ('seed-app-messages', 'Messages', NULL, 'Private messaging'),
  ('seed-app-imessage', 'iMessage', NULL, 'Private messaging'),
  ('seed-app-whatsapp', 'WhatsApp', NULL, 'Private messaging'),
  ('seed-app-signal', 'Signal', NULL, 'Private messaging'),
  ('seed-app-telegram', 'Telegram', NULL, 'Private messaging'),
  ('seed-app-facetime', 'FaceTime', NULL, 'Private messaging'),
  ('seed-title-password', NULL, 'password', 'Title contains "password"'),
  ('seed-title-bank', NULL, 'bank', 'Banking sites'),
  ('seed-title-chase', NULL, 'chase', 'Banking sites'),
  ('seed-title-login', NULL, 'login', 'Login pages'),
  ('seed-title-signin', NULL, 'sign in', 'Sign-in pages'),
  ('seed-title-2fa', NULL, '2fa', 'Two-factor authentication'),
  ('seed-title-auth', NULL, 'authentication', 'Authentication pages');
```

- [ ] **Step 2: Add a test that seed runs and is idempotent**

Append to `tests/db.test.ts`:

```typescript
import { runMigrations } from '@main/db/migrate';
import Database from 'better-sqlite3';

describe('seed exclusions migration', () => {
  it('seeds default exclusions on first run', () => {
    const db = openDatabase(path.join(tmpDir, 'test.db'));
    const count = (db.prepare('SELECT COUNT(*) as c FROM exclusions').get() as { c: number }).c;
    expect(count).toBeGreaterThanOrEqual(16);
  });

  it('does not duplicate exclusions on second open', () => {
    const dbPath = path.join(tmpDir, 'test.db');
    openDatabase(dbPath);
    const firstCount = (getDatabase().prepare('SELECT COUNT(*) as c FROM exclusions').get() as { c: number }).c;
    closeDatabase();

    openDatabase(dbPath);
    const secondCount = (getDatabase().prepare('SELECT COUNT(*) as c FROM exclusions').get() as { c: number }).c;
    expect(secondCount).toBe(firstCount);
  });
});
```

Add to imports at top of file: `import { getDatabase } from '@main/db/index';`

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/db.test.ts`
Expected: ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/db/migrations/002_seed_exclusions.sql tests/db.test.ts
git commit -m "feat(db): seed default exclusions (idempotent)"
```

---

## Phase C — Pure capture logic (TDD)

### Task 10: Classifier (keyword matcher)

**Files:**
- Create: `src/main/capture/classifier.ts`
- Create: `tests/classifier.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/classifier.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { classify } from '@main/capture/classifier';
import type { Project } from '@shared/types';

const projects: Project[] = [
  { id: 'p1', label: 'Project A', category: null, keywords: ['projecta', 'client-work'], goal_id: null, display_order: 0 },
  { id: 'p2', label: 'Project B', category: null, keywords: ['internal', 'dev'], goal_id: null, display_order: 1 },
];

describe('classify', () => {
  it('matches a keyword in the window title (case-insensitive)', () => {
    const result = classify({ appName: 'Code.exe', windowTitle: 'client-work · main · VS Code' }, projects);
    expect(result).toEqual({ label: 'Project A', confidence: 1.0 });
  });

  it('matches a keyword in the app name', () => {
    const result = classify({ appName: 'Internal Tool.exe', windowTitle: 'Untitled' }, projects);
    expect(result).toEqual({ label: 'Project B', confidence: 1.0 });
  });

  it('returns unclassified when nothing matches', () => {
    const result = classify({ appName: 'chrome.exe', windowTitle: 'Wikipedia' }, projects);
    expect(result).toEqual({ label: 'unclassified', confidence: 0 });
  });

  it('first-project-in-order wins on ambiguous match', () => {
    const ambiguous: Project[] = [
      { id: 'p1', label: 'First', category: null, keywords: ['foo'], goal_id: null, display_order: 0 },
      { id: 'p2', label: 'Second', category: null, keywords: ['foo'], goal_id: null, display_order: 1 },
    ];
    const result = classify({ appName: 'x', windowTitle: 'foo' }, ambiguous);
    expect(result.label).toBe('First');
  });

  it('handles empty keywords gracefully', () => {
    const result = classify({ appName: 'x', windowTitle: 'y' }, [
      { id: 'p1', label: 'Empty', category: null, keywords: [], goal_id: null, display_order: 0 },
    ]);
    expect(result).toEqual({ label: 'unclassified', confidence: 0 });
  });

  it('null app/title does not crash', () => {
    const result = classify({ appName: null, windowTitle: null }, projects);
    expect(result).toEqual({ label: 'unclassified', confidence: 0 });
  });
});
```

Run: `npx vitest run tests/classifier.test.ts`
Expected: FAIL (`classify` not defined).

- [ ] **Step 2: Implement classifier**

```typescript
// src/main/capture/classifier.ts
import type { Project } from '@shared/types';

export interface ClassifyInput {
  appName: string | null;
  windowTitle: string | null;
}

export interface ClassifyResult {
  label: string;
  confidence: number;
}

export function classify(
  input: ClassifyInput,
  projects: Project[],
): ClassifyResult {
  const haystack = `${input.appName ?? ''} ${input.windowTitle ?? ''}`.toLowerCase();
  if (!haystack.trim()) return { label: 'unclassified', confidence: 0 };

  // Stable ordering by display_order, then by id, so first-match-wins is deterministic.
  const ordered = [...projects].sort((a, b) => {
    if (a.display_order !== b.display_order) return a.display_order - b.display_order;
    return a.id.localeCompare(b.id);
  });

  for (const project of ordered) {
    for (const kw of project.keywords) {
      if (!kw) continue;
      if (haystack.includes(kw.toLowerCase())) {
        return { label: project.label, confidence: 1.0 };
      }
    }
  }
  return { label: 'unclassified', confidence: 0 };
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/classifier.test.ts`
Expected: ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/capture/classifier.ts tests/classifier.test.ts
git commit -m "feat(capture): keyword classifier"
```

---

### Task 11: Exclusion matcher + ULID utility

**Files:**
- Create: `src/main/capture/exclusions.ts`
- Create: `src/main/ulid.ts`
- Create: `tests/exclusions.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/exclusions.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isExcluded } from '@main/capture/exclusions';
import type { Exclusion } from '@shared/types';

const ex: Exclusion[] = [
  { id: '1', app_name: '1Password', window_title_contains: null, reason: null },
  { id: '2', app_name: null, window_title_contains: 'bank', reason: null },
  { id: '3', app_name: null, window_title_contains: 'login', reason: null },
];

describe('isExcluded', () => {
  it('matches app name exactly, case-insensitive', () => {
    expect(isExcluded({ appName: '1password', windowTitle: '' }, ex)).toBe(true);
    expect(isExcluded({ appName: '1Password', windowTitle: '' }, ex)).toBe(true);
  });

  it('does not match partial app name', () => {
    expect(isExcluded({ appName: 'NotPassword', windowTitle: '' }, ex)).toBe(false);
  });

  it('matches title substring, case-insensitive', () => {
    expect(isExcluded({ appName: 'chrome', windowTitle: 'Chase Bank Login' }, ex)).toBe(true);
  });

  it('handles null app and title', () => {
    expect(isExcluded({ appName: null, windowTitle: null }, ex)).toBe(false);
  });

  it('empty exclusion list returns false', () => {
    expect(isExcluded({ appName: '1Password', windowTitle: 'anything' }, [])).toBe(false);
  });
});
```

Run: `npx vitest run tests/exclusions.test.ts`
Expected: FAIL (`isExcluded` not defined).

- [ ] **Step 2: Implement exclusions matcher**

```typescript
// src/main/capture/exclusions.ts
import type { Exclusion } from '@shared/types';

export interface ExclusionInput {
  appName: string | null;
  windowTitle: string | null;
}

export function isExcluded(input: ExclusionInput, exclusions: Exclusion[]): boolean {
  const app = (input.appName ?? '').toLowerCase().trim();
  const title = (input.windowTitle ?? '').toLowerCase();

  for (const ex of exclusions) {
    if (ex.app_name) {
      if (app === ex.app_name.toLowerCase().trim()) return true;
    }
    if (ex.window_title_contains) {
      if (title.includes(ex.window_title_contains.toLowerCase())) return true;
    }
  }
  return false;
}
```

- [ ] **Step 3: Create `src/main/ulid.ts`** (thin wrapper so tests can inject)

```typescript
import { ulid as ulidImpl } from 'ulid';

export function ulid(): string {
  return ulidImpl();
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/exclusions.test.ts`
Expected: ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/capture/exclusions.ts src/main/ulid.ts tests/exclusions.test.ts
git commit -m "feat(capture): exclusion matcher + ULID utility"
```

---

### Task 12: Idle state machine (TDD)

**Files:**
- Create: `src/main/capture/idle.ts`
- Create: `tests/idle.test.ts`

The state machine tracks one session's idle/pause/close evolution. Pure function, deterministic.

- [ ] **Step 1: Write failing tests**

`tests/idle.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { evaluateIdle, type IdleInput, type IdleOutcome } from '@main/capture/idle';

const baseInput: Omit<IdleInput, 'idleSeconds' | 'now' | 'session'> = {
  pauseThresholdSec: 120,
  closeThresholdSec: 600,
};

const baseSession = {
  startTime: 1000,
  pausedMs: 0,
  idleStartedAt: null as number | null,
};

describe('evaluateIdle', () => {
  it('returns "active" when idleSeconds < 120', () => {
    const out = evaluateIdle({ ...baseInput, idleSeconds: 30, now: 60_000, session: { ...baseSession } });
    expect(out.action).toBe('active');
  });

  it('returns "pause" and sets idleStartedAt on first idle tick over 120s', () => {
    const out = evaluateIdle({ ...baseInput, idleSeconds: 130, now: 200_000, session: { ...baseSession } });
    expect(out.action).toBe('pause');
    expect(out.idleStartedAt).toBe(200_000 - 130_000); // 70_000
  });

  it('keeps "pause" without changing idleStartedAt on subsequent idle ticks', () => {
    const sess = { ...baseSession, idleStartedAt: 100_000 };
    const out = evaluateIdle({ ...baseInput, idleSeconds: 200, now: 300_000, session: sess });
    expect(out.action).toBe('pause');
    expect(out.idleStartedAt).toBe(100_000); // unchanged
  });

  it('returns "resume" with accrued pausedMs when input returns under 120s', () => {
    const sess = { ...baseSession, idleStartedAt: 100_000 };
    // Input returned at now=150_000, idleSeconds=10 (so idle ended at now-10s=140_000)
    const out = evaluateIdle({ ...baseInput, idleSeconds: 10, now: 150_000, session: sess });
    expect(out.action).toBe('resume');
    expect(out.addPausedMs).toBe(140_000 - 100_000); // 40_000
    expect(out.idleStartedAt).toBeNull();
  });

  it('returns "close" with end_time = idleStartedAt when idle exceeds 600s', () => {
    const sess = { ...baseSession, idleStartedAt: 100_000 };
    const out = evaluateIdle({ ...baseInput, idleSeconds: 700, now: 800_000, session: sess });
    expect(out.action).toBe('close');
    expect(out.closeAt).toBe(100_000);
  });

  it('closes immediately on threshold cross even if idleStartedAt was null', () => {
    // Edge case: app was restarted mid-idle, no idleStartedAt yet, but already idle 700s.
    const out = evaluateIdle({ ...baseInput, idleSeconds: 700, now: 1_000_000, session: { ...baseSession } });
    expect(out.action).toBe('close');
    expect(out.closeAt).toBe(1_000_000 - 700_000); // idle-start derived from idleSeconds
  });
});
```

Run: `npx vitest run tests/idle.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement idle state machine**

```typescript
// src/main/capture/idle.ts

export interface IdleInput {
  idleSeconds: number;          // from powerMonitor.getSystemIdleTime()
  now: number;                  // Date.now()
  pauseThresholdSec: number;    // 120
  closeThresholdSec: number;    // 600
  session: {
    startTime: number;
    pausedMs: number;
    idleStartedAt: number | null;
  };
}

export type IdleOutcome =
  | { action: 'active' }
  | { action: 'pause'; idleStartedAt: number }
  | { action: 'resume'; addPausedMs: number; idleStartedAt: null }
  | { action: 'close'; closeAt: number };

export function evaluateIdle(input: IdleInput): IdleOutcome {
  const { idleSeconds, now, pauseThresholdSec, closeThresholdSec, session } = input;
  const idleMs = idleSeconds * 1000;
  const derivedIdleStartedAt = session.idleStartedAt ?? (now - idleMs);

  if (idleSeconds >= closeThresholdSec) {
    return { action: 'close', closeAt: derivedIdleStartedAt };
  }

  if (idleSeconds >= pauseThresholdSec) {
    if (session.idleStartedAt === null) {
      return { action: 'pause', idleStartedAt: derivedIdleStartedAt };
    }
    return { action: 'pause', idleStartedAt: session.idleStartedAt };
  }

  // Active
  if (session.idleStartedAt !== null) {
    // We were paused; activity resumed.
    const pauseEnd = now - idleMs; // when input actually came back
    return {
      action: 'resume',
      addPausedMs: pauseEnd - session.idleStartedAt,
      idleStartedAt: null,
    };
  }
  return { action: 'active' };
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/idle.test.ts`
Expected: ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/capture/idle.ts tests/idle.test.ts
git commit -m "feat(capture): idle state machine (active/pause/resume/close)"
```

---

### Task 13: Session repository (CRUD + open/close/heartbeat)

**Files:**
- Create: `src/main/capture/sessions.ts`
- Create: `tests/sessions.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/sessions.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import { SessionRepo } from '@main/capture/sessions';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../src/main/db/migrations');

let db: Database.Database;
let repo: SessionRepo;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrationsDir);
  repo = new SessionRepo(db);
});

afterEach(() => db.close());

describe('SessionRepo', () => {
  it('opens a new session and returns the id', () => {
    const id = repo.open({
      startTime: 1000,
      appName: 'code.exe',
      windowTitle: 'main.ts',
      displayId: 1,
      projectLabel: 'Project A',
      confidence: 1.0,
    });
    const row = db.prepare('SELECT * FROM sessions WHERE id=?').get(id) as any;
    expect(row.app_name).toBe('code.exe');
    expect(row.start_time).toBe(1000);
    expect(row.end_time).toBeNull();
    expect(row.kind).toBe('work');
  });

  it('closes a session by setting end_time', () => {
    const id = repo.open({ startTime: 1000, appName: 'x', windowTitle: 'y', displayId: 0, projectLabel: 'unclassified', confidence: 0 });
    repo.close(id, 5000);
    const row = db.prepare('SELECT end_time FROM sessions WHERE id=?').get(id) as any;
    expect(row.end_time).toBe(5000);
  });

  it('marks session as "transition" when duration < 4 minutes', () => {
    const id = repo.open({ startTime: 0, appName: 'x', windowTitle: 'y', displayId: 0, projectLabel: 'unclassified', confidence: 0 });
    repo.close(id, 60_000); // 1 minute
    const row = db.prepare('SELECT kind FROM sessions WHERE id=?').get(id) as any;
    expect(row.kind).toBe('transition');
  });

  it('keeps kind=work when duration >= 4 minutes', () => {
    const id = repo.open({ startTime: 0, appName: 'x', windowTitle: 'y', displayId: 0, projectLabel: 'unclassified', confidence: 0 });
    repo.close(id, 5 * 60_000);
    const row = db.prepare('SELECT kind FROM sessions WHERE id=?').get(id) as any;
    expect(row.kind).toBe('work');
  });

  it('heartbeat updates end_time on an open session', () => {
    const id = repo.open({ startTime: 1000, appName: 'x', windowTitle: 'y', displayId: 0, projectLabel: 'unclassified', confidence: 0 });
    repo.heartbeat(id, 9000);
    const row = db.prepare('SELECT end_time FROM sessions WHERE id=?').get(id) as any;
    expect(row.end_time).toBe(9000);
  });

  it('adds to paused_ms', () => {
    const id = repo.open({ startTime: 0, appName: 'x', windowTitle: 'y', displayId: 0, projectLabel: 'unclassified', confidence: 0 });
    repo.addPausedMs(id, 30_000);
    repo.addPausedMs(id, 15_000);
    const row = db.prepare('SELECT paused_ms FROM sessions WHERE id=?').get(id) as any;
    expect(row.paused_ms).toBe(45_000);
  });

  it('reclassify changes project_label and confidence', () => {
    const id = repo.open({ startTime: 0, appName: 'x', windowTitle: 'y', displayId: 0, projectLabel: 'unclassified', confidence: 0 });
    repo.reclassify(id, 'Project B');
    const row = db.prepare('SELECT project_label, confidence FROM sessions WHERE id=?').get(id) as any;
    expect(row.project_label).toBe('Project B');
    expect(row.confidence).toBe(1.0);
  });

  it('recentSessions returns the last N ordered by start_time desc', () => {
    repo.open({ startTime: 1000, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'P', confidence: 1 });
    repo.open({ startTime: 2000, appName: 'b', windowTitle: 't', displayId: 0, projectLabel: 'P', confidence: 1 });
    repo.open({ startTime: 3000, appName: 'c', windowTitle: 't', displayId: 0, projectLabel: 'P', confidence: 1 });
    const rows = repo.recentSessions(2);
    expect(rows.map(r => r.app_name)).toEqual(['c', 'b']);
  });
});
```

Run: `npx vitest run tests/sessions.test.ts`
Expected: FAIL.

- [ ] **Step 2: Implement SessionRepo**

```typescript
// src/main/capture/sessions.ts
import type Database from 'better-sqlite3';
import { ulid } from '../ulid';
import type { Session, SessionKind } from '@shared/types';

const TRANSITION_THRESHOLD_MS = 4 * 60 * 1000;

export interface OpenSessionInput {
  startTime: number;
  appName: string | null;
  windowTitle: string | null;
  displayId: number | null;
  projectLabel: string;
  confidence: number;
  kind?: SessionKind;
}

export class SessionRepo {
  constructor(private db: Database.Database) {}

  open(input: OpenSessionInput): string {
    const id = ulid();
    this.db.prepare(`
      INSERT INTO sessions (id, start_time, end_time, app_name, window_title, display_id, project_label, confidence, kind, paused_ms)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      id, input.startTime, input.appName, input.windowTitle, input.displayId,
      input.projectLabel, input.confidence, input.kind ?? 'work',
    );
    return id;
  }

  close(id: string, endTime: number): void {
    const row = this.db.prepare('SELECT start_time, kind, paused_ms FROM sessions WHERE id=?').get(id) as { start_time: number; kind: SessionKind; paused_ms: number } | undefined;
    if (!row) return;
    const effectiveDuration = endTime - row.start_time - row.paused_ms;
    const newKind: SessionKind = row.kind === 'work' && effectiveDuration < TRANSITION_THRESHOLD_MS ? 'transition' : row.kind;
    this.db.prepare('UPDATE sessions SET end_time = ?, kind = ? WHERE id = ?').run(endTime, newKind, id);
  }

  heartbeat(id: string, now: number): void {
    this.db.prepare('UPDATE sessions SET end_time = ? WHERE id = ?').run(now, id);
  }

  addPausedMs(id: string, ms: number): void {
    this.db.prepare('UPDATE sessions SET paused_ms = paused_ms + ? WHERE id = ?').run(ms, id);
  }

  reclassify(id: string, newLabel: string): void {
    this.db.prepare('UPDATE sessions SET project_label = ?, confidence = 1.0 WHERE id = ?').run(newLabel, id);
  }

  recentSessions(limit: number): Session[] {
    return this.db.prepare(
      'SELECT * FROM sessions ORDER BY start_time DESC LIMIT ?'
    ).all(limit) as Session[];
  }

  todayStats(now: number): { totalSessions: number; topProjects: Array<{ label: string; totalMs: number }>; longestBlockMs: number } {
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startMs = startOfDay.getTime();

    const sessions = this.db.prepare(
      'SELECT app_name, project_label, start_time, end_time, paused_ms FROM sessions WHERE start_time >= ? AND end_time IS NOT NULL'
    ).all(startMs) as Array<{ app_name: string; project_label: string; start_time: number; end_time: number; paused_ms: number }>;

    const byProject = new Map<string, number>();
    let longestBlockMs = 0;
    for (const s of sessions) {
      const dur = Math.max(0, s.end_time - s.start_time - s.paused_ms);
      byProject.set(s.project_label, (byProject.get(s.project_label) ?? 0) + dur);
      if (dur > longestBlockMs) longestBlockMs = dur;
    }
    const topProjects = [...byProject.entries()]
      .map(([label, totalMs]) => ({ label, totalMs }))
      .sort((a, b) => b.totalMs - a.totalMs)
      .slice(0, 3);
    return { totalSessions: sessions.length, topProjects, longestBlockMs };
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/sessions.test.ts`
Expected: ALL PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main/capture/sessions.ts tests/sessions.test.ts
git commit -m "feat(capture): SessionRepo (open/close/heartbeat/reclassify)"
```

---

## Phase D — OS integration

### Task 14: Window poller (get-windows wrapper)

**Files:**
- Create: `src/main/capture/window-poller.ts`

This module is a thin wrapper. The real test is an integration smoke (runs only on dev machine), not a unit test.

- [ ] **Step 1: Create `src/main/capture/window-poller.ts`**

```typescript
// Thin wrapper around get-windows that normalizes the return shape and swallows
// errors (we never want a single bad poll to crash the engine).

import { activeWindow } from 'get-windows';
import log from '../log';

export interface WindowSnapshot {
  appName: string | null;
  windowTitle: string | null;
  pid: number | null;
  // The bounds — captured for future multi-monitor hit-test work. Unused in Phase 1.
  bounds: { x: number; y: number; width: number; height: number } | null;
}

export async function pollActiveWindow(): Promise<WindowSnapshot | null> {
  try {
    const result = await activeWindow();
    if (!result) return null;
    return {
      appName: result.owner?.name ?? null,
      windowTitle: result.title ?? null,
      pid: result.owner?.processId ?? null,
      bounds: result.bounds ?? null,
    };
  } catch (err) {
    log.warn('pollActiveWindow failed:', err);
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/capture/window-poller.ts
git commit -m "feat(capture): get-windows wrapper (window-poller)"
```

---

### Task 15: Cursor → display module

**Files:**
- Create: `src/main/capture/cursor.ts`

- [ ] **Step 1: Create `src/main/capture/cursor.ts`**

```typescript
import { screen } from 'electron';
import log from '../log';

export interface CursorSnapshot {
  x: number;
  y: number;
  displayId: number;
}

export function getCursorSnapshot(): CursorSnapshot | null {
  try {
    const point = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(point);
    return { x: point.x, y: point.y, displayId: display.id };
  } catch (err) {
    log.warn('getCursorSnapshot failed:', err);
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/capture/cursor.ts
git commit -m "feat(capture): cursor → display snapshot"
```

---

### Task 16: Input gate (uiohook-napi wrapper)

**Files:**
- Create: `src/main/capture/input-gate.ts`

The input gate emits an event whenever there's keyboard or mouse input; it does NOT log positions or keys. It is purely a "did anything happen?" signal.

- [ ] **Step 1: Create `src/main/capture/input-gate.ts`**

```typescript
import { uIOhook } from 'uiohook-napi';
import { EventEmitter } from 'events';
import log from '../log';

export class InputGate extends EventEmitter {
  private started = false;
  private lastEmittedAt = 0;
  private readonly debounceMs = 250;

  start(): void {
    if (this.started) return;
    try {
      uIOhook.on('keydown', () => this.maybeEmit());
      uIOhook.on('mousedown', () => this.maybeEmit());
      uIOhook.on('mousemove', () => this.maybeEmit());
      uIOhook.on('wheel', () => this.maybeEmit());
      uIOhook.start();
      this.started = true;
      log.info('InputGate started');
    } catch (err) {
      log.error('InputGate failed to start:', err);
    }
  }

  stop(): void {
    if (!this.started) return;
    try {
      uIOhook.stop();
      this.started = false;
      log.info('InputGate stopped');
    } catch (err) {
      log.warn('InputGate stop failed:', err);
    }
  }

  private maybeEmit(): void {
    const now = Date.now();
    if (now - this.lastEmittedAt < this.debounceMs) return;
    this.lastEmittedAt = now;
    this.emit('input', now);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/capture/input-gate.ts
git commit -m "feat(capture): InputGate (uiohook-napi wrapper, no key logging)"
```

---

## Phase E — Engine orchestration

### Task 17: CaptureEngine

**Files:**
- Create: `src/main/capture/engine.ts`

The engine wires inputs → state transitions → DB writes. State lives in this class.

- [ ] **Step 1: Create `src/main/capture/engine.ts`**

```typescript
import { EventEmitter } from 'events';
import { powerMonitor } from 'electron';
import type Database from 'better-sqlite3';
import { SessionRepo, type OpenSessionInput } from './sessions';
import { classify } from './classifier';
import { isExcluded } from './exclusions';
import { evaluateIdle } from './idle';
import { pollActiveWindow } from './window-poller';
import { getCursorSnapshot } from './cursor';
import { InputGate } from './input-gate';
import type { Project, Exclusion, EngineStatus } from '@shared/types';
import log from '../log';

const TICK_DEBOUNCE_MS = 1500;
const HEARTBEAT_INTERVAL_MS = 90_000;
const PAUSE_THRESHOLD_SEC = 120;
const CLOSE_THRESHOLD_SEC = 600;

interface ActiveSessionState {
  id: string;
  startTime: number;
  appName: string | null;
  windowTitle: string | null;
  pausedMs: number;
  idleStartedAt: number | null;
  lastHeartbeatAt: number;
}

export class CaptureEngine extends EventEmitter {
  private repo: SessionRepo;
  private projects: Project[] = [];
  private exclusions: Exclusion[] = [];
  private status: EngineStatus = 'stopped';
  private active: ActiveSessionState | null = null;
  private inputGate = new InputGate();
  private tickPending = false;
  private lastTickAt = 0;

  constructor(private db: Database.Database) {
    super();
    this.repo = new SessionRepo(db);
    this.inputGate.on('input', () => this.scheduleTick());
  }

  reloadProjects(): void {
    const rows = this.db.prepare('SELECT * FROM projects ORDER BY display_order, id').all() as Array<any>;
    this.projects = rows.map(r => ({ ...r, keywords: JSON.parse(r.keywords ?? '[]') }));
  }

  reloadExclusions(): void {
    this.exclusions = this.db.prepare('SELECT * FROM exclusions').all() as Exclusion[];
  }

  start(): void {
    if (this.status !== 'stopped' && this.status !== 'paused') return;
    this.reloadProjects();
    this.reloadExclusions();
    this.inputGate.start();
    this.status = 'active';
    this.emit('status', this.status);
    log.info('CaptureEngine started');
  }

  pause(): void {
    if (this.status === 'paused') return;
    this.closeActive(Date.now());
    this.inputGate.stop();
    this.status = 'paused';
    this.emit('status', this.status);
    log.info('CaptureEngine paused');
  }

  resume(): void {
    if (this.status !== 'paused') return;
    this.start();
  }

  stop(): void {
    this.closeActive(Date.now());
    this.inputGate.stop();
    this.status = 'stopped';
    this.emit('status', this.status);
    log.info('CaptureEngine stopped');
  }

  getStatus(): EngineStatus {
    return this.status;
  }

  // Called by lifecycle handlers (suspend / lock-screen / before-quit).
  closeActiveNow(reason: string): void {
    if (!this.active) return;
    log.info(`Closing active session: ${reason}`);
    this.closeActive(Date.now());
  }

  private scheduleTick(): void {
    if (this.status !== 'active') return;
    const now = Date.now();
    if (now - this.lastTickAt < TICK_DEBOUNCE_MS) return;
    if (this.tickPending) return;
    this.tickPending = true;
    setTimeout(() => this.tick().catch(err => log.error('tick error', err)), TICK_DEBOUNCE_MS);
  }

  private async tick(): Promise<void> {
    this.tickPending = false;
    this.lastTickAt = Date.now();
    if (this.status !== 'active') return;

    const now = Date.now();
    const idleSeconds = powerMonitor.getSystemIdleTime();
    const win = await pollActiveWindow();
    const cur = getCursorSnapshot();

    // Idle evaluation always runs first, regardless of window state.
    if (this.active) {
      const outcome = evaluateIdle({
        idleSeconds,
        now,
        pauseThresholdSec: PAUSE_THRESHOLD_SEC,
        closeThresholdSec: CLOSE_THRESHOLD_SEC,
        session: {
          startTime: this.active.startTime,
          pausedMs: this.active.pausedMs,
          idleStartedAt: this.active.idleStartedAt,
        },
      });
      if (outcome.action === 'close') {
        this.repo.close(this.active.id, outcome.closeAt);
        this.active = null;
        this.emitChange();
        return;
      }
      if (outcome.action === 'pause') {
        this.active.idleStartedAt = outcome.idleStartedAt;
        return;
      }
      if (outcome.action === 'resume') {
        this.repo.addPausedMs(this.active.id, outcome.addPausedMs);
        this.active.pausedMs += outcome.addPausedMs;
        this.active.idleStartedAt = null;
      }
      // active or resume → fall through to window-change check
    }

    if (!win) return;

    // Exclusion check — before any session is opened or kept.
    if (isExcluded({ appName: win.appName, windowTitle: win.windowTitle }, this.exclusions)) {
      if (this.active) {
        this.closeActive(now);
      }
      if (this.status !== 'excluded') {
        this.status = 'excluded';
        this.emit('status', this.status);
      }
      return;
    }
    if (this.status === 'excluded') {
      this.status = 'active';
      this.emit('status', this.status);
    }

    const changed =
      !this.active ||
      this.active.appName !== win.appName ||
      this.active.windowTitle !== win.windowTitle;

    if (!changed) {
      // Heartbeat keep-alive.
      if (this.active && now - this.active.lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
        this.repo.heartbeat(this.active.id, now);
        this.active.lastHeartbeatAt = now;
      }
      return;
    }

    // Transition.
    if (this.active) this.closeActive(now);

    const classification = classify(
      { appName: win.appName, windowTitle: win.windowTitle },
      this.projects,
    );
    const input: OpenSessionInput = {
      startTime: now,
      appName: win.appName,
      windowTitle: win.windowTitle,
      displayId: cur?.displayId ?? null,
      projectLabel: classification.label,
      confidence: classification.confidence,
    };
    const id = this.repo.open(input);
    this.active = {
      id,
      startTime: now,
      appName: win.appName,
      windowTitle: win.windowTitle,
      pausedMs: 0,
      idleStartedAt: null,
      lastHeartbeatAt: now,
    };
    this.emitChange();
  }

  private closeActive(now: number): void {
    if (!this.active) return;
    this.repo.close(this.active.id, now);
    this.active = null;
    this.emitChange();
  }

  private emitChange(): void {
    this.emit('change');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/capture/engine.ts
git commit -m "feat(capture): CaptureEngine orchestrator"
```

---

### Task 18: Lifecycle handlers (suspend / lock / quit / power resume)

**Files:**
- Create: `src/main/capture/lifecycle.ts`

- [ ] **Step 1: Create `src/main/capture/lifecycle.ts`**

```typescript
import { app, powerMonitor } from 'electron';
import type { CaptureEngine } from './engine';
import log from '../log';

export function installLifecycleHandlers(engine: CaptureEngine): void {
  powerMonitor.on('suspend', () => {
    log.info('System suspended');
    engine.closeActiveNow('suspend');
  });
  powerMonitor.on('lock-screen', () => {
    log.info('Screen locked');
    engine.closeActiveNow('lock-screen');
  });
  powerMonitor.on('resume', () => log.info('System resumed'));
  powerMonitor.on('unlock-screen', () => log.info('Screen unlocked'));

  app.on('before-quit', () => {
    log.info('App quitting — closing engine');
    engine.stop();
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/capture/lifecycle.ts
git commit -m "feat(capture): suspend/lock/quit lifecycle handlers"
```

---

## Phase F — UI plumbing

### Task 19: BrowserWindow factory

**Files:**
- Create: `src/main/windows/create.ts`

- [ ] **Step 1: Create `src/main/windows/create.ts`**

```typescript
import { BrowserWindow, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createMainBrowserWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    show: false,
    skipTaskbar: true,
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
    },
  });

  win.on('ready-to-show', () => win.show());

  // External links open in the OS browser, never in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/windows/create.ts
git commit -m "feat(windows): BrowserWindow factory"
```

---

### Task 20: Main window controller (singleton, close → hide)

**Files:**
- Create: `src/main/windows/main-window.ts`

- [ ] **Step 1: Create `src/main/windows/main-window.ts`**

```typescript
import { BrowserWindow } from 'electron';
import { createMainBrowserWindow } from './create';

let win: BrowserWindow | null = null;

export function openMainWindow(): BrowserWindow {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.focus();
    return win;
  }
  win = createMainBrowserWindow();
  win.on('close', (e) => {
    // Hide instead of quit. Quit only via tray menu.
    if (!global.__remirrorQuitting) {
      e.preventDefault();
      win?.hide();
    }
  });
  return win;
}

export function getMainWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null;
}
```

Also add this declaration at the top of `src/main/index.ts` (we'll touch index.ts in task 25):

```typescript
declare global {
  // eslint-disable-next-line no-var
  var __remirrorQuitting: boolean | undefined;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/windows/main-window.ts
git commit -m "feat(windows): main-window controller (close → hide)"
```

---

### Task 21: Tray icon + menu

**Files:**
- Create: `src/main/tray.ts`
- Create: `resources/icons/tray.ico` (placeholder for now)

- [ ] **Step 1: Create placeholder `resources/icons/tray.ico`**

```bash
# Use the same placeholder as app.ico (or copy it). Real art comes later.
cp resources/icons/app.ico resources/icons/tray.ico
```

- [ ] **Step 2: Create `src/main/tray.ts`**

```typescript
import { Tray, Menu, nativeImage, app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { BRAND } from '@shared/branding';
import type { EngineStatus } from '@shared/types';
import { openMainWindow } from './windows/main-window';
import type { CaptureEngine } from './capture/engine';
import log from './log';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let tray: Tray | null = null;

const STATUS_LABEL: Record<EngineStatus, string> = {
  active: '● Capture: Active',
  paused: '● Capture: Paused',
  excluded: '● Capture: Excluded app active',
  stopped: '● Capture: Stopped',
};

const TOOLTIP: Record<EngineStatus, string> = {
  active: BRAND.tray.active,
  paused: BRAND.tray.paused,
  excluded: BRAND.tray.excluded,
  stopped: BRAND.appName,
};

export function createTray(engine: CaptureEngine): Tray {
  const iconPath = path.join(__dirname, '../resources/icons/tray.ico');
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip(BRAND.appName);

  tray.on('click', () => openMainWindow());

  rebuildMenu(engine);
  engine.on('status', () => rebuildMenu(engine));
  log.info('Tray created');
  return tray;
}

export function rebuildMenu(engine: CaptureEngine): void {
  if (!tray) return;
  const status = engine.getStatus();
  const isPaused = status === 'paused';

  const menu = Menu.buildFromTemplate([
    { label: 'Open Remirror', accelerator: BRAND.hotkey.default, click: () => openMainWindow() },
    { type: 'separator' },
    { label: STATUS_LABEL[status], enabled: false },
    {
      label: isPaused ? 'Resume Capture' : 'Pause Capture',
      click: () => isPaused ? engine.resume() : engine.pause(),
    },
    { type: 'separator' },
    { label: 'Settings…', click: () => openMainWindow() }, // route picks up in renderer
    { type: 'separator' },
    { label: 'About', enabled: false }, // Phase 1: no About dialog yet
    {
      label: 'Quit',
      click: () => {
        global.__remirrorQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(TOOLTIP[status]);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/main/tray.ts resources/icons/tray.ico
git commit -m "feat(tray): tray icon + menu with engine-driven status"
```

---

### Task 22: Global hotkey

**Files:**
- Create: `src/main/hotkey.ts`

- [ ] **Step 1: Create `src/main/hotkey.ts`**

```typescript
import { globalShortcut } from 'electron';
import { openMainWindow } from './windows/main-window';
import { store } from './store';
import { BRAND } from '@shared/branding';
import log from './log';

export function registerHotkey(): void {
  const accelerator = store.get('hotkey') ?? BRAND.hotkey.default;
  const ok = globalShortcut.register(accelerator, () => openMainWindow());
  if (!ok) {
    log.warn(`Failed to register hotkey: ${accelerator}`);
  } else {
    log.info(`Hotkey registered: ${accelerator}`);
  }
}

export function unregisterAllHotkeys(): void {
  globalShortcut.unregisterAll();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/hotkey.ts
git commit -m "feat(main): global hotkey registration"
```

---

## Phase G — Wire everything into main

### Task 23: Full main entry — DB, engine, tray, hotkey, lifecycle

**Files:**
- Modify: `src/main/index.ts`

- [ ] **Step 1: Rewrite `src/main/index.ts`**

```typescript
import { app } from 'electron';
import path from 'path';
import { BRAND } from '@shared/branding';
import log from './log';
import { openDatabase, getDatabase, closeDatabase } from './db/index';
import { CaptureEngine } from './capture/engine';
import { installLifecycleHandlers } from './capture/lifecycle';
import { createTray, rebuildMenu } from './tray';
import { registerHotkey, unregisterAllHotkeys } from './hotkey';
import { openMainWindow } from './windows/main-window';
import { registerIpc } from './ipc';

declare global {
  // eslint-disable-next-line no-var
  var __remirrorQuitting: boolean | undefined;
  // eslint-disable-next-line no-var
  var __remirrorEngine: CaptureEngine | undefined;
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.setAppUserModelId(BRAND.appId);

app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'remirror.db');
  openDatabase(dbPath);

  const engine = new CaptureEngine(getDatabase());
  global.__remirrorEngine = engine;

  installLifecycleHandlers(engine);
  registerIpc(engine);
  createTray(engine);
  // (createTray already subscribes to engine.on('status', …) for menu rebuild.)
  registerHotkey();

  const isFirstRun = (getDatabase().prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number }).c === 0;
  if (isFirstRun) {
    log.info('First run — opening onboarding window');
    openMainWindow(); // renderer routes to /onboarding when projects.length === 0
  } else {
    engine.start();
  }

  log.info(`${BRAND.appName} ready`);
});

app.on('window-all-closed', () => {
  // Tray-resident: do nothing on window close.
});

app.on('will-quit', () => {
  unregisterAllHotkeys();
  closeDatabase();
});
```

- [ ] **Step 2: Create stub `src/main/ipc.ts` so the import resolves** (full implementation in Task 25)

```typescript
import type { CaptureEngine } from './capture/engine';
export function registerIpc(_engine: CaptureEngine): void {
  // implemented in task 25
}
```

- [ ] **Step 3: Verify dev boots end-to-end**

Run: `npm run dev`
Expected: app starts, tray icon appears, log shows `Remirror ready`. Since `projects` is empty, the main window opens. The placeholder renderer is showing. Click tray → menu visible. Right-click tray → see menu. Click Quit → app exits cleanly. Log file should have entries.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts src/main/ipc.ts
git commit -m "feat(main): wire DB + engine + tray + hotkey + lifecycle"
```

---

## Phase H — IPC and preload

### Task 24: IPC contract types

**Files:**
- Create: `src/shared/ipc-contract.ts`

- [ ] **Step 1: Create `src/shared/ipc-contract.ts`**

```typescript
import type { Session, Project, Exclusion, EngineStatus } from './types';

export const IPC = {
  // Engine
  ENGINE_STATUS_GET: 'engine:status:get',
  ENGINE_STATUS_CHANGED: 'engine:status:changed',
  ENGINE_PAUSE: 'engine:pause',
  ENGINE_RESUME: 'engine:resume',

  // Sessions
  SESSIONS_RECENT: 'sessions:recent',
  SESSIONS_TODAY_STATS: 'sessions:today_stats',
  SESSIONS_RECLASSIFY: 'sessions:reclassify',
  SESSIONS_CHANGED: 'sessions:changed',

  // Projects
  PROJECTS_LIST: 'projects:list',
  PROJECTS_UPSERT: 'projects:upsert',
  PROJECTS_DELETE: 'projects:delete',
  PROJECTS_CHANGED: 'projects:changed',

  // Exclusions
  EXCLUSIONS_LIST: 'exclusions:list',
  EXCLUSIONS_UPSERT: 'exclusions:upsert',
  EXCLUSIONS_DELETE: 'exclusions:delete',

  // Onboarding
  ONBOARDING_NEEDED: 'onboarding:needed',
  ONBOARDING_COMPLETE: 'onboarding:complete',
} as const;

export interface TodayStats {
  totalSessions: number;
  topProjects: Array<{ label: string; totalMs: number }>;
  longestBlockMs: number;
}

export interface RemirrorAPI {
  getEngineStatus(): Promise<EngineStatus>;
  onEngineStatusChanged(cb: (status: EngineStatus) => void): () => void;
  pauseCapture(): Promise<void>;
  resumeCapture(): Promise<void>;

  recentSessions(limit: number): Promise<Session[]>;
  todayStats(): Promise<TodayStats>;
  reclassifySession(id: string, projectLabel: string): Promise<void>;
  onSessionsChanged(cb: () => void): () => void;

  listProjects(): Promise<Project[]>;
  upsertProject(p: Omit<Project, 'id'> & { id?: string }): Promise<Project>;
  deleteProject(id: string): Promise<void>;

  listExclusions(): Promise<Exclusion[]>;
  upsertExclusion(e: Omit<Exclusion, 'id'> & { id?: string }): Promise<Exclusion>;
  deleteExclusion(id: string): Promise<void>;

  isOnboardingNeeded(): Promise<boolean>;
  completeOnboarding(): Promise<void>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/ipc-contract.ts
git commit -m "feat(ipc): contract types"
```

---

### Task 25: Implement IPC handlers in main

**Files:**
- Modify: `src/main/ipc.ts`

- [ ] **Step 1: Rewrite `src/main/ipc.ts`**

```typescript
import { ipcMain, BrowserWindow } from 'electron';
import { IPC, type TodayStats } from '@shared/ipc-contract';
import type { CaptureEngine } from './capture/engine';
import { getDatabase } from './db/index';
import { SessionRepo } from './capture/sessions';
import { ulid } from './ulid';
import type { Project, Exclusion } from '@shared/types';

export function registerIpc(engine: CaptureEngine): void {
  const db = getDatabase();
  const repo = new SessionRepo(db);

  // Engine
  ipcMain.handle(IPC.ENGINE_STATUS_GET, () => engine.getStatus());
  ipcMain.handle(IPC.ENGINE_PAUSE, () => engine.pause());
  ipcMain.handle(IPC.ENGINE_RESUME, () => engine.resume());

  engine.on('status', (status) => broadcast(IPC.ENGINE_STATUS_CHANGED, status));
  engine.on('change', () => broadcast(IPC.SESSIONS_CHANGED));

  // Sessions
  ipcMain.handle(IPC.SESSIONS_RECENT, (_e, limit: number) => repo.recentSessions(limit));
  ipcMain.handle(IPC.SESSIONS_TODAY_STATS, (): TodayStats => repo.todayStats(Date.now()));
  ipcMain.handle(IPC.SESSIONS_RECLASSIFY, (_e, id: string, label: string) => {
    repo.reclassify(id, label);
    broadcast(IPC.SESSIONS_CHANGED);
  });

  // Projects
  ipcMain.handle(IPC.PROJECTS_LIST, (): Project[] => {
    return (db.prepare('SELECT * FROM projects ORDER BY display_order, id').all() as Array<any>)
      .map(r => ({ ...r, keywords: JSON.parse(r.keywords ?? '[]') }));
  });
  ipcMain.handle(IPC.PROJECTS_UPSERT, (_e, p: Project) => {
    const id = p.id ?? ulid();
    const keywords = JSON.stringify(p.keywords ?? []);
    db.prepare(`
      INSERT INTO projects (id, label, category, keywords, goal_id, display_order)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        label=excluded.label, category=excluded.category, keywords=excluded.keywords,
        goal_id=excluded.goal_id, display_order=excluded.display_order
    `).run(id, p.label, p.category, keywords, p.goal_id, p.display_order ?? 0);
    engine.reloadProjects();
    broadcast(IPC.PROJECTS_CHANGED);
    return { ...p, id, keywords: p.keywords ?? [] };
  });
  ipcMain.handle(IPC.PROJECTS_DELETE, (_e, id: string) => {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    engine.reloadProjects();
    broadcast(IPC.PROJECTS_CHANGED);
  });

  // Exclusions
  ipcMain.handle(IPC.EXCLUSIONS_LIST, (): Exclusion[] => {
    return db.prepare('SELECT * FROM exclusions ORDER BY id').all() as Exclusion[];
  });
  ipcMain.handle(IPC.EXCLUSIONS_UPSERT, (_e, ex: Exclusion) => {
    const id = ex.id ?? ulid();
    db.prepare(`
      INSERT INTO exclusions (id, app_name, window_title_contains, reason)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        app_name=excluded.app_name,
        window_title_contains=excluded.window_title_contains,
        reason=excluded.reason
    `).run(id, ex.app_name, ex.window_title_contains, ex.reason);
    engine.reloadExclusions();
    return { ...ex, id };
  });
  ipcMain.handle(IPC.EXCLUSIONS_DELETE, (_e, id: string) => {
    db.prepare('DELETE FROM exclusions WHERE id = ?').run(id);
    engine.reloadExclusions();
  });

  // Onboarding
  ipcMain.handle(IPC.ONBOARDING_NEEDED, (): boolean => {
    return (db.prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number }).c === 0;
  });
  ipcMain.handle(IPC.ONBOARDING_COMPLETE, () => {
    engine.start();
  });
}

function broadcast(channel: string, ...args: unknown[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, ...args);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat(ipc): implement all Phase 1 handlers"
```

---

### Task 26: Preload

**Files:**
- Create: `src/preload/index.ts`

- [ ] **Step 1: Create `src/preload/index.ts`**

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type RemirrorAPI } from '@shared/ipc-contract';

const api: RemirrorAPI = {
  getEngineStatus: () => ipcRenderer.invoke(IPC.ENGINE_STATUS_GET),
  onEngineStatusChanged: (cb) => {
    const handler = (_e: unknown, status: any) => cb(status);
    ipcRenderer.on(IPC.ENGINE_STATUS_CHANGED, handler);
    return () => ipcRenderer.off(IPC.ENGINE_STATUS_CHANGED, handler);
  },
  pauseCapture: () => ipcRenderer.invoke(IPC.ENGINE_PAUSE),
  resumeCapture: () => ipcRenderer.invoke(IPC.ENGINE_RESUME),

  recentSessions: (limit) => ipcRenderer.invoke(IPC.SESSIONS_RECENT, limit),
  todayStats: () => ipcRenderer.invoke(IPC.SESSIONS_TODAY_STATS),
  reclassifySession: (id, label) => ipcRenderer.invoke(IPC.SESSIONS_RECLASSIFY, id, label),
  onSessionsChanged: (cb) => {
    const handler = () => cb();
    ipcRenderer.on(IPC.SESSIONS_CHANGED, handler);
    return () => ipcRenderer.off(IPC.SESSIONS_CHANGED, handler);
  },

  listProjects: () => ipcRenderer.invoke(IPC.PROJECTS_LIST),
  upsertProject: (p) => ipcRenderer.invoke(IPC.PROJECTS_UPSERT, p),
  deleteProject: (id) => ipcRenderer.invoke(IPC.PROJECTS_DELETE, id),

  listExclusions: () => ipcRenderer.invoke(IPC.EXCLUSIONS_LIST),
  upsertExclusion: (e) => ipcRenderer.invoke(IPC.EXCLUSIONS_UPSERT, e),
  deleteExclusion: (id) => ipcRenderer.invoke(IPC.EXCLUSIONS_DELETE, id),

  isOnboardingNeeded: () => ipcRenderer.invoke(IPC.ONBOARDING_NEEDED),
  completeOnboarding: () => ipcRenderer.invoke(IPC.ONBOARDING_COMPLETE),
};

contextBridge.exposeInMainWorld('remirror', api);
```

- [ ] **Step 2: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(preload): expose remirror API via contextBridge"
```

---

## Phase I — Renderer

### Task 27: App shell + global types + base UI components

**Files:**
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/hooks/useRemirror.ts`
- Create: `src/renderer/ui/Button.tsx`
- Create: `src/renderer/ui/Input.tsx`
- Modify: `src/renderer/index.tsx`

- [ ] **Step 1: Create `src/renderer/hooks/useRemirror.ts`**

```typescript
import type { RemirrorAPI } from '@shared/ipc-contract';

declare global {
  interface Window {
    remirror: RemirrorAPI;
  }
}

export function useRemirror(): RemirrorAPI {
  return window.remirror;
}
```

- [ ] **Step 2: Create `src/renderer/ui/Button.tsx`**

```typescript
import React from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'ghost' | 'danger';

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'primary', className, ...props }: Props) {
  const base = 'px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const v: Record<Variant, string> = {
    primary: 'bg-accent text-bg hover:opacity-90',
    ghost: 'bg-transparent text-text hover:bg-surface',
    danger: 'bg-surface text-text hover:bg-amber',
  };
  return <button className={clsx(base, v[variant], className)} {...props} />;
}
```

(Note: `clsx` is tiny. Add it to dependencies in package.json: `"clsx": "^2.1.1"` and run `npm install clsx`.)

- [ ] **Step 3: Create `src/renderer/ui/Input.tsx`**

```typescript
import React from 'react';
import clsx from 'clsx';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={clsx(
        'w-full bg-surface text-text rounded-md px-3 py-2 outline-none ring-1 ring-transparent focus:ring-accent',
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 4: Create `src/renderer/App.tsx`**

```typescript
import React, { useEffect, useState } from 'react';
import { Onboarding } from './routes/Onboarding';
import { Status } from './routes/Status';
import { useRemirror } from './hooks/useRemirror';

type Route = 'loading' | 'onboarding' | 'status';

export function App() {
  const api = useRemirror();
  const [route, setRoute] = useState<Route>('loading');

  useEffect(() => {
    api.isOnboardingNeeded().then(needed => setRoute(needed ? 'onboarding' : 'status'));
  }, [api]);

  if (route === 'loading') {
    return <div className="flex items-center justify-center h-full text-muted">Loading…</div>;
  }
  if (route === 'onboarding') {
    return <Onboarding onComplete={() => { api.completeOnboarding(); setRoute('status'); }} />;
  }
  return <Status />;
}
```

- [ ] **Step 5: Update `src/renderer/index.tsx`**

```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);
```

- [ ] **Step 6: Install clsx**

Run: `npm install clsx`

- [ ] **Step 7: Commit**

```bash
git add src/renderer/App.tsx src/renderer/hooks/useRemirror.ts src/renderer/ui/Button.tsx src/renderer/ui/Input.tsx src/renderer/index.tsx package.json package-lock.json
git commit -m "feat(renderer): App shell + base UI primitives"
```

---

### Task 28: Onboarding route (3 steps) + ProjectEditor + ExclusionEditor

**Files:**
- Create: `src/renderer/routes/Onboarding.tsx`
- Create: `src/renderer/ui/ProjectEditor.tsx`
- Create: `src/renderer/ui/ExclusionEditor.tsx`

- [ ] **Step 1: Create `src/renderer/ui/ProjectEditor.tsx`**

```typescript
import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { Project } from '@shared/types';
import { Button } from './Button';
import { Input } from './Input';

interface Props {
  onChange?: (projects: Project[]) => void;
}

export function ProjectEditor({ onChange }: Props) {
  const api = useRemirror();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    api.listProjects().then(setProjects);
  }, [api]);

  useEffect(() => { onChange?.(projects); }, [projects, onChange]);

  function update(idx: number, patch: Partial<Project>) {
    setProjects(prev => prev.map((p, i) => i === idx ? { ...p, ...patch } : p));
  }

  async function save(p: Project) {
    const saved = await api.upsertProject(p);
    setProjects(prev => prev.map(x => x === p ? saved : x));
  }

  async function remove(p: Project) {
    if (p.id) await api.deleteProject(p.id);
    setProjects(prev => prev.filter(x => x !== p));
  }

  function addEmpty() {
    setProjects(prev => [
      ...prev,
      {
        id: '',
        label: '',
        category: null,
        keywords: [],
        goal_id: null,
        display_order: prev.length,
      },
    ]);
  }

  const list = projects.length === 0
    ? ([
        { id: '', label: 'Project A', category: null, keywords: ['projecta', 'client-work'], goal_id: null, display_order: 0 },
        { id: '', label: 'Project B', category: null, keywords: ['internal', 'dev'], goal_id: null, display_order: 1 },
      ] as Project[])
    : projects;

  if (projects.length === 0 && list.length > 0) {
    // Seed the empty-state placeholders into local state so the user can edit them.
    setProjects(list);
  }

  return (
    <div className="space-y-3">
      {projects.map((p, i) => (
        <div key={i} className="bg-surface p-4 rounded-lg space-y-2">
          <Input
            placeholder="Project name"
            value={p.label}
            onChange={e => update(i, { label: e.target.value })}
          />
          <Input
            placeholder="Keywords, comma-separated (match against window titles)"
            value={p.keywords.join(', ')}
            onChange={e => update(i, {
              keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
            })}
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => save(p)} disabled={!p.label}>Save</Button>
            <Button variant="ghost" onClick={() => remove(p)}>Remove</Button>
          </div>
        </div>
      ))}
      <Button variant="ghost" onClick={addEmpty}>+ Add project</Button>
      <p className="text-muted text-sm">
        Keywords are matched (case-insensitive substring) against both window titles and app names.
        First match wins.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/renderer/ui/ExclusionEditor.tsx`**

```typescript
import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { Exclusion } from '@shared/types';
import { Button } from './Button';
import { Input } from './Input';

export function ExclusionEditor() {
  const api = useRemirror();
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [draft, setDraft] = useState({ app_name: '', title: '', reason: '' });

  useEffect(() => { api.listExclusions().then(setExclusions); }, [api]);

  async function add() {
    if (!draft.app_name && !draft.title) return;
    const saved = await api.upsertExclusion({
      app_name: draft.app_name || null,
      window_title_contains: draft.title || null,
      reason: draft.reason || null,
    });
    setExclusions(prev => [...prev, saved]);
    setDraft({ app_name: '', title: '', reason: '' });
  }

  async function remove(id: string) {
    await api.deleteExclusion(id);
    setExclusions(prev => prev.filter(e => e.id !== id));
  }

  const seeded = exclusions.filter(e => e.id.startsWith('seed-'));
  const user = exclusions.filter(e => !e.id.startsWith('seed-'));

  return (
    <div className="space-y-4">
      <div className="bg-surface p-4 rounded-lg">
        <div className="text-sm text-muted mb-2">These defaults are always excluded:</div>
        <div className="text-sm space-y-1">
          {seeded.map(e => (
            <div key={e.id}>
              · {e.app_name ?? `title contains "${e.window_title_contains}"`}
              {e.reason && <span className="text-muted"> — {e.reason}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm text-muted">Your custom exclusions:</div>
        {user.map(e => (
          <div key={e.id} className="bg-surface p-3 rounded-md flex items-center justify-between">
            <span className="text-sm">
              {e.app_name ?? `title contains "${e.window_title_contains}"`}
            </span>
            <Button variant="ghost" onClick={() => remove(e.id)}>Remove</Button>
          </div>
        ))}
      </div>

      <div className="bg-surface p-4 rounded-lg space-y-2">
        <Input placeholder="App name (exact, case-insensitive)" value={draft.app_name}
          onChange={e => setDraft(d => ({ ...d, app_name: e.target.value }))} />
        <Input placeholder="OR title-substring (case-insensitive)" value={draft.title}
          onChange={e => setDraft(d => ({ ...d, title: e.target.value }))} />
        <Input placeholder="Reason (for your reference)" value={draft.reason}
          onChange={e => setDraft(d => ({ ...d, reason: e.target.value }))} />
        <Button onClick={add} disabled={!draft.app_name && !draft.title}>Add exclusion</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/renderer/routes/Onboarding.tsx`**

```typescript
import React, { useState } from 'react';
import { ProjectEditor } from '../ui/ProjectEditor';
import { ExclusionEditor } from '../ui/ExclusionEditor';
import { Button } from '../ui/Button';

interface Props { onComplete: () => void; }

type Step = 1 | 2 | 3;

export function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState<Step>(1);

  return (
    <div className="min-h-full p-10 max-w-3xl mx-auto">
      <div className="text-muted text-sm mb-2">Step {step} of 3</div>
      <h1 className="text-3xl font-semibold mb-6">
        {step === 1 && 'Tell Remirror what you work on'}
        {step === 2 && 'These apps are never recorded'}
        {step === 3 && "You're done"}
      </h1>

      {step === 1 && (
        <div className="space-y-6">
          <p className="text-muted">
            Add the projects you spend time on. Remirror will match your window titles and app names
            against these keywords to label sessions as you work.
          </p>
          <ProjectEditor />
          <Button onClick={() => setStep(2)}>Continue</Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <p className="text-muted">
            Password managers, banking sites, and private messaging are excluded by default.
            Add anything else you don't want recorded.
          </p>
          <ExclusionEditor />
          <Button onClick={() => setStep(3)}>Continue</Button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <p className="text-lg">
            Capture starts now. Remirror lives in your tray.<br />
            Press <kbd className="px-2 py-1 bg-surface rounded">Alt+Shift+R</kbd> any time to open it.
          </p>
          <p className="text-muted text-sm">
            All data stays on this machine. No cloud, no telemetry, ever.
          </p>
          <Button onClick={onComplete}>Got it</Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run dev and walk through onboarding**

Run: `npm run dev`
Expected: window opens to step 1 with two placeholder project rows. Edit them, click Save on each. Continue to step 2, see seeded exclusions. Continue to step 3, click "Got it". Window stays open (no auto-close in Phase 1). Engine starts in background. Status view should now load (Task 29).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/ui/ProjectEditor.tsx src/renderer/ui/ExclusionEditor.tsx src/renderer/routes/Onboarding.tsx
git commit -m "feat(renderer): onboarding (projects + exclusions + done)"
```

---

### Task 29: Status route + SessionRow with reclassify popover

**Files:**
- Create: `src/renderer/routes/Status.tsx`
- Create: `src/renderer/ui/SessionRow.tsx`

- [ ] **Step 1: Create `src/renderer/ui/SessionRow.tsx`**

```typescript
import React, { useEffect, useState } from 'react';
import type { Session, Project } from '@shared/types';
import { useRemirror } from '../hooks/useRemirror';

function fmtTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ''}`;
}

interface Props {
  session: Session;
  projects: Project[];
}

export function SessionRow({ session, projects }: Props) {
  const api = useRemirror();
  const [open, setOpen] = useState(false);
  const duration = session.end_time
    ? Math.max(0, session.end_time - session.start_time - session.paused_ms)
    : 0;

  async function reclassify(label: string) {
    await api.reclassifySession(session.id, label);
    setOpen(false);
  }

  return (
    <div className="bg-surface rounded-md px-4 py-3 flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted w-12 shrink-0">{fmtTime(session.start_time)}</span>
          <span className="text-text truncate font-medium">{session.window_title ?? '(no title)'}</span>
          <span className="text-muted text-xs shrink-0">{session.app_name}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted mt-1">
          <span>{fmtDuration(duration)}</span>
          <span>·</span>
          <span className={session.project_label === 'unclassified' ? 'text-amber' : 'text-accent'}>
            {session.project_label}
          </span>
        </div>
      </div>
      <div className="relative ml-3">
        <button
          className="text-xs text-muted hover:text-text px-2 py-1 rounded hover:bg-bg"
          onClick={() => setOpen(o => !o)}
        >
          Set project ▾
        </button>
        {open && (
          <div className="absolute right-0 mt-1 bg-bg ring-1 ring-surface rounded-md py-1 z-10 min-w-[160px]">
            {projects.map(p => (
              <button
                key={p.id}
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-surface"
                onClick={() => reclassify(p.label)}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/renderer/routes/Status.tsx`**

```typescript
import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { Session, Project, EngineStatus } from '@shared/types';
import type { TodayStats } from '@shared/ipc-contract';
import { Button } from '../ui/Button';
import { SessionRow } from '../ui/SessionRow';

function fmtMs(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const STATUS_LABEL: Record<EngineStatus, string> = {
  active: 'Capture: Active',
  paused: 'Capture: Paused',
  excluded: 'Capture: Excluded app active',
  stopped: 'Capture: Stopped',
};

export function Status() {
  const api = useRemirror();
  const [status, setStatus] = useState<EngineStatus>('stopped');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<TodayStats | null>(null);

  async function refresh() {
    const [s, p, t, st] = await Promise.all([
      api.recentSessions(20),
      api.listProjects(),
      api.todayStats(),
      api.getEngineStatus(),
    ]);
    setSessions(s);
    setProjects(p);
    setStats(t);
    setStatus(st);
  }

  useEffect(() => {
    refresh();
    const off1 = api.onSessionsChanged(refresh);
    const off2 = api.onEngineStatusChanged(setStatus);
    const interval = setInterval(refresh, 5000);
    return () => { off1(); off2(); clearInterval(interval); };
  }, [api]);

  return (
    <div className="min-h-full p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">{STATUS_LABEL[status]}</h1>
        <Button
          variant="ghost"
          onClick={() => status === 'paused' ? api.resumeCapture() : api.pauseCapture()}
        >
          {status === 'paused' ? 'Resume' : 'Pause'}
        </Button>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-surface rounded-lg p-4">
            <div className="text-muted text-sm">Sessions today</div>
            <div className="text-2xl font-semibold">{stats.totalSessions}</div>
          </div>
          <div className="bg-surface rounded-lg p-4">
            <div className="text-muted text-sm">Longest block</div>
            <div className="text-2xl font-semibold">{fmtMs(stats.longestBlockMs)}</div>
          </div>
          <div className="bg-surface rounded-lg p-4">
            <div className="text-muted text-sm">Top project</div>
            <div className="text-xl font-medium truncate">
              {stats.topProjects[0]?.label ?? '—'}
            </div>
            <div className="text-muted text-xs">
              {stats.topProjects[0] ? fmtMs(stats.topProjects[0].totalMs) : ''}
            </div>
          </div>
        </div>
      )}

      <h2 className="text-muted text-sm mb-2">Recent sessions</h2>
      <div className="space-y-2">
        {sessions.length === 0 && (
          <div className="text-muted text-sm p-4 bg-surface rounded-md">
            No sessions yet. Switch to another window — the engine records on focus change.
          </div>
        )}
        {sessions.map(s => (
          <SessionRow key={s.id} session={s} projects={projects} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run dev, verify the loop end-to-end**

Run: `npm run dev`
Expected:
- App opens onboarding on first run; complete it.
- Status view loads showing "Capture: Active".
- Switch between several windows; within a few seconds, new sessions appear in the list (auto-refreshed every 5s).
- Click "Set project ▾" on a session, choose a project, see it update.
- Click Pause → status flips to "Capture: Paused", tray icon menu also reflects this.
- Click Resume → "Capture: Active" returns.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/routes/Status.tsx src/renderer/ui/SessionRow.tsx
git commit -m "feat(renderer): status view + session row + reclassify popover"
```

---

## Phase J — Polish + acceptance + build

### Task 30: Wire "Settings…" to a tabbed view (Today / Projects / Exclusions)

The spec says Settings reuses the same Projects + Exclusions components from onboarding, mounted as tabs in the main window. Currently both "Open Remirror" and "Settings…" land on `/status`; this task makes them distinct.

**Files:**
- Modify: `src/main/tray.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/ipc-contract.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/routes/Status.tsx`

- [ ] **Step 1: Add the IPC channel and API method**

Edit `src/shared/ipc-contract.ts`. Add to the `IPC` object:

```typescript
NAVIGATE: 'navigate',
```

Add to the `RemirrorAPI` interface:

```typescript
onNavigate(cb: (route: 'status' | 'settings:projects' | 'settings:exclusions') => void): () => void;
```

- [ ] **Step 2: Wire the renderer listener in preload**

Edit `src/preload/index.ts`. Add to the `api` object:

```typescript
onNavigate: (cb) => {
  const handler = (_e: unknown, route: any) => cb(route);
  ipcRenderer.on(IPC.NAVIGATE, handler);
  return () => ipcRenderer.off(IPC.NAVIGATE, handler);
},
```

- [ ] **Step 3: Broadcast navigation from main on tray Settings click**

Edit `src/main/tray.ts`. Add an import at the top:

```typescript
import { BrowserWindow } from 'electron';
import { IPC } from '@shared/ipc-contract';
```

Update the menu's "Settings…" item:

```typescript
{ label: 'Settings…', click: () => {
    const win = openMainWindow();
    win.webContents.once('did-finish-load', () => {
      win.webContents.send(IPC.NAVIGATE, 'settings:projects');
    });
    // If already loaded, send immediately too.
    if (!win.webContents.isLoading()) {
      win.webContents.send(IPC.NAVIGATE, 'settings:projects');
    }
  }
},
```

- [ ] **Step 4: Make the renderer route on `onNavigate` events**

Edit `src/renderer/App.tsx`. Replace its body with:

```typescript
import React, { useEffect, useState } from 'react';
import { Onboarding } from './routes/Onboarding';
import { Status } from './routes/Status';
import { useRemirror } from './hooks/useRemirror';

type Route = 'loading' | 'onboarding' | 'status';
type Tab = 'today' | 'projects' | 'exclusions';

export function App() {
  const api = useRemirror();
  const [route, setRoute] = useState<Route>('loading');
  const [tab, setTab] = useState<Tab>('today');

  useEffect(() => {
    api.isOnboardingNeeded().then(needed => setRoute(needed ? 'onboarding' : 'status'));
    const off = api.onNavigate((r) => {
      if (r === 'settings:projects') setTab('projects');
      else if (r === 'settings:exclusions') setTab('exclusions');
      else setTab('today');
    });
    return off;
  }, [api]);

  if (route === 'loading') {
    return <div className="flex items-center justify-center h-full text-muted">Loading…</div>;
  }
  if (route === 'onboarding') {
    return <Onboarding onComplete={() => { api.completeOnboarding(); setRoute('status'); }} />;
  }
  return <Status tab={tab} onTabChange={setTab} />;
}
```

- [ ] **Step 5: Add a tab strip and tab-aware body to Status.tsx**

Edit `src/renderer/routes/Status.tsx`. Add the new props and imports, then refactor the render to switch on `tab`:

```typescript
import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { Session, Project, EngineStatus } from '@shared/types';
import type { TodayStats } from '@shared/ipc-contract';
import { Button } from '../ui/Button';
import { SessionRow } from '../ui/SessionRow';
import { ProjectEditor } from '../ui/ProjectEditor';
import { ExclusionEditor } from '../ui/ExclusionEditor';
import clsx from 'clsx';

type Tab = 'today' | 'projects' | 'exclusions';

interface Props {
  tab: Tab;
  onTabChange: (t: Tab) => void;
}

function fmtMs(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const STATUS_LABEL: Record<EngineStatus, string> = {
  active: 'Capture: Active',
  paused: 'Capture: Paused',
  excluded: 'Capture: Excluded app active',
  stopped: 'Capture: Stopped',
};

export function Status({ tab, onTabChange }: Props) {
  const api = useRemirror();
  const [status, setStatus] = useState<EngineStatus>('stopped');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<TodayStats | null>(null);

  async function refresh() {
    const [s, p, t, st] = await Promise.all([
      api.recentSessions(20),
      api.listProjects(),
      api.todayStats(),
      api.getEngineStatus(),
    ]);
    setSessions(s);
    setProjects(p);
    setStats(t);
    setStatus(st);
  }

  useEffect(() => {
    refresh();
    const off1 = api.onSessionsChanged(refresh);
    const off2 = api.onEngineStatusChanged(setStatus);
    const interval = setInterval(refresh, 5000);
    return () => { off1(); off2(); clearInterval(interval); };
  }, [api]);

  const tabBtn = (id: Tab, label: string) => (
    <button
      key={id}
      onClick={() => onTabChange(id)}
      className={clsx(
        'px-4 py-2 text-sm font-medium border-b-2 -mb-px',
        tab === id ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-full p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">{STATUS_LABEL[status]}</h1>
        <Button
          variant="ghost"
          onClick={() => status === 'paused' ? api.resumeCapture() : api.pauseCapture()}
        >
          {status === 'paused' ? 'Resume' : 'Pause'}
        </Button>
      </div>

      <div className="border-b border-surface mb-6 flex gap-1">
        {tabBtn('today', 'Today')}
        {tabBtn('projects', 'Projects')}
        {tabBtn('exclusions', 'Exclusions')}
      </div>

      {tab === 'today' && (
        <>
          {stats && (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-surface rounded-lg p-4">
                <div className="text-muted text-sm">Sessions today</div>
                <div className="text-2xl font-semibold">{stats.totalSessions}</div>
              </div>
              <div className="bg-surface rounded-lg p-4">
                <div className="text-muted text-sm">Longest block</div>
                <div className="text-2xl font-semibold">{fmtMs(stats.longestBlockMs)}</div>
              </div>
              <div className="bg-surface rounded-lg p-4">
                <div className="text-muted text-sm">Top project</div>
                <div className="text-xl font-medium truncate">
                  {stats.topProjects[0]?.label ?? '—'}
                </div>
                <div className="text-muted text-xs">
                  {stats.topProjects[0] ? fmtMs(stats.topProjects[0].totalMs) : ''}
                </div>
              </div>
            </div>
          )}

          <h2 className="text-muted text-sm mb-2">Recent sessions</h2>
          <div className="space-y-2">
            {sessions.length === 0 && (
              <div className="text-muted text-sm p-4 bg-surface rounded-md">
                No sessions yet. Switch to another window — the engine records on focus change.
              </div>
            )}
            {sessions.map(s => (
              <SessionRow key={s.id} session={s} projects={projects} />
            ))}
          </div>
        </>
      )}

      {tab === 'projects' && <ProjectEditor />}
      {tab === 'exclusions' && <ExclusionEditor />}
    </div>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npm run dev`
Expected:
- Right-click tray → "Settings…" → window opens (or focuses) and lands on the **Projects** tab.
- The "Today" / "Projects" / "Exclusions" tab strip is visible at the top of the status view.
- Switching tabs shows the right content. The pause/resume button stays visible across all tabs.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc-contract.ts src/preload/index.ts src/main/tray.ts src/main/ipc.ts src/renderer/App.tsx src/renderer/routes/Status.tsx
git commit -m "feat(renderer): tabbed Status view + tray Settings… routes to Projects tab"
```

---

### Task 31: Acceptance criteria walkthrough — record results in a checklist file

**Files:**
- Create: `docs/superpowers/acceptance/phase1-runlog.md`

- [ ] **Step 1: Create the runlog template**

```markdown
# Remirror Phase 1 — Acceptance Run Log

Spec: [`../specs/2026-05-23-remirror-phase1-design.md`](../specs/2026-05-23-remirror-phase1-design.md), Section 9.

Run date: `__________`
Build: `__________`

## Engine correctness
- [ ] 1. App starts, hides to tray, no taskbar entry.
- [ ] 2. Two window switches → exactly 2 new session rows.
- [ ] 3. Opening 1Password → 0 new rows; previous session closed at focus-change moment.
- [ ] 4. Idle 3 min → `paused_ms` grows; resumes cleanly.
- [ ] 5. Idle 15 min → session closed retroactively at idle-start.
- [ ] 6. Lock screen → session closed immediately.
- [ ] 7. Sleep → session closed immediately.
- [ ] 8. Hard kill + restart → orphan session closed.

## Classification
- [ ] 9. "Project A" + ["projecta", "client-work"] → matching title gets label, confidence=1.0.
- [ ] 10. No match → "unclassified", confidence=0.
- [ ] 11. Reclassify via "Set project ▾" → row updates, confidence=1.0.

## UX
- [ ] 12. Tray status reflects active/paused/excluded.
- [ ] 13. Hotkey Alt+Shift+R opens window; second press focuses (no second window).
- [ ] 14. First launch → onboarding; second launch → status.
- [ ] 15. Status counts + list refresh automatically.

## Resource budget
- [ ] 16. Idle CPU < 0.5% sustained (10 min sample).
- [ ] 17. Active CPU < 2% avg, < 5% peak.
- [ ] 18. Main RSS < 250 MB.
- [ ] 19. Disk writes idle: 0.
- [ ] 20. Disk writes active: < 10/min.

## Privacy & safety
- [ ] 21. DB at `%APPDATA%\Remirror\remirror.db`, opens in DB Browser.
- [ ] 22. `screenshots` table empty; no files in userData.
- [ ] 23. No outbound DNS to api.anthropic.com during normal use.
- [ ] 24. Exclusion check case-insensitive (verified with "Chase Bank Login - Google Chrome").

## Notes
```

- [ ] **Step 2: Commit the template**

```bash
git add docs/superpowers/acceptance/phase1-runlog.md
git commit -m "docs: Phase 1 acceptance runlog template"
```

- [ ] **Step 3: Walk through every criterion manually.** Use Task Manager / Resource Monitor for CPU and memory checks. Use Wireshark or Windows Resource Monitor's Network tab for outbound traffic. Use DB Browser for SQLite to inspect rows. Tick each box as it passes. If any fails, file a bug in the runlog Notes section and fix before declaring Phase 1 done.

---

### Task 32: README for the repo (customer-facing tone)

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# Remirror

An honest mirror for your attention.

Remirror is a Windows desktop app that silently records what you work on by passively observing window focus, window titles, cursor location, and idle state. All data stays on your machine — no cloud, no telemetry, no account.

Designed for ADHD work patterns: never asks you to log anything, never tells you that you "wasted time," and treats your data as something you reflect on, not something you're scored against.

## Status

Phase 1 — capture engine, exclusions, project keyword matching, minimal status UI.
Phases 2–5 (Claude-powered end-of-day classification, timeline UI, meeting integration, daily brief, weekly mirror) are on the roadmap.

## Running locally

Requirements: Node 20+, Windows 10/11.

```bash
npm install
npm run dev
```

The app runs in your system tray. Press `Alt+Shift+R` to open it.

## Building a Windows installer

```bash
npm run build:win
```

Output: `dist/Remirror-Setup-<version>.exe`.

## Data location

- Database: `%APPDATA%\Remirror\remirror.db`
- Logs: `%APPDATA%\Remirror\logs\main.log`

Uninstall removes the app; deleting that folder removes all Remirror data.

## Privacy

Remirror never makes network calls in Phase 1. Future phases that call the Anthropic API will use your own API key, provided via Settings.

## License

Proprietary. Not for redistribution.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: README"
```

---

### Task 33: Final type-check + test sweep + build

**Files:** (no new files)

- [ ] **Step 1: Type-check the whole project**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: all tests pass — classifier, exclusions, idle, sessions, db, migrate.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: `out/main`, `out/preload`, `out/renderer` populated, no errors.

- [ ] **Step 4: Smoke-test the production build by running the packaged main**

Run: `npx electron out/main/index.js`
Expected: same behavior as `npm run dev` but using the compiled bundles.

- [ ] **Step 5: Commit any minor fixes needed to clear type errors**

```bash
git add -A
git commit -m "chore: type-check + test sweep clean"
```

---

### Task 34: Tag v0.1.0 once the runlog is fully green

- [ ] **Step 1: Confirm all 24 acceptance criteria in `phase1-runlog.md` are checked.**

- [ ] **Step 2: Tag**

```bash
git tag -a v0.1.0 -m "Phase 1 — capture engine"
```

- [ ] **Step 3: Phase 1 is done.** Move on to designing Phase 2.

---

## Self-review notes

Quick check against spec Section 9 (acceptance criteria):

- Criteria 1, 8, 12–15: covered by Tasks 23, 27–29.
- Criteria 2, 9, 10, 11: directly exercised by classifier (Task 10), sessions (Task 13), and SessionRow (Task 29).
- Criteria 3, 24: exclusions handler (Task 11) + IPC route (Task 25).
- Criteria 4, 5: idle state machine (Task 12) + engine wiring (Task 17).
- Criteria 6, 7: lifecycle handlers (Task 18).
- Criteria 16–20: resource budget — verified manually in Task 31.
- Criteria 21–23: privacy — verified manually in Task 31. No network code exists.

No placeholders found in code blocks. No "TBD" left. Method names checked: `openMainWindow` is consistent across tray, hotkey, and App; `closeActive` and `closeActiveNow` are intentionally different (private internal vs. public lifecycle); `reloadProjects`/`reloadExclusions` are used by both `start()` (initial load) and IPC handlers (post-update reload).

One thing worth noting that the spec leaves slightly soft: the `ProjectEditor` placeholder-seeding logic mutates state inside render (Step 1 of Task 28). This works but is React-ugly. Acceptable for Phase 1; tighten in Phase 2 polish.
