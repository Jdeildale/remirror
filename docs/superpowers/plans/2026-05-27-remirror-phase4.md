# Remirror Phase 4 Implementation Plan — Daily Brief

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Daily Brief — a streamed, Claude-generated end-of-day Markdown reflection that turns Phase 2a's local data into prose, lives in a new Brief tab, stores past briefs by date, and emits a structured tail for Phase 5's weekly mirror to consume.

**Architecture:** Manual-only generation in v1 (per spec §2). User provides their own Anthropic API key (stored via Electron `safeStorage`). A streaming Anthropic SDK call returns Markdown that the renderer renders section-by-section as it arrives. After stream completion, output is regex-scanned for banned vocabulary; violations trigger automatic regeneration up to 3 attempts. User-visible regenerations are capped at 2 per day. Past briefs are date-keyed in a new `daily_briefs` table. The brief's structured JSON tail (day_shape, dominant fragmentation pattern, tomorrow's first 90 details) is parsed and stored as a separate column for Phase 5.

**Tech Stack:** Electron 32 · TypeScript · better-sqlite3 · React 18 + Tailwind · `@anthropic-ai/sdk` (existing dep) · safeStorage · vitest

**Spec:** [`docs/superpowers/specs/2026-05-27-remirror-phase4-daily-brief-design.md`](../specs/2026-05-27-remirror-phase4-daily-brief-design.md)
**Operating frame:** [`docs/superpowers/specs/CRYSTALLIZED-CONTEXT-adhd-design-frame.md`](../specs/CRYSTALLIZED-CONTEXT-adhd-design-frame.md)

---

## File map

```
remirror/
├─ src/
│  ├─ main/
│  │  ├─ db/migrations/
│  │  │  └─ 006_daily_briefs.sql                      # task 1
│  │  ├─ anthropic/
│  │  │  ├─ models.ts                                 # task 2: MODEL_IDS + types
│  │  │  ├─ key.ts                                    # task 3: safeStorage-encrypted key
│  │  │  ├─ client.ts                                 # task 14: SDK wrapper + test-connection
│  │  │  └─ stream.ts                                 # task 15: streaming caller
│  │  ├─ copy/
│  │  │  └─ banned-vocab.ts                           # task 4: shared list + scanFor()
│  │  ├─ brief/
│  │  │  ├─ assemble-payload.ts                       # task 7 (TDD)
│  │  │  ├─ parse-markdown.ts                         # task 8 (TDD)
│  │  │  ├─ parse-tail.ts                             # task 9 (TDD)
│  │  │  ├─ prompts/v1.ts                             # task 10
│  │  │  ├─ regen-policy.ts                           # task 12 (TDD)
│  │  │  ├─ gate.ts                                   # task 13 (TDD)
│  │  │  ├─ repo.ts                                   # task 6 (TDD)
│  │  │  └─ generate.ts                               # task 16: orchestrator
│  │  ├─ store.ts                                     # modify — task 11
│  │  └─ ipc.ts                                       # modify — task 18
│  ├─ shared/
│  │  ├─ types.ts                                     # modify — task 17
│  │  └─ ipc-contract.ts                              # modify — task 17
│  ├─ preload/
│  │  └─ index.ts                                     # modify — task 19
│  └─ renderer/
│     ├─ ui/
│     │  ├─ markdown.tsx                              # task 20
│     │  ├─ BriefCard.tsx                             # task 21
│     │  ├─ PastBriefRow.tsx                          # task 22
│     │  ├─ BriefEmptyStates.tsx                      # task 23
│     │  └─ AnthropicApiCard.tsx                      # task 24
│     ├─ routes/
│     │  ├─ Brief.tsx                                 # task 25
│     │  └─ Status.tsx                                # modify — task 26
│     └─ ui/WorkHoursEditor.tsx                       # modify — task 27
├─ tests/
│  ├─ brief/
│  │  ├─ repo.test.ts                                 # task 6
│  │  ├─ assemble-payload.test.ts                     # task 7
│  │  ├─ parse-markdown.test.ts                       # task 8
│  │  ├─ parse-tail.test.ts                           # task 9
│  │  ├─ regen-policy.test.ts                         # task 12
│  │  └─ gate.test.ts                                 # task 13
│  └─ copy/
│     └─ banned-vocab.test.ts                         # modify — task 28
└─ package.json                                       # modify — task 5
```

---

## Phase A — Foundation

### Task 1: Migration `006_daily_briefs.sql`

**Files:**
- Create: `src/main/db/migrations/006_daily_briefs.sql`

- [ ] **Step 1: Create the migration file**

```sql
CREATE TABLE daily_briefs (
  date TEXT PRIMARY KEY,
  generated_at INTEGER NOT NULL,
  generation_count INTEGER NOT NULL DEFAULT 1,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  headline TEXT NOT NULL,
  story TEXT NOT NULL,
  what_held TEXT NOT NULL,
  what_fragmented TEXT NOT NULL,
  tomorrow_first_90 TEXT NOT NULL,
  raw_markdown TEXT NOT NULL,
  structured_tail TEXT
);
CREATE INDEX idx_daily_briefs_generated_at ON daily_briefs(generated_at DESC);
```

- [ ] **Step 2: Verify migration applies cleanly**

Run: `npm test -- tests/db.test.ts`
Expected: existing DB tests pass; `006_daily_briefs.sql` is picked up by the copy-migrations Vite plugin and applied in the alphanumeric order.

- [ ] **Step 3: Commit**

```bash
git add src/main/db/migrations/006_daily_briefs.sql
git commit -m "feat(db): add daily_briefs table for Phase 4"
```

---

### Task 2: Anthropic model identifiers constant

**Files:**
- Create: `src/main/anthropic/models.ts`

- [ ] **Step 1: Look up current Anthropic model IDs**

Check https://docs.anthropic.com/en/docs/about-claude/models for the **current** model identifiers. As of 2026 the Sonnet 4.5 / Haiku 4.5 / Opus 4.5 family is in use. Use the published string identifiers — if the docs show snapshot pins like `claude-sonnet-4-5-YYYYMMDD`, prefer those over aliases for stability.

- [ ] **Step 2: Create `src/main/anthropic/models.ts`**

```typescript
// Anthropic model identifiers. Looked up from https://docs.anthropic.com/en/docs/about-claude/models
// at implementation time. Update when Anthropic publishes new generations.

export const MODEL_IDS = {
  sonnet: 'claude-sonnet-4-5',
  haiku: 'claude-haiku-4-5',
  opus: 'claude-opus-4-5',
} as const;

export type ModelKey = keyof typeof MODEL_IDS;
export type ModelId = typeof MODEL_IDS[ModelKey];

export const MODEL_LABELS: Record<ModelKey, string> = {
  sonnet: 'Sonnet 4.5',
  haiku: 'Haiku 4.5 — faster, cheaper',
  opus: 'Opus 4.5 — slowest, smartest',
};

// Static cost estimates per typical brief (5k in, 600 out). USD.
export const MODEL_COST_ESTIMATE_USD: Record<ModelKey, number> = {
  haiku: 0.005,
  sonnet: 0.025,
  opus: 0.10,
};

export function modelKeyFromId(id: string): ModelKey | null {
  const found = (Object.entries(MODEL_IDS) as Array<[ModelKey, string]>).find(([, v]) => v === id);
  return found ? found[0] : null;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/main/anthropic/models.ts
git commit -m "feat(anthropic): MODEL_IDS + labels + cost estimates"
```

---

### Task 3: Anthropic API key — safeStorage wrapper

**Files:**
- Create: `src/main/anthropic/key.ts`

- [ ] **Step 1: Create `src/main/anthropic/key.ts`**

```typescript
import { safeStorage } from 'electron';
import { store } from '../store';
import log from '../log';

/**
 * Reads the stored Anthropic API key, decrypted via safeStorage if available.
 * Returns null when no key is stored.
 */
export function readAnthropicKey(): string | null {
  const stored = store.get('anthropic').apiKey;
  if (!stored) return null;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    }
    return stored;
  } catch (err) {
    log.warn('Failed to decrypt Anthropic API key; treating as missing', err);
    return null;
  }
}

export function writeAnthropicKey(plaintext: string): void {
  const trimmed = plaintext.trim();
  if (!trimmed) {
    clearAnthropicKey();
    return;
  }
  const current = store.get('anthropic');
  let toStore: string;
  if (safeStorage.isEncryptionAvailable()) {
    toStore = safeStorage.encryptString(trimmed).toString('base64');
  } else {
    toStore = trimmed;
  }
  store.set('anthropic', { ...current, apiKey: toStore });
  log.info('Anthropic API key stored');
}

export function clearAnthropicKey(): void {
  const current = store.get('anthropic');
  store.set('anthropic', { ...current, apiKey: undefined });
  log.info('Anthropic API key cleared');
}

export function hasAnthropicKey(): boolean {
  return readAnthropicKey() !== null;
}
```

- [ ] **Step 2: Typecheck (will fail until Task 11 adds `anthropic` to Prefs)**

Skip typecheck for now — Task 11 introduces `anthropic` in `store.ts`. We'll see it pass after Task 11 lands.

- [ ] **Step 3: Commit**

```bash
git add src/main/anthropic/key.ts
git commit -m "feat(anthropic): safeStorage-encrypted key reader/writer"
```

---

### Task 4: Shared banned-vocab module

The Phase 2a banned-vocab test hard-codes its list inline. Phase 4 needs to share the same canonical list between (a) the existing renderer-scan test and (b) the new Phase 4 post-stream gate. Extract to a shared module.

**Files:**
- Create: `src/main/copy/banned-vocab.ts`
- Modify: `tests/copy/banned-vocab.test.ts`

- [ ] **Step 1: Create `src/main/copy/banned-vocab.ts`**

```typescript
// Single source of truth for the banned vocabulary from
// docs/superpowers/specs/CRYSTALLIZED-CONTEXT-adhd-design-frame.md.
// Used by Phase 2a's renderer linter test AND by Phase 4's post-generation gate.

export const BANNED_VOCABULARY: ReadonlyArray<string> = [
  'should',
  'failed',
  'missed',
  'wasted',
  'drifted',
  'off-track',
  'skipped',
  'behind',
  'slipping',
  'broken streak',
  'lost focus',
  'gave up',
  'fell off',
  'neglected',
  'ignored',
];

export interface BannedVocabHit {
  word: string;
  matchedText: string;
  index: number;
}

/**
 * Scans the input text for any banned word (case-insensitive, word boundaries).
 * Returns all hits. Empty array when clean.
 */
export function scanForBannedVocabulary(text: string): BannedVocabHit[] {
  const hits: BannedVocabHit[] = [];
  const lower = text.toLowerCase();
  for (const w of BANNED_VOCABULARY) {
    const escaped = w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower)) !== null) {
      hits.push({ word: w, matchedText: text.slice(m.index, m.index + m[0].length), index: m.index });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}
```

- [ ] **Step 2: Modify `tests/copy/banned-vocab.test.ts` to use the shared module**

Read the current file first to preserve its structure. Replace the inline `BANNED` array with an import:

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANNED_VOCABULARY } from '@main/copy/banned-vocab';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererDir = path.resolve(__dirname, '../../src/renderer');

function walk(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some(e => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

describe('banned vocabulary in user-facing copy', () => {
  it('no banned word appears in any renderer .tsx file', () => {
    const files = walk(rendererDir, ['.tsx']);
    const violations: { file: string; word: string; line: number; text: string }[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('import') || trimmed.startsWith('*')) return;
        const lower = line.toLowerCase();
        for (const w of BANNED_VOCABULARY) {
          const escaped = w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
          const re = new RegExp(`\\b${escaped}\\b`, 'i');
          if (re.test(lower)) {
            violations.push({ file: path.relative(rendererDir, file), word: w, line: i + 1, text: line.trim() });
          }
        }
      });
    }
    if (violations.length > 0) {
      const summary = violations.map(v => `${v.file}:${v.line} → "${v.word}" in: ${v.text}`).join('\n');
      throw new Error(`Banned vocabulary found in renderer copy:\n${summary}`);
    }
    expect(violations.length).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests — expect PASS**

Run: `npm test -- tests/copy/banned-vocab.test.ts`
Expected: 1 pass (same as before, just sourced from the shared module).

- [ ] **Step 4: Commit**

```bash
git add src/main/copy/banned-vocab.ts tests/copy/banned-vocab.test.ts
git commit -m "refactor(copy): share banned-vocab list between linter test and Phase 4 gate"
```

---

### Task 5: Add `@anthropic-ai/sdk` dependency

The `package.json` already lists `@anthropic-ai/sdk@^0.98.0`. Verify and bump if needed for the streaming features Phase 4 uses.

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Check current version**

Run: `npm ls @anthropic-ai/sdk`
If the version is at least 0.98.0, the SDK already supports the streaming and tool-use features Phase 4 uses. No bump needed.

- [ ] **Step 2: If a bump is needed**

```bash
npm install @anthropic-ai/sdk@latest
npm run rebuild:electron
```

- [ ] **Step 3: Verify install**

```bash
npm test
```
Expected: prior 85/85 tests still pass.

- [ ] **Step 4: Commit (only if package.json/package-lock.json changed)**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): ensure @anthropic-ai/sdk supports streaming for Phase 4"
```

---

## Phase B — Brief generation core (TDD)

### Task 6: `BriefRepo` (TDD)

**Files:**
- Create: `src/main/brief/repo.ts`
- Create: `tests/brief/repo.test.ts`

- [ ] **Step 1: Write failing tests** — `tests/brief/repo.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import { BriefRepo } from '@main/brief/repo';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../src/main/db/migrations');

let db: Database.Database;
let repo: BriefRepo;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrationsDir);
  repo = new BriefRepo(db);
});

afterEach(() => db.close());

function sampleBrief(date: string, overrides: Partial<{ generationCount: number; headline: string }> = {}) {
  return {
    date,
    generatedAt: 1748390123000,
    generationCount: overrides.generationCount ?? 1,
    model: 'claude-sonnet-4-5',
    promptVersion: 'v1.0',
    inputTokens: 4231,
    outputTokens: 412,
    headline: overrides.headline ?? 'sample headline',
    story: 'sample story',
    whatHeld: 'sample held',
    whatFragmented: 'sample fragmented',
    tomorrowFirst90: 'sample tomorrow',
    rawMarkdown: '## headline\n...',
    structuredTail: null,
  };
}

describe('BriefRepo', () => {
  it('inserts a brief and reads it back by date', () => {
    repo.upsert(sampleBrief('2026-05-27'));
    const got = repo.findByDate('2026-05-27');
    expect(got).not.toBeNull();
    expect(got!.headline).toBe('sample headline');
    expect(got!.generationCount).toBe(1);
  });

  it('returns null for a date with no brief', () => {
    expect(repo.findByDate('2026-05-27')).toBeNull();
  });

  it('upsert replaces an existing brief on the same date and bumps generation_count', () => {
    repo.upsert(sampleBrief('2026-05-27', { headline: 'first' }));
    repo.upsert(sampleBrief('2026-05-27', { headline: 'second', generationCount: 2 }));
    const got = repo.findByDate('2026-05-27');
    expect(got!.headline).toBe('second');
    expect(got!.generationCount).toBe(2);
  });

  it('listPast returns briefs newest-first', () => {
    repo.upsert(sampleBrief('2026-05-25'));
    repo.upsert(sampleBrief('2026-05-27'));
    repo.upsert(sampleBrief('2026-05-26'));
    const list = repo.listPast(10);
    expect(list.map(b => b.date)).toEqual(['2026-05-27', '2026-05-26', '2026-05-25']);
  });

  it('listPast respects the limit', () => {
    for (let i = 1; i <= 5; i++) {
      repo.upsert(sampleBrief(`2026-05-2${i}`));
    }
    expect(repo.listPast(2).length).toBe(2);
  });

  it('round-trips a parsed structured tail when present', () => {
    repo.upsert({
      ...sampleBrief('2026-05-27'),
      structuredTail: { dayShape: 'diffuse', dominantFragmentationPattern: 'morning_drift', tomorrowFirst90: { startLocal: '09:00', target: 'Oracle', supportingEventId: null, competingEventId: null } },
    });
    const got = repo.findByDate('2026-05-27');
    expect(got!.structuredTail).toEqual({
      dayShape: 'diffuse',
      dominantFragmentationPattern: 'morning_drift',
      tomorrowFirst90: { startLocal: '09:00', target: 'Oracle', supportingEventId: null, competingEventId: null },
    });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- tests/brief/repo.test.ts`
Expected: module not found.

- [ ] **Step 3: Implement** — `src/main/brief/repo.ts`

```typescript
import type Database from 'better-sqlite3';
import type { DailyBriefDTO, StructuredTail } from '@shared/types';

export class BriefRepo {
  constructor(private db: Database.Database) {}

  upsert(b: DailyBriefDTO): void {
    this.db.prepare(`
      INSERT INTO daily_briefs (
        date, generated_at, generation_count, model, prompt_version,
        input_tokens, output_tokens, headline, story, what_held,
        what_fragmented, tomorrow_first_90, raw_markdown, structured_tail
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        generated_at=excluded.generated_at,
        generation_count=excluded.generation_count,
        model=excluded.model,
        prompt_version=excluded.prompt_version,
        input_tokens=excluded.input_tokens,
        output_tokens=excluded.output_tokens,
        headline=excluded.headline,
        story=excluded.story,
        what_held=excluded.what_held,
        what_fragmented=excluded.what_fragmented,
        tomorrow_first_90=excluded.tomorrow_first_90,
        raw_markdown=excluded.raw_markdown,
        structured_tail=excluded.structured_tail
    `).run(
      b.date, b.generatedAt, b.generationCount, b.model, b.promptVersion,
      b.inputTokens, b.outputTokens, b.headline, b.story, b.whatHeld,
      b.whatFragmented, b.tomorrowFirst90, b.rawMarkdown,
      b.structuredTail ? JSON.stringify(b.structuredTail) : null,
    );
  }

  findByDate(date: string): DailyBriefDTO | null {
    const row = this.db.prepare('SELECT * FROM daily_briefs WHERE date = ?').get(date) as Record<string, unknown> | undefined;
    if (!row) return null;
    return rowToDTO(row);
  }

  listPast(limit: number): DailyBriefDTO[] {
    const rows = this.db.prepare('SELECT * FROM daily_briefs ORDER BY date DESC LIMIT ?').all(limit) as Array<Record<string, unknown>>;
    return rows.map(rowToDTO);
  }

  bumpGenerationCount(date: string): void {
    this.db.prepare('UPDATE daily_briefs SET generation_count = generation_count + 1 WHERE date = ?').run(date);
  }
}

function rowToDTO(r: Record<string, unknown>): DailyBriefDTO {
  let tail: StructuredTail | null = null;
  if (typeof r.structured_tail === 'string' && r.structured_tail.length > 0) {
    try { tail = JSON.parse(r.structured_tail) as StructuredTail; } catch { tail = null; }
  }
  return {
    date: r.date as string,
    generatedAt: r.generated_at as number,
    generationCount: r.generation_count as number,
    model: r.model as string,
    promptVersion: r.prompt_version as string,
    inputTokens: r.input_tokens as number,
    outputTokens: r.output_tokens as number,
    headline: r.headline as string,
    story: r.story as string,
    whatHeld: r.what_held as string,
    whatFragmented: r.what_fragmented as string,
    tomorrowFirst90: r.tomorrow_first_90 as string,
    rawMarkdown: r.raw_markdown as string,
    structuredTail: tail,
  };
}
```

This file imports `DailyBriefDTO` and `StructuredTail` from `@shared/types`. Those types land in Task 17 — typecheck will fail until then. Tests still run because vitest uses the source files directly.

- [ ] **Step 4: Run tests — expect PASS (6/6)**

Run: `npm test -- tests/brief/repo.test.ts`
Expected: 6 passed. (TypeScript types from `@shared/types` resolve at test-time via the path alias even before the DTO is exported, because vitest's TS execution is non-strict for runtime tests — but if the test fails to find the import, hold this commit until after Task 17 and re-run.)

If tests fail because `DailyBriefDTO` / `StructuredTail` aren't exported yet, temporarily inline minimal types at the top of `repo.ts`:

```typescript
// TEMPORARY — moved to @shared/types in Task 17
type StructuredTail = {
  dayShape: 'diffuse' | 'anchored' | 'fragmented_bursts' | 'stretched_focus' | 'rest';
  dominantFragmentationPattern: 'morning_drift' | 'afternoon_slip' | 'calendar_collision' | 'context_thrash' | 'none';
  tomorrowFirst90: { startLocal: string; target: string; supportingEventId: string | null; competingEventId: string | null };
};
type DailyBriefDTO = {
  date: string; generatedAt: number; generationCount: number; model: string; promptVersion: string;
  inputTokens: number; outputTokens: number; headline: string; story: string; whatHeld: string;
  whatFragmented: string; tomorrowFirst90: string; rawMarkdown: string; structuredTail: StructuredTail | null;
};
```

…then remove this block in Task 17 once the shared types land.

- [ ] **Step 5: Commit**

```bash
git add src/main/brief/repo.ts tests/brief/repo.test.ts
git commit -m "feat(brief): BriefRepo (TDD)"
```

---

### Task 7: Assemble payload (TDD)

The function that turns local data into the JSON payload sent to Claude.

**Files:**
- Create: `src/main/brief/assemble-payload.ts`
- Create: `tests/brief/assemble-payload.test.ts`

- [ ] **Step 1: Write failing tests** — `tests/brief/assemble-payload.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import { SessionRepo } from '@main/capture/sessions';
import { assembleBriefPayload } from '@main/brief/assemble-payload';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../src/main/db/migrations');

let db: Database.Database;
let sessions: SessionRepo;

const MIN = 60_000;
const HOUR = 60 * MIN;

function dayStart(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrationsDir);
  sessions = new SessionRepo(db);
});

afterEach(() => db.close());

describe('assembleBriefPayload', () => {
  it('produces a payload with date, stats, breakdown for empty day', () => {
    const now = new Date();
    const payload = assembleBriefPayload(db, now, {
      workHours: { enabled: true, start: '09:00', end: '17:00', weekendsActive: false },
      goal: null,
    });
    expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(payload.stats.focusBlocksCount).toBe(0);
    expect(payload.projectBreakdown).toEqual([]);
    expect(payload.calendarEvents).toEqual([]);
    expect(payload.goal).toBeNull();
    expect(payload.focusBlocksDetailed).toEqual([]);
  });

  it('includes focus blocks ≥ 20m with start time + project label', () => {
    const now = new Date();
    const start = dayStart(now);
    const id = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id, start + HOUR + 25 * MIN);

    const payload = assembleBriefPayload(db, now, {
      workHours: { enabled: true, start: '09:00', end: '17:00', weekendsActive: false },
      goal: null,
    });
    expect(payload.focusBlocksDetailed.length).toBe(1);
    expect(payload.focusBlocksDetailed[0].projectLabel).toBe('Oracle');
    expect(payload.focusBlocksDetailed[0].durationMs).toBe(25 * MIN);
    expect(payload.focusBlocksDetailed[0].startTime).toBe(start + HOUR);
  });

  it('limits projectBreakdown to top 5 by totalMs', () => {
    const now = new Date();
    const start = dayStart(now);
    const labels = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    labels.forEach((label, i) => {
      const id = sessions.open({ startTime: start + (i + 1) * HOUR, appName: 'x', windowTitle: 't', displayId: 0, projectLabel: label, confidence: 1 });
      sessions.close(id, start + (i + 1) * HOUR + (7 - i) * 10 * MIN); // A=70m, B=60m, …, G=10m
    });
    const payload = assembleBriefPayload(db, now, {
      workHours: { enabled: true, start: '09:00', end: '17:00', weekendsActive: false },
      goal: null,
    });
    expect(payload.projectBreakdown.length).toBe(5);
    expect(payload.projectBreakdown[0].label).toBe('A');
    expect(payload.projectBreakdown.at(-1)!.label).toBe('E');
  });

  it('passes through goal and computes goalProgressMsThisWeek', () => {
    const now = new Date();
    const start = dayStart(now);
    const id = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id, start + HOUR + 25 * MIN);

    const payload = assembleBriefPayload(db, now, {
      workHours: { enabled: true, start: '09:00', end: '17:00', weekendsActive: false },
      goal: { text: 'Ship the Oracle dashboard', projectLabel: 'Oracle', setAt: Date.now() },
    });
    expect(payload.goal).not.toBeNull();
    expect(payload.goal!.text).toBe('Ship the Oracle dashboard');
    expect(payload.goalProgressMsThisWeek).toBe(25 * MIN);
  });

  it('passes calendar events with adherence status into payload', () => {
    // Insert a calendar event manually
    db.prepare(`
      INSERT INTO calendar_events (id, date, start_time, end_time, title, description, attendees_count, is_all_day, declined, project_label, source, raw_json, fetched_at)
      VALUES (?, ?, ?, ?, ?, '', 0, 0, 0, ?, 'google', '{}', ?)
    `).run('e1', dateLocal(new Date()), Date.now() - 3 * HOUR, Date.now() - 2 * HOUR, 'Standup', 'Oracle', Date.now());

    const payload = assembleBriefPayload(db, new Date(), {
      workHours: { enabled: true, start: '09:00', end: '17:00', weekendsActive: false },
      goal: null,
    });
    expect(payload.calendarEvents.length).toBe(1);
    expect(payload.calendarEvents[0].title).toBe('Standup');
    expect(payload.calendarEvents[0].projectLabel).toBe('Oracle');
    expect(['kept', 'partial', 'did-not-start']).toContain(payload.calendarEvents[0].status);
  });
});

function dateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
```

- [ ] **Step 2: Run tests — expect FAIL** (module not found)

Run: `npm test -- tests/brief/assemble-payload.test.ts`

- [ ] **Step 3: Implement** — `src/main/brief/assemble-payload.ts`

```typescript
import type Database from 'better-sqlite3';
import { computeDailyStats } from '../stats/daily-stats';
import { computeProjectBreakdown } from '../stats/daily-stats';
import { CalendarRepo } from '../calendar/repo';
import { computeAdherence } from '../calendar/adherence';
import type { DailyStatsDTO, WeeklyGoalDTO } from '@shared/types';

const SEVEN_DAYS_MS = 7 * 24 * 3_600_000;
const FOCUS_BLOCK_MS = 20 * 60_000;

interface AssembleInput {
  workHours: { enabled: boolean; start: string; end: string; weekendsActive: boolean };
  goal: WeeklyGoalDTO | null;
}

export interface BriefInputPayload {
  date: string;
  workHours: AssembleInput['workHours'];
  stats: DailyStatsDTO;
  projectBreakdown: Array<{ label: string; totalMs: number; returnCount: number }>;
  calendarEvents: Array<{
    id: string;
    title: string;
    startTimeMs: number;
    endTimeMs: number;
    projectLabel: string | null;
    status: 'kept' | 'partial' | 'did-not-start';
    overlapMs: number;
  }>;
  goal: WeeklyGoalDTO | null;
  goalProgressMsThisWeek: number;
  focusBlocksDetailed: Array<{ projectLabel: string; durationMs: number; startTime: number }>;
  longestBlock: DailyStatsDTO['longestBlock'];
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function assembleBriefPayload(db: Database.Database, now: Date, input: AssembleInput): BriefInputPayload {
  const date = isoDate(now);
  const dayStart = new Date(now); dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + 24 * 3_600_000 - 1;

  const stats = computeDailyStats(db, now);
  const projectBreakdown = computeProjectBreakdown(db, now).slice(0, 5);

  // Sessions for adherence computation
  const sessionsToday = db.prepare(`
    SELECT id, start_time, end_time, paused_ms, project_label, kind
    FROM sessions
    WHERE start_time >= ? AND start_time <= ? AND end_time IS NOT NULL
  `).all(dayStartMs, dayEndMs) as Array<{
    id: string; start_time: number; end_time: number; paused_ms: number; project_label: string | null; kind: string;
  }>;

  // Calendar events with adherence per event
  const calRepo = new CalendarRepo(db);
  const calEvents = calRepo.findByDate(date).map(e => {
    const adherence = computeAdherence({
      event: { startMs: e.startTimeMs, endMs: e.endTimeMs, projectLabel: e.projectLabel },
      sessions: sessionsToday.map(s => ({ startMs: s.start_time, endMs: s.end_time, projectLabel: s.project_label ?? 'unclassified' })),
    });
    return {
      id: e.id,
      title: e.title,
      startTimeMs: e.startTimeMs,
      endTimeMs: e.endTimeMs,
      projectLabel: e.projectLabel,
      status: adherence.status,
      overlapMs: adherence.overlapMs,
    };
  });

  // Focus blocks ≥ 20m (effective duration), kind='work'
  const focusBlocksDetailed = sessionsToday
    .filter(s => s.kind === 'work')
    .map(s => {
      const effective = Math.max(0, s.end_time - s.start_time - s.paused_ms);
      return { sessionId: s.id, projectLabel: s.project_label ?? 'unclassified', durationMs: effective, startTime: s.start_time };
    })
    .filter(b => b.durationMs >= FOCUS_BLOCK_MS)
    .map(({ sessionId: _id, ...rest }) => rest);

  // Goal progress this week: sum effective work-kind sessions matching goal.projectLabel over last 7 days
  let goalProgressMsThisWeek = 0;
  if (input.goal && input.goal.projectLabel) {
    const weekStartMs = Date.now() - SEVEN_DAYS_MS;
    const rows = db.prepare(`
      SELECT start_time, end_time, paused_ms
      FROM sessions
      WHERE end_time IS NOT NULL AND kind = 'work' AND project_label = ? AND start_time >= ?
    `).all(input.goal.projectLabel, weekStartMs) as Array<{ start_time: number; end_time: number; paused_ms: number }>;
    goalProgressMsThisWeek = rows.reduce((acc, r) => acc + Math.max(0, r.end_time - r.start_time - r.paused_ms), 0);
  }

  return {
    date,
    workHours: input.workHours,
    stats,
    projectBreakdown,
    calendarEvents: calEvents,
    goal: input.goal,
    goalProgressMsThisWeek,
    focusBlocksDetailed,
    longestBlock: stats.longestBlock,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS (5/5)**

Run: `npm test -- tests/brief/assemble-payload.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/main/brief/assemble-payload.ts tests/brief/assemble-payload.test.ts
git commit -m "feat(brief): assembleBriefPayload (TDD)"
```

---

### Task 8: Parse Markdown sections (TDD)

**Files:**
- Create: `src/main/brief/parse-markdown.ts`
- Create: `tests/brief/parse-markdown.test.ts`

- [ ] **Step 1: Write failing tests** — `tests/brief/parse-markdown.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { parseBriefMarkdown } from '@main/brief/parse-markdown';

describe('parseBriefMarkdown', () => {
  it('parses five sections by ## headings', () => {
    const md = `## Truth headline
3 hours focused. 1 hour elsewhere. Longest: 47 min on Oracle at 5:38pm.

## Today's story
Some story content
across two paragraphs.

Another paragraph.

## What held
The Oracle attempt held.

## What fragmented
Inbox in 6-minute windows.

## Tomorrow's first 90
9:00-10:30 on the Oracle dashboard.
`;
    const result = parseBriefMarkdown(md);
    expect(result.ok).toBe(true);
    expect(result.sections!.headline).toContain('3 hours focused');
    expect(result.sections!.story).toContain('Some story content');
    expect(result.sections!.story).toContain('Another paragraph');
    expect(result.sections!.whatHeld).toContain('Oracle attempt held');
    expect(result.sections!.whatFragmented).toContain('6-minute windows');
    expect(result.sections!.tomorrowFirst90).toContain('9:00-10:30');
  });

  it('reports missing sections', () => {
    const md = `## Truth headline\nfoo\n\n## Today's story\nbar`;
    const result = parseBriefMarkdown(md);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['what_held', 'what_fragmented', 'tomorrow_first_90']);
  });

  it('reports empty section bodies', () => {
    const md = `## Truth headline\nfoo\n\n## Today's story\n\n## What held\nh\n\n## What fragmented\nf\n\n## Tomorrow's first 90\nt`;
    const result = parseBriefMarkdown(md);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('story');
  });

  it('strips trailing structured-tail JSON block before splitting sections', () => {
    const md = `## Truth headline
foo

## Today's story
bar

## What held
h

## What fragmented
f

## Tomorrow's first 90
t

\`\`\`json
{"day_shape":"diffuse"}
\`\`\``;
    const result = parseBriefMarkdown(md);
    expect(result.ok).toBe(true);
    expect(result.sections!.tomorrowFirst90.trim()).toBe('t');
  });

  it('is case-insensitive on heading text but preserves body case', () => {
    const md = `## TRUTH HEADLINE\nFoo Bar\n\n## TODAY'S STORY\nThe Story\n\n## WHAT HELD\nh\n\n## WHAT FRAGMENTED\nf\n\n## TOMORROW'S FIRST 90\nt`;
    const result = parseBriefMarkdown(md);
    expect(result.ok).toBe(true);
    expect(result.sections!.headline).toContain('Foo Bar');
    expect(result.sections!.story).toContain('The Story');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- tests/brief/parse-markdown.test.ts`

- [ ] **Step 3: Implement** — `src/main/brief/parse-markdown.ts`

```typescript
export interface ParsedSections {
  headline: string;
  story: string;
  whatHeld: string;
  whatFragmented: string;
  tomorrowFirst90: string;
}

export type SectionKey = keyof ParsedSections;

const HEADING_PATTERNS: Array<{ key: SectionKey; pattern: RegExp }> = [
  { key: 'headline',         pattern: /^##\s*truth\s+headline\s*$/im },
  { key: 'story',            pattern: /^##\s*today'?s?\s+story\s*$/im },
  { key: 'whatHeld',         pattern: /^##\s*what\s+held\s*$/im },
  { key: 'whatFragmented',   pattern: /^##\s*what\s+fragmented\s*$/im },
  { key: 'tomorrowFirst90',  pattern: /^##\s*tomorrow'?s?\s+first\s+90\s*$/im },
];

export interface ParseResult {
  ok: boolean;
  sections?: ParsedSections;
  missing?: Array<'headline' | 'story' | 'what_held' | 'what_fragmented' | 'tomorrow_first_90'>;
}

export function parseBriefMarkdown(markdown: string): ParseResult {
  // Strip trailing ```json …``` block (structured tail) so it doesn't pollute the last section's body.
  const stripped = markdown.replace(/```json[\s\S]*?```\s*$/m, '').trimEnd();

  // For each section, locate its heading position; the body is everything between
  // that heading line and the next heading line (or end-of-document).
  const lines = stripped.split('\n');
  const headingLineIndices: Array<{ key: SectionKey; lineIndex: number }> = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { key, pattern } of HEADING_PATTERNS) {
      if (pattern.test(line)) {
        headingLineIndices.push({ key, lineIndex: i });
      }
    }
  }

  const sections: Partial<Record<SectionKey, string>> = {};
  for (let i = 0; i < headingLineIndices.length; i++) {
    const cur = headingLineIndices[i];
    const next = headingLineIndices[i + 1];
    const body = lines.slice(cur.lineIndex + 1, next ? next.lineIndex : lines.length).join('\n').trim();
    if (body.length > 0) {
      sections[cur.key] = body;
    }
  }

  const missingKeys: Array<'headline' | 'story' | 'what_held' | 'what_fragmented' | 'tomorrow_first_90'> = [];
  const camelToSnake: Record<SectionKey, 'headline' | 'story' | 'what_held' | 'what_fragmented' | 'tomorrow_first_90'> = {
    headline: 'headline', story: 'story', whatHeld: 'what_held', whatFragmented: 'what_fragmented', tomorrowFirst90: 'tomorrow_first_90',
  };
  for (const key of ['headline', 'story', 'whatHeld', 'whatFragmented', 'tomorrowFirst90'] as const) {
    if (!sections[key]) missingKeys.push(camelToSnake[key]);
  }

  if (missingKeys.length > 0) {
    return { ok: false, missing: missingKeys };
  }

  return { ok: true, sections: sections as ParsedSections };
}
```

- [ ] **Step 4: Run tests — expect PASS (5/5)**

Run: `npm test -- tests/brief/parse-markdown.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/main/brief/parse-markdown.ts tests/brief/parse-markdown.test.ts
git commit -m "feat(brief): parseBriefMarkdown — split five sections by heading"
```

---

### Task 9: Parse structured tail (TDD)

**Files:**
- Create: `src/main/brief/parse-tail.ts`
- Create: `tests/brief/parse-tail.test.ts`

- [ ] **Step 1: Write failing tests** — `tests/brief/parse-tail.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { parseStructuredTail } from '@main/brief/parse-tail';

describe('parseStructuredTail', () => {
  it('extracts and parses a code-fenced JSON tail', () => {
    const md = `Body text.

\`\`\`json
{
  "day_shape": "diffuse",
  "dominant_fragmentation_pattern": "morning_drift",
  "tomorrow_first_90": {
    "start_local": "09:00",
    "target": "Oracle dashboard",
    "supporting_event_id": null,
    "competing_event_id": "evt-123"
  }
}
\`\`\``;
    const result = parseStructuredTail(md);
    expect(result).toEqual({
      dayShape: 'diffuse',
      dominantFragmentationPattern: 'morning_drift',
      tomorrowFirst90: {
        startLocal: '09:00',
        target: 'Oracle dashboard',
        supportingEventId: null,
        competingEventId: 'evt-123',
      },
    });
  });

  it('returns null when there is no JSON block', () => {
    expect(parseStructuredTail('plain text only')).toBeNull();
  });

  it('returns null when JSON is malformed', () => {
    const md = `\`\`\`json\n{ broken json\n\`\`\``;
    expect(parseStructuredTail(md)).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    const md = `\`\`\`json\n{"day_shape":"anchored"}\n\`\`\``;
    expect(parseStructuredTail(md)).toBeNull();
  });

  it('returns null when day_shape value is outside the enum', () => {
    const md = `\`\`\`json\n{"day_shape":"perfect","dominant_fragmentation_pattern":"none","tomorrow_first_90":{"start_local":"09:00","target":"X","supporting_event_id":null,"competing_event_id":null}}\n\`\`\``;
    expect(parseStructuredTail(md)).toBeNull();
  });

  it('returns null when dominant_fragmentation_pattern value is outside the enum', () => {
    const md = `\`\`\`json\n{"day_shape":"diffuse","dominant_fragmentation_pattern":"chaos","tomorrow_first_90":{"start_local":"09:00","target":"X","supporting_event_id":null,"competing_event_id":null}}\n\`\`\``;
    expect(parseStructuredTail(md)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement** — `src/main/brief/parse-tail.ts`

```typescript
import type { StructuredTail } from '@shared/types';

const DAY_SHAPES = ['diffuse', 'anchored', 'fragmented_bursts', 'stretched_focus', 'rest'] as const;
const FRAGMENTATION_PATTERNS = ['morning_drift', 'afternoon_slip', 'calendar_collision', 'context_thrash', 'none'] as const;

export function parseStructuredTail(markdown: string): StructuredTail | null {
  const match = markdown.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;

  let raw: unknown;
  try { raw = JSON.parse(match[1]); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;

  const r = raw as Record<string, unknown>;
  const dayShape = r.day_shape;
  const pattern = r.dominant_fragmentation_pattern;
  const tomorrow = r.tomorrow_first_90;

  if (typeof dayShape !== 'string' || !(DAY_SHAPES as readonly string[]).includes(dayShape)) return null;
  if (typeof pattern !== 'string' || !(FRAGMENTATION_PATTERNS as readonly string[]).includes(pattern)) return null;
  if (!tomorrow || typeof tomorrow !== 'object') return null;

  const t = tomorrow as Record<string, unknown>;
  if (typeof t.start_local !== 'string' || !/^\d{2}:\d{2}$/.test(t.start_local)) return null;
  if (typeof t.target !== 'string' || t.target.length === 0) return null;
  if (t.supporting_event_id !== null && typeof t.supporting_event_id !== 'string') return null;
  if (t.competing_event_id !== null && typeof t.competing_event_id !== 'string') return null;

  return {
    dayShape: dayShape as StructuredTail['dayShape'],
    dominantFragmentationPattern: pattern as StructuredTail['dominantFragmentationPattern'],
    tomorrowFirst90: {
      startLocal: t.start_local,
      target: t.target,
      supportingEventId: t.supporting_event_id,
      competingEventId: t.competing_event_id,
    },
  };
}
```

Same temporary-type pattern as Task 6 if `StructuredTail` isn't exported from `@shared/types` yet — inline a local type until Task 17 lands.

- [ ] **Step 4: Run tests — expect PASS (6/6)**

- [ ] **Step 5: Commit**

```bash
git add src/main/brief/parse-tail.ts tests/brief/parse-tail.test.ts
git commit -m "feat(brief): parseStructuredTail — validate JSON tail enum + shape"
```

---

### Task 10: System prompt v1.0

**Files:**
- Create: `src/main/brief/prompts/v1.ts`

- [ ] **Step 1: Create `src/main/brief/prompts/v1.ts`** with the verbatim spec §5 prompt

```typescript
// System prompt v1.0 for Phase 4 Daily Brief.
// VERBATIM from docs/superpowers/specs/2026-05-27-remirror-phase4-daily-brief-design.md §5.
// If you change ANY word, bump PROMPT_VERSION and add a new file (v2.ts).

export const PROMPT_VERSION = 'v1.0';

export const SYSTEM_PROMPT_V1 = `You are the voice of Remirror, a desktop app that mirrors a user's actual day back to them so they can reflect honestly. You are not their therapist; you are their coach. You have already seen the data. You are not interpreting it for them — you are naming what happened in language that respects their intelligence.

You will receive a JSON payload describing today's recorded activity, calendar, goal, and stats. Produce a Markdown response with exactly five sections separated by ## headings, in this exact order: Truth headline, Today's story, What held, What fragmented, Tomorrow's first 90. After the last section, emit a code-fenced JSON block containing the structured tail described below.

Voice constraints (non-negotiable):
- Lead with the truth, not the win. The day's data determines the headline's tone; the structure is invariant.
- Use direct, factual language. Adults can interpret numbers; do not over-explain.
- Never use these words in user-facing copy: should, failed, missed, wasted, drifted, off-track, skipped, behind, slipping, broken streak, lost focus, gave up, fell off, neglected, ignored.
- Prefer this vocabulary instead: returned, restarted, kept, partial, did not start, came back to, found your way to, stretches of focus, longest, you said, you've done.
- Do not interpret fragmentation as a character signal. Name the mechanism only.
- Do not connect any specific gap to a goal outcome.
- Do not use the word "but" to pivot from a positive to a negative.
- Forward-look in section 5. Never backward-grade.

The "What fragmented" section is the riskiest. Name the fragmentation pattern as a factual observation, the way a coach reviewing film names what happened on a play. You are describing a mechanism, not assigning a grade. Identify the specific switch pattern, the specific partial event, or the specific time window where attention split — and stop. Do not interpret it as a character signal. Do not connect it to a goal outcome. Do not use the word "but" to pivot from a positive. The reader already knows it didn't go how they wanted; your job is to make the mechanism visible so they can see it tomorrow, not to deliver a verdict on today. Two sentences maximum. If you cannot name the fragmentation in one specific concrete pattern, write one sentence saying the day was diffuse without a single dominant fragmentation signature.

For "Tomorrow's first 90": give a literal 90-minute block. Start time as HH:MM, single target (one project or task), and reference any calendar event that supports it (e.g., "after your 9am standup") or competes with it (e.g., "before your 11am Jackie call"). Be concrete. The reader needs a thing to walk toward at the start of tomorrow, not a feeling.

Output the structured tail as a code-fenced JSON object with these exact keys:
- day_shape: one of "diffuse" | "anchored" | "fragmented_bursts" | "stretched_focus" | "rest"
- dominant_fragmentation_pattern: one of "morning_drift" | "afternoon_slip" | "calendar_collision" | "context_thrash" | "none"
- tomorrow_first_90: object with start_local (HH:MM), target (string), supporting_event_id (string|null), competing_event_id (string|null)

If the user worked less than 30 minutes total (focused + elsewhere), the day_shape is "rest" and the brief should be shorter, kinder, and end at "Tomorrow's first 90" without dwelling on fragmentation.`;

/** Used when an automatic regen fires after a banned-vocab violation. */
export function bannedVocabRegenPrompt(violatedWords: string[]): string {
  const list = violatedWords.map(w => `"${w}"`).join(', ');
  return `Your previous response contained banned vocabulary: ${list}. Regenerate the brief without using any of those words. Keep the same data, the same structure, and the same length. The banned vocabulary list is non-negotiable.`;
}

/** Used when an automatic regen fires after a parse failure. */
export function parseFailRegenPrompt(missingSections: string[]): string {
  return `Your previous response was missing required sections: ${missingSections.join(', ')}. Regenerate the brief with all five sections (Truth headline, Today's story, What held, What fragmented, Tomorrow's first 90) plus the structured JSON tail. Every section must have at least one sentence of content.`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/main/brief/prompts/v1.ts
git commit -m "feat(brief): system prompt v1.0 (verbatim from spec §5)"
```

---

### Task 11: Extend `Prefs` for Anthropic config

**Files:**
- Modify: `src/main/store.ts`

- [ ] **Step 1: Read current `store.ts` and add `anthropic` to `Prefs`**

The current `Prefs` type ends with `weeklyGoal?`. Add `anthropic` after it:

```typescript
import Store from 'electron-store';
import { DEFAULT_WORK_HOURS, type WorkHoursConfig } from './capture/work-hours';
import { MODEL_IDS } from './anthropic/models';

type Prefs = {
  hotkey: string;
  licenseKey?: string;
  capturePausedByUser: boolean;
  workHours: WorkHoursConfig;
  google: {
    refreshToken?: string;
    calendarId: string;
    syncedAt?: number;
  };
  weeklyGoal?: {
    text: string;
    projectLabel?: string;
    setAt: number;
  };
  anthropic: {
    apiKey?: string;  // safeStorage-encrypted base64
    model: string;    // one of MODEL_IDS values
  };
};

export const store = new Store<Prefs>({
  defaults: {
    hotkey: 'Alt+Shift+R',
    licenseKey: undefined,
    capturePausedByUser: false,
    workHours: DEFAULT_WORK_HOURS,
    google: {
      calendarId: 'primary',
    },
    anthropic: {
      model: MODEL_IDS.sonnet,
    },
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean. Task 3's `key.ts` now compiles correctly.

- [ ] **Step 3: Commit**

```bash
git add src/main/store.ts
git commit -m "feat(store): add anthropic { apiKey, model } prefs slot"
```

---

### Task 12: Regen-cap policy (TDD)

**Files:**
- Create: `src/main/brief/regen-policy.ts`
- Create: `tests/brief/regen-policy.test.ts`

- [ ] **Step 1: Write failing tests** — `tests/brief/regen-policy.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { canRegenerate, regenStatus, USER_REGEN_CAP } from '@main/brief/regen-policy';

describe('canRegenerate / regenStatus', () => {
  it('USER_REGEN_CAP is 2', () => {
    expect(USER_REGEN_CAP).toBe(2);
  });

  it('canRegenerate is true at generation_count = 1 (initial only)', () => {
    expect(canRegenerate(1)).toBe(true);
  });

  it('canRegenerate is true at generation_count = 2 (one regen used)', () => {
    expect(canRegenerate(2)).toBe(true);
  });

  it('canRegenerate is false at generation_count = 3 (two regens used)', () => {
    expect(canRegenerate(3)).toBe(false);
  });

  it('canRegenerate is false at generation_count > 3', () => {
    expect(canRegenerate(4)).toBe(false);
    expect(canRegenerate(99)).toBe(false);
  });

  it('regenStatus reports used and cap', () => {
    expect(regenStatus(1)).toEqual({ used: 0, cap: 2, locked: false });
    expect(regenStatus(2)).toEqual({ used: 1, cap: 2, locked: false });
    expect(regenStatus(3)).toEqual({ used: 2, cap: 2, locked: true });
    expect(regenStatus(4)).toEqual({ used: 2, cap: 2, locked: true });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement** — `src/main/brief/regen-policy.ts`

```typescript
/**
 * The user can regenerate the day's brief at most this many times after the
 * initial generation. After the cap, the button disables and the
 * "This is the brief. Sit with it." copy appears.
 */
export const USER_REGEN_CAP = 2;

/**
 * generation_count is 1-indexed: the initial generation increments it to 1.
 * Each user-initiated regen increments it by 1. Auto-regens for banned-vocab
 * or parse violations do NOT increment generation_count.
 */
export function canRegenerate(generationCount: number): boolean {
  const used = Math.max(0, generationCount - 1);
  return used < USER_REGEN_CAP;
}

export interface RegenStatus {
  used: number;
  cap: number;
  locked: boolean;
}

export function regenStatus(generationCount: number): RegenStatus {
  const used = Math.min(USER_REGEN_CAP, Math.max(0, generationCount - 1));
  return { used, cap: USER_REGEN_CAP, locked: used >= USER_REGEN_CAP };
}
```

- [ ] **Step 4: Run tests — expect PASS (6/6)**

- [ ] **Step 5: Commit**

```bash
git add src/main/brief/regen-policy.ts tests/brief/regen-policy.test.ts
git commit -m "feat(brief): regen-cap policy — 2 user regens per day"
```

---

### Task 13: Banned-vocab gate (TDD)

**Files:**
- Create: `src/main/brief/gate.ts`
- Create: `tests/brief/gate.test.ts`

- [ ] **Step 1: Write failing tests** — `tests/brief/gate.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { gateBrief, MAX_AUTO_REGENS_FOR_VIOLATIONS } from '@main/brief/gate';

describe('gateBrief', () => {
  it('MAX_AUTO_REGENS_FOR_VIOLATIONS is 3', () => {
    expect(MAX_AUTO_REGENS_FOR_VIOLATIONS).toBe(3);
  });

  it('returns ok when output has no banned vocabulary', () => {
    const clean = `## Truth headline\nFoo bar\n\n## Today's story\nStory.\n\n## What held\nh\n\n## What fragmented\nf\n\n## Tomorrow's first 90\nt`;
    const result = gateBrief(clean);
    expect(result.ok).toBe(true);
    expect(result.violatedWords).toEqual([]);
  });

  it('returns rejected when output contains a banned word', () => {
    const bad = `## Truth headline\nYou missed the goal.\n\n## Today's story\nStory.`;
    const result = gateBrief(bad);
    expect(result.ok).toBe(false);
    expect(result.violatedWords).toContain('missed');
  });

  it('deduplicates violated words', () => {
    const bad = `## Truth headline\nYou missed and missed again.`;
    const result = gateBrief(bad);
    expect(result.ok).toBe(false);
    expect(result.violatedWords).toEqual(['missed']);
  });

  it('catches multiple distinct banned words', () => {
    const bad = `## Truth headline\nYou failed and drifted today.`;
    const result = gateBrief(bad);
    expect(result.ok).toBe(false);
    expect(result.violatedWords.sort()).toEqual(['drifted', 'failed']);
  });

  it('uses word boundaries — "should" matches "should" but not "shoulder"', () => {
    expect(gateBrief('You should stop.').ok).toBe(false);
    expect(gateBrief('A shoulder injury.').ok).toBe(true);
  });

  it('case-insensitive', () => {
    expect(gateBrief('You MISSED it.').ok).toBe(false);
    expect(gateBrief('YOU FAILED').ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement** — `src/main/brief/gate.ts`

```typescript
import { scanForBannedVocabulary } from '../copy/banned-vocab';

/**
 * Maximum number of automatic regenerations triggered by banned-vocab violations
 * or parse failures. Distinct from USER_REGEN_CAP (user-initiated regens).
 * After this many auto-attempts, the brief is stored with a warning footer.
 */
export const MAX_AUTO_REGENS_FOR_VIOLATIONS = 3;

export interface GateResult {
  ok: boolean;
  violatedWords: string[];
}

export function gateBrief(rawMarkdown: string): GateResult {
  const hits = scanForBannedVocabulary(rawMarkdown);
  if (hits.length === 0) return { ok: true, violatedWords: [] };
  const words = Array.from(new Set(hits.map(h => h.word))).sort();
  return { ok: false, violatedWords: words };
}
```

- [ ] **Step 4: Run tests — expect PASS (7/7)**

- [ ] **Step 5: Commit**

```bash
git add src/main/brief/gate.ts tests/brief/gate.test.ts
git commit -m "feat(brief): banned-vocab gate (TDD)"
```

---

## Phase C — Streaming generation

### Task 14: Anthropic client wrapper + test-connection

**Files:**
- Create: `src/main/anthropic/client.ts`

- [ ] **Step 1: Create `src/main/anthropic/client.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { readAnthropicKey } from './key';
import { store } from '../store';
import log from '../log';

/**
 * Returns a configured Anthropic SDK client. Throws if no key is stored.
 */
export function getAnthropicClient(): Anthropic {
  const key = readAnthropicKey();
  if (!key) throw new Error('ANTHROPIC_API_KEY_MISSING');
  return new Anthropic({ apiKey: key });
}

export function getConfiguredModel(): string {
  return store.get('anthropic').model;
}

/**
 * Validates the stored key + model with a minimal call. Costs ~1 input token.
 * Returns { ok: true } on success or { ok: false, error } with a user-friendly
 * message on failure.
 */
export async function testConnection(): Promise<{ ok: true } | { ok: false; error: string }> {
  let client: Anthropic;
  try { client = getAnthropicClient(); } catch (e) {
    return { ok: false, error: 'No API key configured.' };
  }
  try {
    await client.messages.create({
      model: getConfiguredModel(),
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
    return { ok: true };
  } catch (e) {
    const msg = anthropicErrorMessage(e);
    log.warn('Anthropic testConnection failed:', msg);
    return { ok: false, error: msg };
  }
}

function anthropicErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { status?: number; message?: string; error?: { message?: string } };
    if (e.status === 401) return 'Invalid API key. Update it in Settings.';
    if (e.status === 429) return 'Rate limited by Anthropic. Try again in a moment.';
    if (e.status === 403) return 'API key lacks permission for the selected model.';
    if (e.status && e.status >= 500) return 'Anthropic service unavailable. Try again later.';
    if (e.error?.message) return e.error.message;
    if (e.message) return e.message;
  }
  return String(err);
}

export { anthropicErrorMessage };
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/main/anthropic/client.ts
git commit -m "feat(anthropic): SDK wrapper + testConnection"
```

---

### Task 15: Streaming caller

**Files:**
- Create: `src/main/anthropic/stream.ts`

- [ ] **Step 1: Create `src/main/anthropic/stream.ts`**

```typescript
import { getAnthropicClient, getConfiguredModel, anthropicErrorMessage } from './client';
import { SYSTEM_PROMPT_V1, PROMPT_VERSION } from '../brief/prompts/v1';
import log from '../log';

export interface StreamCallbacks {
  onTextDelta: (delta: string) => void;
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void;
}

export interface StreamResult {
  rawMarkdown: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  promptVersion: string;
}

/**
 * Streams a brief generation. Returns the assembled full Markdown plus usage.
 * Callers handle parsing, gating, retries.
 */
export async function streamBriefGeneration(
  userPayloadJson: string,
  callbacks: StreamCallbacks,
  systemPromptOverride?: string,
): Promise<StreamResult> {
  const client = getAnthropicClient();
  const model = getConfiguredModel();

  let full = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    const stream = client.messages.stream({
      model,
      max_tokens: 4096,
      system: systemPromptOverride ?? SYSTEM_PROMPT_V1,
      messages: [{ role: 'user', content: userPayloadJson }],
    });

    stream.on('text', (delta: string) => {
      full += delta;
      callbacks.onTextDelta(delta);
    });

    const message = await stream.finalMessage();
    inputTokens = message.usage?.input_tokens ?? 0;
    outputTokens = message.usage?.output_tokens ?? 0;
    if (callbacks.onUsage) callbacks.onUsage({ inputTokens, outputTokens });

    return { rawMarkdown: full, inputTokens, outputTokens, model, promptVersion: PROMPT_VERSION };
  } catch (e) {
    const msg = anthropicErrorMessage(e);
    log.warn('Brief stream failed:', msg);
    throw new Error(msg);
  }
}
```

- [ ] **Step 2: Typecheck**

- [ ] **Step 3: Commit**

```bash
git add src/main/anthropic/stream.ts
git commit -m "feat(anthropic): streaming brief generation"
```

---

### Task 16: Brief generation orchestrator

**Files:**
- Create: `src/main/brief/generate.ts`

This is the integration glue: assemble payload → stream → parse → gate (auto-regen on violations) → store. Returns to the IPC handler which surfaces results.

- [ ] **Step 1: Create `src/main/brief/generate.ts`**

```typescript
import { BrowserWindow } from 'electron';
import { getDatabase } from '../db/index';
import { store } from '../store';
import { assembleBriefPayload } from './assemble-payload';
import { streamBriefGeneration } from '../anthropic/stream';
import { SYSTEM_PROMPT_V1, bannedVocabRegenPrompt, parseFailRegenPrompt } from './prompts/v1';
import { parseBriefMarkdown } from './parse-markdown';
import { parseStructuredTail } from './parse-tail';
import { gateBrief, MAX_AUTO_REGENS_FOR_VIOLATIONS } from './gate';
import { BriefRepo } from './repo';
import { IPC } from '@shared/ipc-contract';
import type { DailyBriefDTO } from '@shared/types';
import log from '../log';

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload);
  }
}

export async function generateBrief(generationId: string): Promise<DailyBriefDTO> {
  const db = getDatabase();
  const repo = new BriefRepo(db);
  const now = new Date();
  const date = isoDate(now);

  // Increment the user-visible generation count BEFORE the stream begins.
  // If a brief already exists, +1. If not, this generation is the first → count = 1.
  const existing = repo.findByDate(date);
  const userGenCount = (existing?.generationCount ?? 0) + 1;

  const payload = assembleBriefPayload(db, now, {
    workHours: store.get('workHours'),
    goal: store.get('weeklyGoal') ?? null,
  });
  const userMessage = JSON.stringify(payload);

  let systemPrompt: string = SYSTEM_PROMPT_V1;
  let attempt = 0;
  let rawMarkdown = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let model = '';
  let promptVersion = '';

  while (attempt < MAX_AUTO_REGENS_FOR_VIOLATIONS) {
    attempt += 1;

    // Stream
    const result = await streamBriefGeneration(
      userMessage,
      {
        onTextDelta: delta => broadcast(IPC.BRIEF_STREAM, { kind: 'text_delta', generationId, delta }),
      },
      systemPrompt,
    );
    rawMarkdown = result.rawMarkdown;
    inputTokens = result.inputTokens;
    outputTokens = result.outputTokens;
    model = result.model;
    promptVersion = result.promptVersion;

    // Gate
    const gate = gateBrief(rawMarkdown);
    if (!gate.ok) {
      log.warn(`Brief attempt ${attempt}: banned vocab violations: ${gate.violatedWords.join(', ')}. Regenerating.`);
      systemPrompt = SYSTEM_PROMPT_V1 + '\n\n' + bannedVocabRegenPrompt(gate.violatedWords);
      continue;
    }

    // Parse sections
    const parse = parseBriefMarkdown(rawMarkdown);
    if (!parse.ok) {
      log.warn(`Brief attempt ${attempt}: parse failed, missing: ${parse.missing!.join(', ')}. Regenerating.`);
      systemPrompt = SYSTEM_PROMPT_V1 + '\n\n' + parseFailRegenPrompt(parse.missing!);
      continue;
    }

    // Success
    const tail = parseStructuredTail(rawMarkdown);
    const brief: DailyBriefDTO = {
      date,
      generatedAt: Date.now(),
      generationCount: userGenCount,
      model,
      promptVersion,
      inputTokens,
      outputTokens,
      headline: parse.sections!.headline,
      story: parse.sections!.story,
      whatHeld: parse.sections!.whatHeld,
      whatFragmented: parse.sections!.whatFragmented,
      tomorrowFirst90: parse.sections!.tomorrowFirst90,
      rawMarkdown,
      structuredTail: tail,
    };
    repo.upsert(brief);
    broadcast(IPC.BRIEF_STREAM, { kind: 'done', generationId, brief });
    return brief;
  }

  // All auto-regen attempts exhausted. Store what we have with a warning.
  log.warn(`Brief generation exhausted ${MAX_AUTO_REGENS_FOR_VIOLATIONS} auto-regen attempts; storing with warning`);
  const fallbackBrief: DailyBriefDTO = {
    date,
    generatedAt: Date.now(),
    generationCount: userGenCount,
    model,
    promptVersion,
    inputTokens,
    outputTokens,
    headline: '⚠ Auto-regeneration exhausted',
    story: rawMarkdown,
    whatHeld: '',
    whatFragmented: '',
    tomorrowFirst90: '',
    rawMarkdown,
    structuredTail: null,
  };
  repo.upsert(fallbackBrief);
  broadcast(IPC.BRIEF_STREAM, {
    kind: 'error',
    generationId,
    message: `Brief generation could not produce a compliant response after ${MAX_AUTO_REGENS_FOR_VIOLATIONS} attempts. Raw response stored — review and retry manually.`,
    retryable: true,
  });
  return fallbackBrief;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean. (Will require Task 17's IPC contract additions to resolve `IPC.BRIEF_STREAM`. If the typecheck flags this, complete Task 17 first then return to this commit.)

- [ ] **Step 3: Commit**

```bash
git add src/main/brief/generate.ts
git commit -m "feat(brief): generation orchestrator — assemble → stream → gate → store"
```

---

## Phase D — IPC + preload

### Task 17: Shared types + IPC contract additions

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc-contract.ts`

- [ ] **Step 1: Append to `src/shared/types.ts`**

```typescript
export interface StructuredTail {
  dayShape: 'diffuse' | 'anchored' | 'fragmented_bursts' | 'stretched_focus' | 'rest';
  dominantFragmentationPattern: 'morning_drift' | 'afternoon_slip' | 'calendar_collision' | 'context_thrash' | 'none';
  tomorrowFirst90: {
    startLocal: string;
    target: string;
    supportingEventId: string | null;
    competingEventId: string | null;
  };
}

export interface DailyBriefDTO {
  date: string;
  generatedAt: number;
  generationCount: number;
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  headline: string;
  story: string;
  whatHeld: string;
  whatFragmented: string;
  tomorrowFirst90: string;
  rawMarkdown: string;
  structuredTail: StructuredTail | null;
}

export interface RegenStatusDTO {
  used: number;
  cap: number;
  locked: boolean;
}

export interface AnthropicStatusDTO {
  hasKey: boolean;
  model: string;
}

export type BriefStreamEvent =
  | { kind: 'text_delta'; generationId: string; delta: string }
  | { kind: 'section_complete'; generationId: string; section: 'headline' | 'story' | 'what_held' | 'what_fragmented' | 'tomorrow_first_90' }
  | { kind: 'done'; generationId: string; brief: DailyBriefDTO }
  | { kind: 'error'; generationId: string; message: string; retryable: boolean };
```

- [ ] **Step 2: Add channels + API to `src/shared/ipc-contract.ts`**

Extend the type-only import:

```typescript
import type {
  Session, Project, Exclusion, EngineStatus,
  CalendarEventDTO, DailyStatsDTO, ProjectBreakdownDTO, WeeklyGoalDTO, GoogleStatusDTO,
  DailyBriefDTO, RegenStatusDTO, AnthropicStatusDTO, BriefStreamEvent,
} from './types';
```

Append channels to the `IPC` const:

```typescript
  // Brief
  BRIEF_TODAY: 'brief:today',
  BRIEF_LIST_PAST: 'brief:list_past',
  BRIEF_GENERATE: 'brief:generate',
  BRIEF_STREAM: 'brief:stream',
  BRIEF_REGEN_STATUS: 'brief:regen_status',

  // Anthropic
  ANTHROPIC_STATUS: 'anthropic:status',
  ANTHROPIC_SET_KEY: 'anthropic:set_key',
  ANTHROPIC_SET_MODEL: 'anthropic:set_model',
  ANTHROPIC_TEST: 'anthropic:test',
  ANTHROPIC_CLEAR_KEY: 'anthropic:clear_key',
```

Append methods to the `RemirrorAPI` interface:

```typescript
  briefToday(): Promise<DailyBriefDTO | null>;
  briefListPast(limit?: number): Promise<DailyBriefDTO[]>;
  briefGenerate(): Promise<{ generationId: string }>;
  briefRegenStatus(): Promise<RegenStatusDTO>;
  onBriefStream(cb: (e: BriefStreamEvent) => void): () => void;
  anthropicStatus(): Promise<AnthropicStatusDTO>;
  anthropicSetKey(key: string): Promise<void>;
  anthropicSetModel(modelId: string): Promise<void>;
  anthropicTest(): Promise<{ ok: boolean; error?: string }>;
  anthropicClearKey(): Promise<void>;
```

- [ ] **Step 3: Remove the temporary inline types from `src/main/brief/repo.ts` and `src/main/brief/parse-tail.ts`**

If you added local `DailyBriefDTO` / `StructuredTail` placeholders in Tasks 6 and 9, delete them now. The imports from `@shared/types` should resolve cleanly.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```
Expected: clean.

- [ ] **Step 5: Run full test suite**

```bash
npm test
```
Expected: all prior tests still pass; new brief tests pass too.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/ipc-contract.ts src/main/brief/repo.ts src/main/brief/parse-tail.ts
git commit -m "feat(ipc): Phase 4 contract — brief + anthropic channels + DTOs"
```

---

### Task 18: IPC handlers in main

**Files:**
- Modify: `src/main/ipc.ts`

- [ ] **Step 1: Add imports at the top of `src/main/ipc.ts`**

```typescript
import { BriefRepo } from './brief/repo';
import { generateBrief } from './brief/generate';
import { regenStatus } from './brief/regen-policy';
import { hasAnthropicKey, writeAnthropicKey, clearAnthropicKey } from './anthropic/key';
import { testConnection } from './anthropic/client';
import { ulid } from './ulid';
import type {
  DailyBriefDTO, RegenStatusDTO, AnthropicStatusDTO,
} from '@shared/types';
```

- [ ] **Step 2: Add handlers inside `registerIpc(engine)`** at the end, before the closing `}`:

```typescript
  const briefRepo = new BriefRepo(db);

  // Brief
  ipcMain.handle(IPC.BRIEF_TODAY, (): DailyBriefDTO | null => {
    return briefRepo.findByDate(isoDateLocal(new Date()));
  });
  ipcMain.handle(IPC.BRIEF_LIST_PAST, (_e, limit?: number): DailyBriefDTO[] => {
    return briefRepo.listPast(typeof limit === 'number' && limit > 0 ? limit : 30);
  });
  ipcMain.handle(IPC.BRIEF_GENERATE, async (): Promise<{ generationId: string }> => {
    if (!hasAnthropicKey()) {
      throw new Error('ANTHROPIC_API_KEY_MISSING');
    }
    const generationId = ulid();
    // Fire-and-forget; streaming happens through BRIEF_STREAM broadcasts.
    generateBrief(generationId).catch(err => {
      const msg = err instanceof Error ? err.message : String(err);
      broadcast(IPC.BRIEF_STREAM, { kind: 'error', generationId, message: msg, retryable: true });
    });
    return { generationId };
  });
  ipcMain.handle(IPC.BRIEF_REGEN_STATUS, (): RegenStatusDTO => {
    const today = briefRepo.findByDate(isoDateLocal(new Date()));
    return regenStatus(today?.generationCount ?? 0);
  });

  // Anthropic
  ipcMain.handle(IPC.ANTHROPIC_STATUS, (): AnthropicStatusDTO => ({
    hasKey: hasAnthropicKey(),
    model: store.get('anthropic').model,
  }));
  ipcMain.handle(IPC.ANTHROPIC_SET_KEY, (_e, key: string) => {
    writeAnthropicKey(key);
  });
  ipcMain.handle(IPC.ANTHROPIC_SET_MODEL, (_e, modelId: string) => {
    const cur = store.get('anthropic');
    store.set('anthropic', { ...cur, model: modelId });
  });
  ipcMain.handle(IPC.ANTHROPIC_TEST, async (): Promise<{ ok: boolean; error?: string }> => {
    const result = await testConnection();
    return result;
  });
  ipcMain.handle(IPC.ANTHROPIC_CLEAR_KEY, () => {
    clearAnthropicKey();
  });
```

- [ ] **Step 3: Typecheck + tests**

```bash
npm run typecheck && npm test
```
Expected: clean + all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat(ipc): Phase 4 handlers — brief, anthropic"
```

---

### Task 19: Preload — expose new API

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add to the `api` object** inside `src/preload/index.ts`:

```typescript
  briefToday: () => ipcRenderer.invoke(IPC.BRIEF_TODAY),
  briefListPast: (limit) => ipcRenderer.invoke(IPC.BRIEF_LIST_PAST, limit),
  briefGenerate: () => ipcRenderer.invoke(IPC.BRIEF_GENERATE),
  briefRegenStatus: () => ipcRenderer.invoke(IPC.BRIEF_REGEN_STATUS),
  onBriefStream: (cb) => {
    const handler = (_e: unknown, evt: unknown) => cb(evt as never);
    ipcRenderer.on(IPC.BRIEF_STREAM, handler);
    return () => ipcRenderer.off(IPC.BRIEF_STREAM, handler);
  },
  anthropicStatus: () => ipcRenderer.invoke(IPC.ANTHROPIC_STATUS),
  anthropicSetKey: (key) => ipcRenderer.invoke(IPC.ANTHROPIC_SET_KEY, key),
  anthropicSetModel: (modelId) => ipcRenderer.invoke(IPC.ANTHROPIC_SET_MODEL, modelId),
  anthropicTest: () => ipcRenderer.invoke(IPC.ANTHROPIC_TEST),
  anthropicClearKey: () => ipcRenderer.invoke(IPC.ANTHROPIC_CLEAR_KEY),
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(preload): expose Phase 4 brief + anthropic API"
```

---

## Phase E — UI primitives

### Task 20: Minimal safe Markdown renderer

The brief renders five sections of Markdown coming from Claude. We need a small renderer that handles `## headings`, paragraphs, line breaks, and *emphasis*/**bold**. NO image or HTML support (untrusted content). NO `<script>`/`<iframe>`.

**Files:**
- Create: `src/renderer/ui/markdown.tsx`

- [ ] **Step 1: Create `src/renderer/ui/markdown.tsx`**

```typescript
import React from 'react';

// Tiny, opinionated Markdown subset renderer for Claude's brief output.
// Supports: ## headings, paragraphs, single line breaks via two trailing spaces,
// *italic*, **bold**, `inline code`. Nothing else. Untrusted content; never raw HTML.

interface Props { source: string; className?: string }

export function Markdown({ source, className }: Props) {
  const blocks = source.replace(/\r\n/g, '\n').split(/\n{2,}/);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        const headingMatch = trimmed.match(/^##\s+(.+)$/);
        if (headingMatch) {
          return <h2 key={i} className="text-[11px] uppercase tracking-[1.5px] text-muted font-semibold mb-2 mt-5">{headingMatch[1]}</h2>;
        }
        return <p key={i} className="text-[14px] leading-[1.6] text-text mb-3 whitespace-pre-wrap">{renderInline(trimmed)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode[] {
  // Tokenize **bold**, *italic*, `code`. Order matters: **bold** before *italic*.
  const tokens: Array<{ type: 'text' | 'bold' | 'italic' | 'code'; content: string }> = [];
  let remaining = text;
  while (remaining.length > 0) {
    const bold = remaining.match(/^\*\*(.+?)\*\*/);
    if (bold) {
      tokens.push({ type: 'bold', content: bold[1] });
      remaining = remaining.slice(bold[0].length);
      continue;
    }
    const code = remaining.match(/^`([^`]+)`/);
    if (code) {
      tokens.push({ type: 'code', content: code[1] });
      remaining = remaining.slice(code[0].length);
      continue;
    }
    const italic = remaining.match(/^\*(.+?)\*/);
    if (italic) {
      tokens.push({ type: 'italic', content: italic[1] });
      remaining = remaining.slice(italic[0].length);
      continue;
    }
    // Consume a single character of plain text
    tokens.push({ type: 'text', content: remaining[0] });
    remaining = remaining.slice(1);
  }
  // Merge consecutive text tokens for fewer DOM nodes
  const merged: Array<{ type: 'text' | 'bold' | 'italic' | 'code'; content: string }> = [];
  for (const t of tokens) {
    const last = merged[merged.length - 1];
    if (last && last.type === 'text' && t.type === 'text') last.content += t.content;
    else merged.push({ ...t });
  }
  return merged.map((t, i) => {
    if (t.type === 'bold') return <strong key={i} className="font-bold text-text">{t.content}</strong>;
    if (t.type === 'italic') return <em key={i} className="italic">{t.content}</em>;
    if (t.type === 'code') return <code key={i} className="bg-bg-deep px-1.5 py-0.5 rounded text-[12px] text-accent">{t.content}</code>;
    return <React.Fragment key={i}>{t.content}</React.Fragment>;
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/markdown.tsx
git commit -m "feat(ui): minimal safe Markdown renderer for brief sections"
```

---

### Task 21: BriefCard component

The card that displays today's brief. Handles three states: streaming (incremental), complete, and error.

**Files:**
- Create: `src/renderer/ui/BriefCard.tsx`

- [ ] **Step 1: Create `src/renderer/ui/BriefCard.tsx`**

```typescript
import React from 'react';
import clsx from 'clsx';
import type { DailyBriefDTO, RegenStatusDTO } from '@shared/types';
import { Markdown } from './markdown';
import { Button } from './Button';

interface Props {
  brief: DailyBriefDTO | null;       // null while streaming or before any generation
  streamingMarkdown: string | null;  // non-null while a generation is in flight
  regenStatus: RegenStatusDTO;
  error: string | null;
  onGenerate: () => void;
  onRegenerate: () => void;
  busy: boolean;
}

export function BriefCard({ brief, streamingMarkdown, regenStatus, error, onGenerate, onRegenerate, busy }: Props) {
  // Streaming
  if (streamingMarkdown !== null) {
    return (
      <div className="bg-surface rounded-lg p-6 border border-[rgba(250,247,240,0.07)]">
        <Markdown source={streamingMarkdown} />
        <div className="mt-4 text-[11px] text-quiet flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 bg-accent rounded-full animate-pulse" />
          Writing…
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="bg-surface rounded-lg p-6 border border-[rgba(232,176,109,0.4)]">
        <div className="text-sand text-sm mb-3">Could not generate brief.</div>
        <div className="text-muted text-[13px] mb-4">{error}</div>
        <Button onClick={onGenerate} disabled={busy}>Retry</Button>
      </div>
    );
  }

  // No brief yet for today
  if (!brief) {
    return (
      <div className="bg-surface rounded-lg p-6 border border-[rgba(250,247,240,0.07)]">
        <div className="text-text text-sm mb-2">No brief for today yet.</div>
        <p className="text-muted text-[12px] mb-4 max-w-xl">
          Generating one will send today's aggregated stats (focus blocks, switches,
          calendar adherence, project breakdown) to the Anthropic API. ~$0.03 with Sonnet 4.5.
        </p>
        <Button onClick={onGenerate} disabled={busy}>Generate today's brief</Button>
      </div>
    );
  }

  // Complete brief
  return (
    <div className="bg-surface rounded-lg p-6 border border-[rgba(250,247,240,0.07)]">
      <Markdown source={brief.rawMarkdown} />
      <div className="mt-5 pt-4 border-t border-[rgba(250,247,240,0.07)] text-[11px] text-quiet flex flex-wrap items-center gap-x-3 gap-y-2">
        <span>Generated {new Date(brief.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
        <span>·</span>
        <span>{brief.model}</span>
        <span>·</span>
        <span>{brief.inputTokens.toLocaleString()} in + {brief.outputTokens.toLocaleString()} out tokens</span>
        <span>·</span>
        {regenStatus.locked ? (
          <span className="text-muted">This is the brief. Sit with it.</span>
        ) : (
          <>
            <span>{regenStatus.used} of {regenStatus.cap} regens used</span>
            <Button variant="ghost" onClick={onRegenerate} disabled={busy} className="text-[11px] px-2 py-1">Regenerate</Button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/BriefCard.tsx
git commit -m "feat(ui): BriefCard — streaming + complete + error states"
```

---

### Task 22: PastBriefRow component

**Files:**
- Create: `src/renderer/ui/PastBriefRow.tsx`

- [ ] **Step 1: Create `src/renderer/ui/PastBriefRow.tsx`**

```typescript
import React, { useState } from 'react';
import clsx from 'clsx';
import type { DailyBriefDTO } from '@shared/types';
import { Markdown } from './markdown';

interface Props { brief: DailyBriefDTO; }

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function PastBriefRow({ brief }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[rgba(250,247,240,0.05)]">
      <button
        className="w-full flex items-center justify-between py-3 text-left hover:bg-surface/30 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-baseline gap-3">
          <span className="text-text text-[13px] font-medium min-w-[6rem]">{fmtDate(brief.date)}</span>
          <span className="text-muted text-[12px] truncate max-w-[40rem]">{brief.headline}</span>
        </div>
        <span className={clsx('text-quiet text-xs transition-transform', open && 'rotate-90')}>▸</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <Markdown source={brief.rawMarkdown} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/PastBriefRow.tsx
git commit -m "feat(ui): PastBriefRow — collapsible past-brief entry"
```

---

### Task 23: Brief empty state — no API key

**Files:**
- Create: `src/renderer/ui/BriefEmptyStates.tsx`

- [ ] **Step 1: Create `src/renderer/ui/BriefEmptyStates.tsx`**

```typescript
import React from 'react';
import { Button } from './Button';

interface NoKeyProps { onSetupKey: () => void; }

export function NoApiKeyState({ onSetupKey }: NoKeyProps) {
  return (
    <div className="bg-surface rounded-lg p-6 border border-[rgba(250,247,240,0.07)]">
      <h3 className="text-text text-base font-semibold mb-2">Set up Claude to generate end-of-day reflections.</h3>
      <p className="text-muted text-[13px] mb-4 max-w-2xl leading-relaxed">
        Your data stays on this machine except when you generate a brief. At that
        moment, the day's aggregated stats are sent to the Anthropic API using your
        key. You provide your own key — it's never bundled, never logged, never proxied.
      </p>
      <Button onClick={onSetupKey}>Set up Anthropic API →</Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/BriefEmptyStates.tsx
git commit -m "feat(ui): BriefEmptyStates — no-API-key state"
```

---

### Task 24: AnthropicApiCard for the Schedule tab

**Files:**
- Create: `src/renderer/ui/AnthropicApiCard.tsx`

- [ ] **Step 1: Create `src/renderer/ui/AnthropicApiCard.tsx`**

```typescript
import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { AnthropicStatusDTO } from '@shared/types';
import { Button } from './Button';
import { Input } from './Input';
import { MODEL_IDS, MODEL_LABELS, MODEL_COST_ESTIMATE_USD, type ModelKey } from '../../main/anthropic/models';

const MODEL_OPTIONS: Array<{ key: ModelKey; id: string; label: string; cost: number }> = (Object.keys(MODEL_IDS) as ModelKey[]).map(k => ({
  key: k, id: MODEL_IDS[k], label: MODEL_LABELS[k], cost: MODEL_COST_ESTIMATE_USD[k],
}));

export function AnthropicApiCard() {
  const api = useRemirror();
  const [status, setStatus] = useState<AnthropicStatusDTO | null>(null);
  const [draftKey, setDraftKey] = useState('');
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() { setStatus(await api.anthropicStatus()); }

  useEffect(() => { refresh(); }, [api]);

  async function saveKey() {
    if (!draftKey.trim()) return;
    setBusy(true);
    try { await api.anthropicSetKey(draftKey.trim()); setDraftKey(''); await refresh(); }
    finally { setBusy(false); }
  }
  async function clearKey() {
    setBusy(true);
    try { await api.anthropicClearKey(); await refresh(); }
    finally { setBusy(false); }
  }
  async function changeModel(id: string) {
    setBusy(true);
    try { await api.anthropicSetModel(id); await refresh(); }
    finally { setBusy(false); }
  }
  async function runTest() {
    setBusy(true); setTestResult(null);
    try { setTestResult(await api.anthropicTest()); }
    finally { setBusy(false); }
  }

  if (!status) return <div className="text-muted text-sm">Loading…</div>;

  const selected = MODEL_OPTIONS.find(m => m.id === status.model) ?? MODEL_OPTIONS[0];

  return (
    <div className="bg-surface rounded-lg p-4 border border-[rgba(250,247,240,0.07)]">
      <h4 className="text-sm font-semibold text-text mb-2">Anthropic API</h4>
      <p className="text-xs text-muted mb-3 max-w-2xl leading-relaxed">
        Your Anthropic API key powers the Daily Brief. Stored locally via Electron safeStorage — never sent to any third party.
      </p>

      {status.hasKey ? (
        <div className="text-xs text-muted mb-3">✓ Key stored. <button className="underline text-text" onClick={clearKey} disabled={busy}>Clear</button></div>
      ) : (
        <div className="flex gap-2 items-center mb-3">
          <Input
            type="password"
            placeholder="sk-ant-api03-…"
            value={draftKey}
            onChange={e => setDraftKey(e.target.value)}
            className="flex-1"
          />
          <Button onClick={saveKey} disabled={!draftKey.trim() || busy}>Save</Button>
        </div>
      )}

      <div className="mb-3">
        <label className="text-xs text-muted block mb-1">Model</label>
        <select
          className="w-full bg-bg text-text rounded-md px-3 py-2 outline-none ring-1 ring-transparent focus:ring-accent"
          value={status.model}
          onChange={e => changeModel(e.target.value)}
          disabled={busy}
        >
          {MODEL_OPTIONS.map(m => (
            <option key={m.id} value={m.id}>{m.label} (~${m.cost.toFixed(3)}/brief)</option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 items-center">
        <Button variant="ghost" onClick={runTest} disabled={!status.hasKey || busy}>Test connection</Button>
        {testResult?.ok && <span className="text-accent text-xs">✓ Connected. Test brief generation cost: ~${selected.cost.toFixed(3)} per brief.</span>}
        {testResult && !testResult.ok && <span className="text-sand text-xs">⚠ {testResult.error}</span>}
      </div>
    </div>
  );
}
```

**Note:** the import `from '../../main/anthropic/models'` works because the constants in `models.ts` are pure TypeScript (no Electron-specific imports). Vite's bundler will tree-shake the renderer build correctly. If typecheck complains about the renderer importing from `src/main/`, move `models.ts` to `src/shared/anthropic-models.ts` and update both sides' imports.

- [ ] **Step 2: Move `models.ts` to `src/shared/anthropic-models.ts` if the typecheck refuses to allow `src/renderer → src/main` imports**

Run: `npm run typecheck`. If it fails with a `paths` error, do this:

```bash
git mv src/main/anthropic/models.ts src/shared/anthropic-models.ts
```

Then update all imports from `'../anthropic/models'` and `'./anthropic/models'` to `'@shared/anthropic-models'` (search-and-replace across `src/`). Update `AnthropicApiCard.tsx` to `import { MODEL_IDS, MODEL_LABELS, MODEL_COST_ESTIMATE_USD, type ModelKey } from '@shared/anthropic-models';`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/ui/AnthropicApiCard.tsx src/shared/anthropic-models.ts src/main/anthropic/models.ts src/main/anthropic/*.ts src/main/brief/*.ts src/main/ipc.ts
git commit -m "feat(ui): AnthropicApiCard — Settings panel for key + model + test"
```

---

## Phase F — UI composition

### Task 25: Brief tab route

**Files:**
- Create: `src/renderer/routes/Brief.tsx`

- [ ] **Step 1: Create `src/renderer/routes/Brief.tsx`**

```typescript
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { DailyBriefDTO, RegenStatusDTO, AnthropicStatusDTO, BriefStreamEvent } from '@shared/types';
import { BriefCard } from '../ui/BriefCard';
import { PastBriefRow } from '../ui/PastBriefRow';
import { NoApiKeyState } from '../ui/BriefEmptyStates';

interface Props { onNavigateToSettings: () => void; }

export function Brief({ onNavigateToSettings }: Props) {
  const api = useRemirror();
  const [today, setToday] = useState<DailyBriefDTO | null>(null);
  const [past, setPast] = useState<DailyBriefDTO[]>([]);
  const [regenStatus, setRegenStatus] = useState<RegenStatusDTO>({ used: 0, cap: 2, locked: false });
  const [anthropicStatus, setAnthropicStatus] = useState<AnthropicStatusDTO | null>(null);
  const [streamingMarkdown, setStreamingMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activeGenId = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    const [t, p, rs, as] = await Promise.all([
      api.briefToday(), api.briefListPast(30), api.briefRegenStatus(), api.anthropicStatus(),
    ]);
    setToday(t); setPast(p); setRegenStatus(rs); setAnthropicStatus(as);
  }, [api]);

  useEffect(() => {
    refresh();
    const off = api.onBriefStream((e: BriefStreamEvent) => {
      if (activeGenId.current && e.generationId !== activeGenId.current) return;
      if (e.kind === 'text_delta') {
        setStreamingMarkdown(prev => (prev ?? '') + e.delta);
      } else if (e.kind === 'done') {
        activeGenId.current = null;
        setStreamingMarkdown(null);
        setError(null);
        setBusy(false);
        refresh();
      } else if (e.kind === 'error') {
        activeGenId.current = null;
        setStreamingMarkdown(null);
        setError(e.message);
        setBusy(false);
      }
    });
    return off;
  }, [api, refresh]);

  async function handleGenerate() {
    setError(null); setBusy(true); setStreamingMarkdown('');
    try {
      const { generationId } = await api.briefGenerate();
      activeGenId.current = generationId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStreamingMarkdown(null); setBusy(false);
      if (msg.includes('ANTHROPIC_API_KEY_MISSING')) {
        setError('Set up your Anthropic API key in Settings.');
      } else {
        setError(msg);
      }
    }
  }

  if (anthropicStatus === null) return <div className="p-6 text-muted">Loading…</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-text text-lg font-semibold mb-1">Today, {new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
        <p className="text-quiet text-xs">An end-of-day reflection generated by Claude from today's recorded data.</p>
      </div>

      {!anthropicStatus.hasKey ? (
        <NoApiKeyState onSetupKey={onNavigateToSettings} />
      ) : (
        <BriefCard
          brief={today}
          streamingMarkdown={streamingMarkdown}
          regenStatus={regenStatus}
          error={error}
          onGenerate={handleGenerate}
          onRegenerate={handleGenerate}
          busy={busy}
        />
      )}

      {past.length > 0 && (
        <div className="mt-10">
          <h3 className="text-[10px] uppercase tracking-[1.5px] text-muted font-semibold mb-2">Past briefs</h3>
          <div>
            {past.map(b => <PastBriefRow key={b.date} brief={b} />)}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/routes/Brief.tsx
git commit -m "feat(route): Brief tab composes today + past briefs with streaming"
```

---

### Task 26: Add Brief tab to `Status.tsx`

**Files:**
- Modify: `src/renderer/routes/Status.tsx`

- [ ] **Step 1: Read the current `Status.tsx`, then modify**

Add `Brief` to the `Tab` type union and add a button + render branch.

Find:
```typescript
type Tab = 'today' | 'projects' | 'exclusions' | 'schedule';
```

Replace with:
```typescript
type Tab = 'today' | 'brief' | 'projects' | 'exclusions' | 'schedule';
```

Find:
```typescript
import { CalendarColumn } from '../ui/CalendarColumn';
import clsx from 'clsx';
```

Add an import for the Brief route:
```typescript
import { CalendarColumn } from '../ui/CalendarColumn';
import { Brief } from './Brief';
import clsx from 'clsx';
```

Find the tab-buttons block:
```typescript
        <div className="flex gap-4 text-xs">
          {tabBtn('today', 'Today')}
          {tabBtn('projects', 'Projects')}
          {tabBtn('exclusions', 'Exclusions')}
          {tabBtn('schedule', 'Schedule')}
        </div>
```

Replace with:
```typescript
        <div className="flex gap-4 text-xs">
          {tabBtn('today', 'Today')}
          {tabBtn('brief', 'Brief')}
          {tabBtn('projects', 'Projects')}
          {tabBtn('exclusions', 'Exclusions')}
          {tabBtn('schedule', 'Schedule')}
        </div>
```

Find the today-tab render block:
```typescript
      {tab === 'today' && (
        <div className="grid grid-cols-3 min-h-[640px]">
          <StoryColumn />
          <Timeline workHoursStart={workHours?.start} workHoursEnd={workHours?.end} />
          <CalendarColumn workHoursStart={workHours?.start} workHoursEnd={workHours?.end} />
        </div>
      )}
```

Add the brief-tab render branch immediately after:
```typescript
      {tab === 'brief' && (
        <Brief onNavigateToSettings={() => onTabChange('schedule')} />
      )}
```

- [ ] **Step 2: Update the `onNavigate` callback in `App.tsx` (if present) to handle the new `brief` tab**

Read `src/renderer/App.tsx` (or wherever the navigation typings live) and ensure the `'brief'` value is allowed. If `onNavigate` uses a string union like `'status' | 'settings:projects' | …`, extend it as needed.

- [ ] **Step 3: Typecheck + tests**

```bash
npm run typecheck && npm test
```

- [ ] **Step 4: Commit**

```bash
git add src/renderer/routes/Status.tsx src/renderer/App.tsx
git commit -m "feat(ui): add Brief tab to top-level nav"
```

---

### Task 27: Add AnthropicApiCard to Schedule tab

**Files:**
- Modify: `src/renderer/ui/WorkHoursEditor.tsx`

- [ ] **Step 1: Import + render the card**

Find:
```typescript
import { GoogleConnectButton } from './GoogleConnectButton';
import { GoalEditor } from './GoalEditor';
```

Replace with:
```typescript
import { GoogleConnectButton } from './GoogleConnectButton';
import { GoalEditor } from './GoalEditor';
import { AnthropicApiCard } from './AnthropicApiCard';
```

Find:
```typescript
      <GoalEditor />
      <GoogleConnectButton />
    </div>
  );
}
```

Replace with:
```typescript
      <GoalEditor />
      <GoogleConnectButton />
      <AnthropicApiCard />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + tests**

```bash
npm run typecheck && npm test
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/ui/WorkHoursEditor.tsx
git commit -m "feat(ui): Schedule tab — add Anthropic API card"
```

---

## Phase G — Polish + validation

### Task 28: Banned-vocab gate covers the bad-day exemplar

**Files:**
- Modify: `tests/copy/banned-vocab.test.ts`

- [ ] **Step 1: Add a new `describe` block that tests the spec §4.3 bad-day exemplar against the gate**

Append after the existing renderer test:

```typescript
import { gateBrief } from '@main/brief/gate';

describe('banned-vocab gate on spec §4.3 bad-day exemplar', () => {
  it('the bad-day exemplar is gate-clean', () => {
    const exemplar = `## Truth headline
12 minutes focused. 4 hours 8 minutes elsewhere. Longest stretch: 12 min on Oracle at 2:14pm.

## Today's story
Today was diffuse. The Oracle dashboard got 12 minutes; the Jackie call and the 10am planning block did not start. Most of the day moved through Twitter, Slack, and the inbox in stretches of 4-9 minutes. There was no anchor block.

## What held
The 2:14pm Oracle attempt was the only stretch where attention landed on the commitment. It was short, and it was real.

## What fragmented
The morning never had a starting block. The first 90 minutes after wake went to inbox and Twitter in alternating 6-minute windows, and the day's shape followed from there.

## Tomorrow's first 90
9:00-10:30 on the Oracle dashboard, before the inbox opens. One target, one window, before anything else gets a vote.`;
    expect(gateBrief(exemplar).ok).toBe(true);
  });

  it('rejects a brief that uses banned vocab', () => {
    const bad = `## Truth headline\nYou missed the goal today.`;
    const result = gateBrief(bad);
    expect(result.ok).toBe(false);
    expect(result.violatedWords).toContain('missed');
  });
});
```

- [ ] **Step 2: Run tests — expect PASS (2 new pass)**

```bash
npm test -- tests/copy/banned-vocab.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/copy/banned-vocab.test.ts
git commit -m "test: gate covers spec §4.3 bad-day exemplar"
```

---

### Task 29: Full sweep (typecheck + tests + build)

**Files:** none — verification pass.

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```
Expected: clean.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```
Expected: all tests pass. The new brief tests (repo, assemble, parse-markdown, parse-tail, regen-policy, gate, bad-day-exemplar) add ~30 new tests. Phase 2a's 85 tests still pass. Total: ~115/115.

- [ ] **Step 3: Run production build**

```bash
npm run build
```
Expected: clean. Both main and preload bundles build, migrations copy plugin runs.

- [ ] **Step 4: Manual smoke test (with `.env` and dev server)**

```bash
npm run dev
```

Walk through:
1. Open Remirror, navigate to Schedule tab — Anthropic API card visible at the bottom
2. Paste a real Anthropic API key, click Save
3. Click Test connection — see ✓ confirmation
4. Switch to Brief tab — see "No brief for today yet" state
5. Click Generate today's brief — see streaming Markdown unfold, then the complete card with footer
6. Click Regenerate — sees "1 of 2 regens used"
7. Regenerate again — button disabled, "This is the brief. Sit with it."

If any step fails, fix and add follow-up commits.

- [ ] **Step 5: Commit any sweep fixes**

```bash
git add -A
git commit -m "chore: Phase 4 sweep fixes"
```

---

### Task 30: Tag v0.3.0

- [ ] **Step 1: Verify acceptance criteria from spec §15**

Open the spec and walk through all 14 acceptance items. All should pass.

- [ ] **Step 2: Tag**

```bash
git tag -a v0.3.0 -m "$(cat <<'EOF'
Phase 4 — Daily Brief

What's new since v0.2.0:
- Brief tab: streaming Claude-generated end-of-day Markdown reflection with five sections (Truth headline, Today's story, What held, What fragmented, Tomorrow's first 90) and a structured JSON tail consumed by future Phase 5
- Anthropic API key setup in Schedule tab (safeStorage-encrypted, never bundled, never proxied)
- Model picker: Sonnet 4.5 default, Haiku 4.5, Opus 4.5
- Banned-vocab gate runs after every stream: violations trigger automatic regeneration (max 3) with stricter system prompt
- User-visible regen cap = 2 per day, then "This is the brief. Sit with it."
- Past briefs date-keyed, expandable
- Manual-fire only in v1 — auto-fire deferred until real usage data exists (per Mercer consult)
- New migration 006_daily_briefs

Tests: ~115 passing.
EOF
)"
```

- [ ] **Step 3: Phase 4 done.**

Move to the senior-dev audit pass (next phase).

---

## Self-review notes

**Spec coverage check** — each spec section mapped to tasks:

- §2 (When fires) — Task 25 implements manual-only generation; no auto-fire scaffolding ✓
- §3 (Regen policy) — Task 12 (TDD) implements cap; Task 21 (BriefCard) surfaces it ✓
- §4 (Output structure) — Task 8 (parse-markdown) verifies 5 sections; Task 9 (parse-tail) verifies tail ✓
- §4.3 (Bad-day exemplar) — Task 28 locks it as a gate test ✓
- §5 (System prompt) — Task 10 stores verbatim ✓
- §6 (Input payload) — Task 7 (TDD) assembles ✓
- §7 (UI) — Tasks 20-27 ✓
- §8 (Data model) — Task 1 (migration) + Task 11 (Prefs) ✓
- §9 (IPC) — Task 17 (types/channels) + Task 18 (handlers) + Task 19 (preload) ✓
- §10 (Banned-vocab gate) — Task 13 (TDD) + Task 16 (orchestrator) ✓
- §11 (Error handling) — Task 14 (testConnection error messages) + Task 16 (auto-regen + bail) ✓
- §12 (Cost transparency) — Task 21 (footer) + Task 24 (Settings cost label) ✓
- §13 (Privacy copy) — Task 23 (no-key state) + Task 24 (Settings card) ✓
- §14 (Testing strategy) — Tasks 6/7/8/9/12/13/28 implement TDD; manual smoke in Task 29 ✓
- §15 (Acceptance criteria) — Task 29 walkthrough ✓
- §16 (Out of scope) — no auto-fire scaffolding included ✓

**Placeholder scan:** no "TBD" / "TODO" / "similar to Task N" / "appropriate error handling" patterns. ✓

**Type consistency:**
- `DailyBriefDTO`, `StructuredTail`, `BriefStreamEvent`, `RegenStatusDTO`, `AnthropicStatusDTO` defined once in Task 17 and used identically downstream ✓
- `MODEL_IDS`, `ModelKey` defined once in Task 2 (or moved to shared in Task 24 Step 2) ✓
- `BANNED_VOCABULARY` defined once in Task 4 and used by both Task 13 (gate) and Task 28 (test) ✓
- `PROMPT_VERSION` defined once in Task 10 and read in Task 15 (stream) for storage ✓
- `USER_REGEN_CAP` defined once in Task 12 and used by Task 21 (BriefCard surfacing) ✓
- `MAX_AUTO_REGENS_FOR_VIOLATIONS` defined once in Task 13 and used by Task 16 (orchestrator loop) ✓

**Known scope notes:**
- Anthropic SDK live API tests are gated behind `npm run test:live` per spec §14.3. Not included in the default `npm test` flow. Add the script in Task 29 if not already present (it's optional v1).
- The orphan-recovery bug from Phase 2a backlog is intentionally NOT fixed here. Phase 4's audit pass (after v0.3.0) will pick it up.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-27-remirror-phase4.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task + two-stage review (spec then quality), same cadence as Phase 2a

**2. Inline Execution** — batch with checkpoints

Caller proceeds with subagent-driven-development.
