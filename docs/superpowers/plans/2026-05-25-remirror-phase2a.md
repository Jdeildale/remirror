# Remirror Phase 2a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Remirror Phase 2a Today tab — a three-column visual mirror (story / what you did / calendar) with new computed metrics (focus blocks, switches, focused hours, calendar adherence), Google Calendar OAuth integration, the coffee-tone brand palette migration, and the truth-led copy pattern from the Whitfield × Mercer operating frame.

**Architecture:** Calendar data lives in a new `calendar_events` table synced from Google every 15 minutes; daily metrics computed on demand from sessions + calendar with a 60-second cache invalidated on engine `change`; renderer composes three columns (StoryColumn / Timeline / CalendarColumn) that share a vertical time axis. Brand teal migrates from `#5fb6c4` (Phase 1) → `#5dc4b0` (sage-teal). All user-facing copy passes a banned-vocabulary linter.

**Tech Stack:** Electron 32 • TypeScript • better-sqlite3 • React 18 + Tailwind • googleapis + @google-cloud/local-auth • vitest

**Spec:** [`docs/superpowers/specs/2026-05-25-remirror-phase2a-design.md`](../specs/2026-05-25-remirror-phase2a-design.md)
**Operating frame:** [`docs/superpowers/specs/CRYSTALLIZED-CONTEXT-adhd-design-frame.md`](../specs/CRYSTALLIZED-CONTEXT-adhd-design-frame.md)

---

## File map

```
remirror/
├─ src/
│  ├─ main/
│  │  ├─ db/
│  │  │  └─ migrations/
│  │  │     ├─ 003_calendar_events.sql          # task 1
│  │  │     ├─ 004_daily_stats.sql              # task 1
│  │  │     └─ 005_projects_calendar_keywords.sql  # task 1
│  │  ├─ google/
│  │  │  ├─ auth.ts                             # task 7
│  │  │  └─ calendar.ts                         # task 8
│  │  ├─ calendar/
│  │  │  ├─ repo.ts                             # task 9
│  │  │  ├─ adherence.ts                        # task 5
│  │  │  └─ sync.ts                             # task 10
│  │  ├─ stats/
│  │  │  ├─ daily-stats.ts                      # task 11
│  │  │  └─ cache.ts                            # task 12
│  │  ├─ copy/
│  │  │  ├─ truth-headline.ts                   # task 3
│  │  │  └─ forward-nudge.ts                    # task 4
│  │  ├─ store.ts                               # task 2 (modify — add google + goal prefs)
│  │  ├─ ipc.ts                                 # task 15
│  │  └─ index.ts                               # task 10 (modify — wire calendar sync)
│  ├─ shared/
│  │  ├─ types.ts                               # task 14 (modify — add types)
│  │  ├─ ipc-contract.ts                        # task 14 (modify — add channels)
│  │  └─ palette.ts                             # task 2 (new — single source of truth for hex)
│  ├─ preload/
│  │  └─ index.ts                               # task 16
│  └─ renderer/
│     ├─ ui/
│     │  ├─ Logo.tsx                            # task 2 (modify — update color)
│     │  ├─ TruthHeadline.tsx                   # task 17
│     │  ├─ StatCard.tsx                        # task 18
│     │  ├─ SessionBlock.tsx                    # task 19
│     │  ├─ CalendarEventBlock.tsx              # task 20
│     │  ├─ ForwardNudge.tsx                    # task 21
│     │  ├─ ProjectBreakdown.tsx                # task 22
│     │  ├─ CalendarTodayList.tsx               # task 23
│     │  ├─ StoryColumn.tsx                     # task 24
│     │  ├─ Timeline.tsx                        # task 25
│     │  ├─ CalendarColumn.tsx                  # task 26
│     │  ├─ GoogleConnectButton.tsx             # task 28
│     │  └─ GoalEditor.tsx                      # task 29
│     ├─ routes/
│     │  └─ Status.tsx                          # task 27 (major refactor)
│     ├─ index.html                             # task 2 (modify — favicon color)
│     └─ ui/WorkHoursEditor.tsx                 # task 30 (extend — add Google + goal sections)
├─ tests/
│  ├─ copy/
│  │  ├─ truth-headline.test.ts                 # task 3
│  │  ├─ forward-nudge.test.ts                  # task 4
│  │  └─ banned-vocab.test.ts                   # task 31
│  ├─ calendar/
│  │  ├─ adherence.test.ts                      # task 5
│  │  └─ repo.test.ts                           # task 9
│  └─ stats/
│     └─ daily-stats.test.ts                    # task 11
├─ tailwind.config.js                           # task 2 (modify — coffee palette)
├─ resources/icons/source/                      # task 2 (no change — keep as-is)
└─ .env.example                                 # task 6 (modify — add GOOGLE_CLIENT_ID/SECRET)
```

---

## Phase A — Foundation

### Task 1: Database migrations (003, 004, 005)

**Files:**
- Create: `src/main/db/migrations/003_calendar_events.sql`
- Create: `src/main/db/migrations/004_daily_stats.sql`
- Create: `src/main/db/migrations/005_projects_calendar_keywords.sql`

- [ ] **Step 1: Create `003_calendar_events.sql`**

```sql
CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  attendees_count INTEGER DEFAULT 0,
  is_all_day INTEGER DEFAULT 0,
  declined INTEGER DEFAULT 0,
  project_label TEXT,
  source TEXT NOT NULL DEFAULT 'google',
  raw_json TEXT,
  fetched_at INTEGER NOT NULL
);
CREATE INDEX idx_calendar_events_date ON calendar_events(date);
CREATE INDEX idx_calendar_events_start ON calendar_events(start_time);
```

- [ ] **Step 2: Create `004_daily_stats.sql`**

```sql
CREATE TABLE daily_stats (
  date TEXT PRIMARY KEY,
  computed_at INTEGER NOT NULL,
  focus_blocks_count INTEGER NOT NULL,
  switches_count INTEGER NOT NULL,
  focused_ms INTEGER NOT NULL,
  elsewhere_ms INTEGER NOT NULL,
  longest_block_id TEXT,
  longest_block_ms INTEGER NOT NULL DEFAULT 0,
  calendar_kept INTEGER NOT NULL DEFAULT 0,
  calendar_partial INTEGER NOT NULL DEFAULT 0,
  calendar_missed INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT
);
```

- [ ] **Step 3: Create `005_projects_calendar_keywords.sql`**

```sql
ALTER TABLE projects ADD COLUMN calendar_keywords TEXT NOT NULL DEFAULT '[]';
```

- [ ] **Step 4: Verify migrations apply cleanly**

Run: `npm test -- tests/db.test.ts`
Expected: all existing db tests pass; the new migrations apply automatically because `runMigrations` discovers `.sql` files in alphanumeric order. The Vite copy-migrations plugin already handles bundling.

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations/003_calendar_events.sql src/main/db/migrations/004_daily_stats.sql src/main/db/migrations/005_projects_calendar_keywords.sql
git commit -m "feat(db): add calendar_events, daily_stats, projects.calendar_keywords"
```

---

### Task 2: Brand palette migration (coffee tone) + logo color update

**Files:**
- Create: `src/shared/palette.ts`
- Modify: `tailwind.config.js`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/ui/Logo.tsx`
- Modify: `src/renderer/routes/Onboarding.tsx`
- Modify: `src/main/store.ts`

- [ ] **Step 1: Create `src/shared/palette.ts`** — single source of truth for hex values referenced from non-Tailwind contexts (logo color prop, inline SVG, etc.)

```typescript
// The coffee-tone dark palette. Locked Phase 2a.
// Mirrored in tailwind.config.js — keep both in sync.

export const PALETTE = {
  bg: '#1a1816',
  bgDeep: '#0d0b09',
  surface: '#312d28',
  surfaceBorder: 'rgba(250,247,240,0.07)',
  text: '#faf7f0',
  textMuted: '#b8b1a4',
  textQuiet: '#8a7f70',
  accent: '#5dc4b0',
  purple: '#c89af0',
  green: '#bdd470',
  sand: '#e8b06d',
  unclassified: '#8a7f70',
  idleOutline: '#4a4540',
} as const;

export type PaletteToken = keyof typeof PALETTE;
```

- [ ] **Step 2: Update `tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{tsx,ts,html}'],
  theme: {
    extend: {
      colors: {
        // Coffee-tone palette — Phase 2a. Mirror of src/shared/palette.ts.
        bg: '#1a1816',
        'bg-deep': '#0d0b09',
        surface: '#312d28',
        text: '#faf7f0',
        muted: '#b8b1a4',
        quiet: '#8a7f70',
        accent: '#5dc4b0',
        purple: '#c89af0',
        green: '#bdd470',
        sand: '#e8b06d',
        unclassified: '#8a7f70',
        amber: '#e8b06d', // Phase 1 legacy alias (mapped to sand for backward compat)
        gray: '#8a7f70',  // Phase 1 legacy alias
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Update favicon in `src/renderer/index.html`** — change fill from `%23ffffff` to `%235dc4b0`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Remirror</title>
    <link
      rel="icon"
      type="image/svg+xml"
      href='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 507.2 507.17"><path fill="%235dc4b0" d="M149.2,376.2l69.01,130.97h-49.8l-85.14-166.5h37.16c15.76,0,28.72-7.79,35.53-22.13,6.66-14.3,6.73-34.47,0-48.74-6.84-14.45-19.66-22.13-35.53-22.13H0V0h507.2v507.17H230.08l-20.24-38.4h258.95V38.4H38.4v169.26h80.41c31.49,0,60.5,12.63,76.04,41.13,14.56,26.32,14.41,64.43-.07,90.75-10.12,18.09-25.95,30.54-45.57,36.66h0ZM38.4,507.17H0v-249.16h38.4v249.16h0Z"/></svg>'
    />
  </head>
  <body class="bg-bg text-text font-sans antialiased">
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Update `src/renderer/ui/Logo.tsx`** — change default color

```typescript
import React from 'react';
import { PALETTE } from '@shared/palette';

interface Props {
  size?: number;
  color?: string;
  className?: string;
  title?: string;
}

export function Logo({ size = 32, color = PALETTE.accent, className, title = 'Remirror' }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 507.2 507.17"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      <title>{title}</title>
      <path
        fill={color}
        d="M149.2,376.2l69.01,130.97h-49.8l-85.14-166.5h37.16c15.76,0,28.72-7.79,35.53-22.13,6.66-14.3,6.73-34.47,0-48.74-6.84-14.45-19.66-22.13-35.53-22.13H0V0h507.2v507.17H230.08l-20.24-38.4h258.95V38.4H38.4v169.26h80.41c31.49,0,60.5,12.63,76.04,41.13,14.56,26.32,14.41,64.43-.07,90.75-10.12,18.09-25.95,30.54-45.57,36.66h0ZM38.4,507.17H0v-249.16h38.4v249.16h0Z"
      />
    </svg>
  );
}
```

- [ ] **Step 5: Update `src/renderer/routes/Onboarding.tsx`** — change hard-coded color reference

Find: `<Logo size={36} color="#5fb6c4" />`
Replace with: `<Logo size={36} />` (uses new default)

- [ ] **Step 6: Update `src/main/store.ts`** — add Google + goal prefs

```typescript
import Store from 'electron-store';
import { DEFAULT_WORK_HOURS, type WorkHoursConfig } from './capture/work-hours';

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
  },
});
```

- [ ] **Step 7: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: clean. The new accent color flows through Tailwind, the logo updates everywhere it's used.

- [ ] **Step 8: Commit**

```bash
git add src/shared/palette.ts tailwind.config.js src/renderer/index.html src/renderer/ui/Logo.tsx src/renderer/routes/Onboarding.tsx src/main/store.ts
git commit -m "feat(brand): coffee-tone palette migration + logo color #5fb6c4 → #5dc4b0"
```

---

### Task 3: TruthHeadline copy generator (TDD)

The truth-led headline is a pure function: given today's session data, produce the single-sentence headline. No AI in Phase 2a.

**Files:**
- Create: `src/main/copy/truth-headline.ts`
- Create: `tests/copy/truth-headline.test.ts`

- [ ] **Step 1: Write failing tests** — `tests/copy/truth-headline.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { generateTruthHeadline, type DayShape } from '@main/copy/truth-headline';

describe('generateTruthHeadline', () => {
  it('produces a headline with focused + elsewhere + longest', () => {
    const shape: DayShape = {
      focusedMs: 3 * 3600_000 + 42 * 60_000, // 3h 42m
      elsewhereMs: 1 * 3600_000 + 21 * 60_000, // 1h 21m
      longest: {
        durationMs: 47 * 60_000,
        projectLabel: 'Oracle',
        startTime: new Date(2026, 4, 25, 17, 38, 0).getTime(),
      },
    };
    const headline = generateTruthHeadline(shape);
    expect(headline).toContain('3 hours 42 minutes of focused work');
    expect(headline).toContain('1 hour 21 minutes elsewhere');
    expect(headline).toContain('47 min on Oracle');
    expect(headline).toContain('5:38pm');
  });

  it('handles zero focused work without crashing', () => {
    const shape: DayShape = {
      focusedMs: 0,
      elsewhereMs: 2 * 3600_000,
      longest: null,
    };
    const headline = generateTruthHeadline(shape);
    expect(headline).toContain('0 hours 0 minutes of focused work');
    expect(headline).toContain('2 hours 0 minutes elsewhere');
    expect(headline).not.toContain('Longest stretch'); // no longest if no sessions
  });

  it('singularizes hour when 1h exactly', () => {
    const shape: DayShape = {
      focusedMs: 3600_000,
      elsewhereMs: 5 * 60_000,
      longest: {
        durationMs: 60 * 60_000,
        projectLabel: 'Oracle',
        startTime: new Date(2026, 4, 25, 9, 0, 0).getTime(),
      },
    };
    const headline = generateTruthHeadline(shape);
    expect(headline).toContain('1 hour 0 minutes');
    expect(headline).toContain('0 hours 5 minutes');
  });

  it('contains no banned vocabulary', () => {
    const shape: DayShape = {
      focusedMs: 12 * 60_000, // bad day: only 12 min focused
      elsewhereMs: 3 * 3600_000,
      longest: {
        durationMs: 12 * 60_000,
        projectLabel: 'Oracle',
        startTime: Date.now(),
      },
    };
    const headline = generateTruthHeadline(shape);
    const banned = ['should', 'failed', 'missed', 'wasted', 'drifted', 'off-track'];
    for (const word of banned) {
      expect(headline.toLowerCase()).not.toContain(word);
    }
  });

  it('formats single-digit minutes', () => {
    const shape: DayShape = {
      focusedMs: 6 * 60_000, // 6 min — should not say "06 minutes"
      elsewhereMs: 0,
      longest: {
        durationMs: 6 * 60_000,
        projectLabel: 'Test',
        startTime: new Date(2026, 4, 25, 7, 5, 0).getTime(),
      },
    };
    const headline = generateTruthHeadline(shape);
    expect(headline).toContain('0 hours 6 minutes');
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- tests/copy/truth-headline.test.ts`
Expected: module not found / generateTruthHeadline undefined.

- [ ] **Step 3: Implement** — `src/main/copy/truth-headline.ts`

```typescript
export interface LongestBlock {
  durationMs: number;
  projectLabel: string;
  startTime: number; // Unix ms
}

export interface DayShape {
  focusedMs: number;
  elsewhereMs: number;
  longest: LongestBlock | null;
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const hUnit = h === 1 ? 'hour' : 'hours';
  const mUnit = m === 1 ? 'minute' : 'minutes';
  return `${h} ${hUnit} ${m} ${mUnit}`;
}

function formatBlockDuration(ms: number): string {
  const totalMin = Math.round(ms / 60_000);
  return `${totalMin} min`;
}

function formatTimeOfDay(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mPad = m.toString().padStart(2, '0');
  return `${h12}:${mPad}${period}`;
}

export function generateTruthHeadline(shape: DayShape): string {
  const focused = formatDuration(shape.focusedMs);
  const elsewhere = formatDuration(shape.elsewhereMs);
  const base = `${focused} of focused work. ${elsewhere} elsewhere.`;
  if (!shape.longest) return base;
  const lbDur = formatBlockDuration(shape.longest.durationMs);
  const lbTime = formatTimeOfDay(shape.longest.startTime);
  return `${base} Longest stretch: ${lbDur} on ${shape.longest.projectLabel} at ${lbTime}.`;
}
```

- [ ] **Step 4: Run tests — expect PASS (5/5)**

Run: `npm test -- tests/copy/truth-headline.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/main/copy/truth-headline.ts tests/copy/truth-headline.test.ts
git commit -m "feat(copy): truth-led headline generator (pure function)"
```

---

### Task 4: ForwardNudge copy generator (TDD)

The forward-looking nudge with three pattern branches based on goal state.

**Files:**
- Create: `src/main/copy/forward-nudge.ts`
- Create: `tests/copy/forward-nudge.test.ts`

- [ ] **Step 1: Write failing tests** — `tests/copy/forward-nudge.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { generateForwardNudge, type NudgeContext } from '@main/copy/forward-nudge';

describe('generateForwardNudge', () => {
  it('uses goal-progress pattern when goal is set and behind pace', () => {
    const ctx: NudgeContext = {
      goal: { text: 'Ship the Oracle dashboard', projectLabel: 'Oracle' },
      goalProgressMs: 2 * 3600_000 + 14 * 60_000,
      goalTargetMs: 8 * 3600_000, // 8h target this week, only 2h14m done
      topProjectToday: { label: 'Oracle', returnCount: 3 },
      anySessionsToday: true,
    };
    const result = generateForwardNudge(ctx);
    expect(result).not.toBeNull();
    expect(result!).toContain('Ship the Oracle dashboard');
    expect(result!).toContain('2h 14m');
    expect(result!).toContain('close the gap');
  });

  it('uses on-pace message when goal is set and on track', () => {
    const ctx: NudgeContext = {
      goal: { text: 'Ship Oracle', projectLabel: 'Oracle' },
      goalProgressMs: 7 * 3600_000,
      goalTargetMs: 8 * 3600_000, // 87.5% — on pace
      topProjectToday: null,
      anySessionsToday: true,
    };
    const result = generateForwardNudge(ctx);
    expect(result).toContain('tracking ahead');
  });

  it('falls back to "where your brain wants to land" when no goal', () => {
    const ctx: NudgeContext = {
      goal: null,
      goalProgressMs: 0,
      goalTargetMs: 0,
      topProjectToday: { label: 'Jackie\'s Website', returnCount: 4 },
      anySessionsToday: true,
    };
    const result = generateForwardNudge(ctx);
    expect(result).toContain("Jackie's Website");
    expect(result).toContain('4 times');
    expect(result).toContain('your brain keeps wanting to land');
  });

  it('returns null when no goal and no sessions yet', () => {
    const ctx: NudgeContext = {
      goal: null,
      goalProgressMs: 0,
      goalTargetMs: 0,
      topProjectToday: null,
      anySessionsToday: false,
    };
    expect(generateForwardNudge(ctx)).toBeNull();
  });

  it('contains no banned vocabulary', () => {
    const ctx: NudgeContext = {
      goal: { text: 'Ship X', projectLabel: 'X' },
      goalProgressMs: 30 * 60_000,
      goalTargetMs: 10 * 3600_000,
      topProjectToday: null,
      anySessionsToday: true,
    };
    const result = generateForwardNudge(ctx);
    const banned = ['should', 'failed', 'missed', 'wasted', 'drifted', 'off-track'];
    for (const word of banned) {
      expect(result!.toLowerCase()).not.toContain(word);
    }
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- tests/copy/forward-nudge.test.ts`

- [ ] **Step 3: Implement** — `src/main/copy/forward-nudge.ts`

```typescript
export interface WeeklyGoal {
  text: string;
  projectLabel?: string;
}

export interface NudgeContext {
  goal: WeeklyGoal | null;
  goalProgressMs: number;    // time spent on goal-mapped project this week so far
  goalTargetMs: number;      // weekly target (0 means no target — treat as "behind")
  topProjectToday: { label: string; returnCount: number } | null;
  anySessionsToday: boolean;
}

function fmtHours(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

/**
 * Returns null when there's no useful nudge to surface
 * (no goal AND no sessions today yet — empty space is better than meaningless copy).
 */
export function generateForwardNudge(ctx: NudgeContext): string | null {
  if (ctx.goal) {
    const onPace = ctx.goalTargetMs > 0 && ctx.goalProgressMs / ctx.goalTargetMs >= 0.85;
    const progress = fmtHours(ctx.goalProgressMs);
    if (onPace) {
      return `You said ${ctx.goal.text}. You've done ${progress} toward it. You're tracking ahead — keep the current rhythm.`;
    }
    return `You said ${ctx.goal.text}. You've done ${progress} on it. Your next 90 minutes is the easiest place to close the gap.`;
  }

  if (!ctx.anySessionsToday || !ctx.topProjectToday) {
    return null;
  }

  return `You've returned to ${ctx.topProjectToday.label} ${ctx.topProjectToday.returnCount} times today. That's where your brain keeps wanting to land.`;
}
```

- [ ] **Step 4: Run tests — expect PASS (5/5)**

- [ ] **Step 5: Commit**

```bash
git add src/main/copy/forward-nudge.ts tests/copy/forward-nudge.test.ts
git commit -m "feat(copy): forward-looking nudge generator (pure function)"
```

---

### Task 5: Calendar adherence math (TDD)

Pure function. Given a calendar event and the day's sessions, returns kept/partial/did-not-start.

**Files:**
- Create: `src/main/calendar/adherence.ts`
- Create: `tests/calendar/adherence.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { computeAdherence, type AdherenceInput, type AdherenceResult } from '@main/calendar/adherence';

const MS = 60_000;
const HOUR = 60 * MS;

describe('computeAdherence', () => {
  it('returns "kept" when ≥80% of event window is covered by matched sessions', () => {
    const input: AdherenceInput = {
      event: { startMs: 0, endMs: 60 * MS, projectLabel: 'Jackie\'s Website' },
      sessions: [
        { startMs: 5 * MS, endMs: 55 * MS, projectLabel: "Jackie's Website" }, // 50 min of 60 = 83%
      ],
    };
    const r = computeAdherence(input);
    expect(r.status).toBe('kept');
    expect(r.overlapMs).toBe(50 * MS);
  });

  it('returns "partial" between 20% and 80%', () => {
    const input: AdherenceInput = {
      event: { startMs: 0, endMs: 60 * MS, projectLabel: "Jackie's Website" },
      sessions: [
        { startMs: 0, endMs: 30 * MS, projectLabel: "Jackie's Website" }, // 50% = partial
      ],
    };
    const r = computeAdherence(input);
    expect(r.status).toBe('partial');
    expect(r.overlapMs).toBe(30 * MS);
  });

  it('returns "did-not-start" below 20%', () => {
    const input: AdherenceInput = {
      event: { startMs: 0, endMs: 60 * MS, projectLabel: "Jackie's Website" },
      sessions: [
        { startMs: 0, endMs: 5 * MS, projectLabel: "Jackie's Website" }, // 8% = did-not-start
      ],
    };
    const r = computeAdherence(input);
    expect(r.status).toBe('did-not-start');
  });

  it('counts overlap only on sessions whose project matches the event', () => {
    const input: AdherenceInput = {
      event: { startMs: 0, endMs: 60 * MS, projectLabel: "Jackie's Website" },
      sessions: [
        { startMs: 0, endMs: 60 * MS, projectLabel: 'Twitter' }, // wrong project
      ],
    };
    const r = computeAdherence(input);
    expect(r.status).toBe('did-not-start');
    expect(r.overlapMs).toBe(0);
  });

  it('clips session ranges to the event window', () => {
    const input: AdherenceInput = {
      event: { startMs: 10 * MS, endMs: 70 * MS, projectLabel: 'X' },
      sessions: [
        { startMs: 0, endMs: 100 * MS, projectLabel: 'X' }, // overlap should be 60min, not 100
      ],
    };
    const r = computeAdherence(input);
    expect(r.overlapMs).toBe(60 * MS);
    expect(r.status).toBe('kept');
  });

  it('sums multiple matched session overlaps', () => {
    const input: AdherenceInput = {
      event: { startMs: 0, endMs: 60 * MS, projectLabel: 'X' },
      sessions: [
        { startMs: 0, endMs: 20 * MS, projectLabel: 'X' },
        { startMs: 30 * MS, endMs: 50 * MS, projectLabel: 'X' }, // 20 + 20 = 40min = 67% = partial
      ],
    };
    const r = computeAdherence(input);
    expect(r.overlapMs).toBe(40 * MS);
    expect(r.status).toBe('partial');
  });

  it('returns "did-not-start" when event has no mapped project', () => {
    const input: AdherenceInput = {
      event: { startMs: 0, endMs: HOUR, projectLabel: null },
      sessions: [{ startMs: 0, endMs: HOUR, projectLabel: 'Anything' }],
    };
    const r = computeAdherence(input);
    expect(r.status).toBe('did-not-start');
    expect(r.overlapMs).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement** — `src/main/calendar/adherence.ts`

```typescript
export interface CalendarEventSlice {
  startMs: number;
  endMs: number;
  projectLabel: string | null; // null = unmapped
}

export interface SessionSlice {
  startMs: number;
  endMs: number;
  projectLabel: string;
}

export interface AdherenceInput {
  event: CalendarEventSlice;
  sessions: SessionSlice[];
}

export type AdherenceStatus = 'kept' | 'partial' | 'did-not-start';

export interface AdherenceResult {
  status: AdherenceStatus;
  overlapMs: number;
  eventDurationMs: number;
  ratio: number; // 0..1
}

const KEPT_THRESHOLD = 0.80;
const PARTIAL_THRESHOLD = 0.20;

export function computeAdherence(input: AdherenceInput): AdherenceResult {
  const eventDurationMs = Math.max(0, input.event.endMs - input.event.startMs);
  if (!input.event.projectLabel || eventDurationMs === 0) {
    return { status: 'did-not-start', overlapMs: 0, eventDurationMs, ratio: 0 };
  }

  let overlapMs = 0;
  for (const s of input.sessions) {
    if (s.projectLabel !== input.event.projectLabel) continue;
    const startOverlap = Math.max(s.startMs, input.event.startMs);
    const endOverlap = Math.min(s.endMs, input.event.endMs);
    const overlap = Math.max(0, endOverlap - startOverlap);
    overlapMs += overlap;
  }

  const ratio = overlapMs / eventDurationMs;
  let status: AdherenceStatus = 'did-not-start';
  if (ratio >= KEPT_THRESHOLD) status = 'kept';
  else if (ratio >= PARTIAL_THRESHOLD) status = 'partial';

  return { status, overlapMs, eventDurationMs, ratio };
}
```

- [ ] **Step 4: Run tests — expect PASS (7/7)**

- [ ] **Step 5: Commit**

```bash
git add src/main/calendar/adherence.ts tests/calendar/adherence.test.ts
git commit -m "feat(calendar): adherence math — kept/partial/did-not-start"
```

---

## Phase B — Google Calendar integration

### Task 6: Google OAuth credentials setup (manual prerequisite)

This task is manual setup, not code. The developer needs Google OAuth credentials before any of the calendar code can run end-to-end.

**Files:**
- Modify: `.env.example`
- Modify: `README.md` (add setup instructions)
- Modify: `.gitignore` (ensure `.env` is ignored — already is, double-check)

- [ ] **Step 1: Update `.env.example`**

```
# Phase 2a Google Calendar OAuth — provide your own Google Cloud project credentials.
# Get these from https://console.cloud.google.com/apis/credentials
# Required scope: https://www.googleapis.com/auth/calendar.events.readonly
# Authorized redirect URI: http://127.0.0.1:0 (loopback flow)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Phase 2 reserved — user-provided Anthropic API key (Settings UI eventually). Not used by Phase 2a.
ANTHROPIC_API_KEY=
```

- [ ] **Step 2: Add `Google Calendar setup` section to `README.md`**

Append to README under a new section:

```markdown
## Google Calendar setup (Phase 2a)

The calendar integration uses OAuth against your own Google Cloud project. Why your own rather than Remirror's: this keeps your calendar data private to your machine and your Google account; nothing flows through any third-party server.

1. Visit https://console.cloud.google.com and create (or pick) a project.
2. Enable the Google Calendar API on that project: APIs & Services → Library → search "Google Calendar API" → Enable.
3. Configure the OAuth consent screen: APIs & Services → OAuth consent screen. User type "External" is fine for personal use. Add the scope `https://www.googleapis.com/auth/calendar.events.readonly`. Add your own email as a test user.
4. Create OAuth credentials: APIs & Services → Credentials → Create Credentials → OAuth client ID → Application type: "Desktop app".
5. Copy the Client ID and Client Secret into a local `.env` file in the project root, matching `.env.example`.
6. The first time you click "Connect Google Calendar" in Remirror, the system browser opens for you to authorize. The refresh token is then stored locally via Electron's `safeStorage` API.
```

- [ ] **Step 3: Verify `.gitignore` blocks `.env`**

```bash
grep -E "^\.env$" .gitignore
```
Expected output: `.env` (already present from Phase 1).

- [ ] **Step 4: Commit**

```bash
git add .env.example README.md
git commit -m "docs: Google Calendar OAuth setup instructions"
```

---

### Task 7: Google OAuth module

**Files:**
- Create: `src/main/google/auth.ts`

This module owns the OAuth2 client lifecycle: initial auth (browser flow), token refresh, token persistence via electron-store + safeStorage.

- [ ] **Step 1: Install dependencies**

```bash
npm install googleapis @google-cloud/local-auth
npm run rebuild:electron
```

- [ ] **Step 2: Create `src/main/google/auth.ts`**

```typescript
import { app, safeStorage } from 'electron';
import { OAuth2Client } from 'google-auth-library';
import http from 'node:http';
import { URL } from 'node:url';
import { shell } from 'electron';
import { store } from '../store';
import log from '../log';

const SCOPES = ['https://www.googleapis.com/auth/calendar.events.readonly'];

function clientId(): string {
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) throw new Error('GOOGLE_CLIENT_ID not set in environment (.env)');
  return id;
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error('GOOGLE_CLIENT_SECRET not set in environment (.env)');
  return secret;
}

function readStoredRefreshToken(): string | undefined {
  const stored = store.get('google.refreshToken');
  if (!stored) return undefined;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    }
    return stored;
  } catch (err) {
    log.warn('Failed to decrypt Google refresh token; treating as missing', err);
    return undefined;
  }
}

function writeRefreshToken(token: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token).toString('base64');
    store.set('google.refreshToken', encrypted);
  } else {
    store.set('google.refreshToken', token);
  }
}

export function hasStoredAuth(): boolean {
  return !!readStoredRefreshToken();
}

export function getAuthorizedClient(): OAuth2Client | null {
  const refreshToken = readStoredRefreshToken();
  if (!refreshToken) return null;
  const client = new OAuth2Client(clientId(), clientSecret());
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/**
 * Runs the desktop OAuth loopback flow:
 * 1. Spin up a local HTTP server on a random port
 * 2. Open the system browser to Google's consent page
 * 3. Capture the auth code on the loopback redirect
 * 4. Exchange for tokens; store the refresh token
 * Resolves with the authorized client or rejects on error/timeout.
 */
export async function startOAuthFlow(): Promise<OAuth2Client> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', async () => {
      try {
        const addr = server.address();
        if (typeof addr === 'string' || addr === null) {
          throw new Error('Local OAuth server failed to bind');
        }
        const redirectUri = `http://127.0.0.1:${addr.port}`;
        const client = new OAuth2Client(clientId(), clientSecret(), redirectUri);

        const authUrl = client.generateAuthUrl({
          access_type: 'offline',
          prompt: 'consent',
          scope: SCOPES,
        });

        const timeout = setTimeout(() => {
          server.close();
          reject(new Error('OAuth flow timed out after 5 minutes'));
        }, 5 * 60_000);

        server.on('request', async (req, res) => {
          try {
            if (!req.url) return;
            const u = new URL(req.url, redirectUri);
            const code = u.searchParams.get('code');
            const err = u.searchParams.get('error');
            if (err) {
              res.end(`OAuth error: ${err}. You can close this tab.`);
              clearTimeout(timeout);
              server.close();
              reject(new Error(`OAuth error: ${err}`));
              return;
            }
            if (!code) {
              res.end('Waiting for code...');
              return;
            }
            const { tokens } = await client.getToken(code);
            if (!tokens.refresh_token) {
              res.end('OAuth succeeded but no refresh token returned. Re-run "Connect" with prompt=consent.');
              clearTimeout(timeout);
              server.close();
              reject(new Error('No refresh token returned'));
              return;
            }
            writeRefreshToken(tokens.refresh_token);
            client.setCredentials(tokens);
            res.end('Remirror is connected to Google Calendar. You can close this tab.');
            clearTimeout(timeout);
            server.close();
            log.info('Google Calendar OAuth completed; refresh token stored');
            resolve(client);
          } catch (e) {
            log.error('OAuth callback error', e);
            res.statusCode = 500;
            res.end('Internal error during OAuth callback. Check logs.');
            clearTimeout(timeout);
            server.close();
            reject(e);
          }
        });

        await shell.openExternal(authUrl);
      } catch (e) {
        server.close();
        reject(e);
      }
    });
  });
}

export function disconnectGoogle(): void {
  store.delete('google.refreshToken');
  store.set('google.syncedAt', undefined);
  log.info('Google Calendar disconnected; refresh token removed from store');
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: clean. (No tests for this file — OAuth is hard to test in isolation and is verified via the integration smoke test in Task 10.)

- [ ] **Step 4: Commit**

```bash
git add src/main/google/auth.ts package.json package-lock.json
git commit -m "feat(google): OAuth module — desktop loopback flow with safeStorage"
```

---

### Task 8: Google Calendar API wrapper

**Files:**
- Create: `src/main/google/calendar.ts`

- [ ] **Step 1: Create `src/main/google/calendar.ts`**

```typescript
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import log from '../log';

export interface FetchedCalendarEvent {
  id: string;
  startTimeMs: number;
  endTimeMs: number;
  title: string;
  description: string;
  attendeesCount: number;
  isAllDay: boolean;
  declined: boolean;
  rawJson: string;
}

/**
 * Fetches events from the user's primary calendar for the given local date.
 * - Skips all-day events (no startDateTime)
 * - Skips events the user declined
 * - Returns events sorted by start time (Google already orders by start, we re-sort defensively)
 */
export async function fetchEventsForDate(
  client: OAuth2Client,
  calendarId: string,
  date: Date,
): Promise<FetchedCalendarEvent[]> {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const calendar = google.calendar({ version: 'v3', auth: client });
  const res = await calendar.events.list({
    calendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
  });

  const events: FetchedCalendarEvent[] = [];
  for (const e of res.data.items ?? []) {
    if (!e.id || !e.start || !e.end) continue;
    if (!e.start.dateTime || !e.end.dateTime) continue; // skip all-day
    const selfAttendee = (e.attendees ?? []).find(a => a.self);
    if (selfAttendee?.responseStatus === 'declined') continue;
    if (!e.summary) continue; // skip events with no title

    events.push({
      id: e.id,
      startTimeMs: new Date(e.start.dateTime).getTime(),
      endTimeMs: new Date(e.end.dateTime).getTime(),
      title: e.summary,
      description: e.description ?? '',
      attendeesCount: (e.attendees ?? []).length,
      isAllDay: false,
      declined: false,
      rawJson: JSON.stringify(e),
    });
  }

  events.sort((a, b) => a.startTimeMs - b.startTimeMs);
  log.info(`Fetched ${events.length} calendar events for ${date.toDateString()}`);
  return events;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add src/main/google/calendar.ts
git commit -m "feat(google): calendar events API wrapper"
```

---

### Task 9: CalendarRepo (TDD)

DB CRUD for calendar_events.

**Files:**
- Create: `src/main/calendar/repo.ts`
- Create: `tests/calendar/repo.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import { CalendarRepo } from '@main/calendar/repo';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../src/main/db/migrations');

let db: Database.Database;
let repo: CalendarRepo;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrationsDir);
  repo = new CalendarRepo(db);
});

afterEach(() => db.close());

describe('CalendarRepo', () => {
  it('upserts an event and reads it back', () => {
    repo.upsert({
      id: 'g1',
      date: '2026-05-25',
      startTimeMs: 1000,
      endTimeMs: 2000,
      title: 'Standup',
      description: '',
      attendeesCount: 5,
      isAllDay: false,
      declined: false,
      rawJson: '{}',
    });
    const events = repo.findByDate('2026-05-25');
    expect(events.length).toBe(1);
    expect(events[0].title).toBe('Standup');
  });

  it('replaces a stored event on upsert (no duplicates)', () => {
    repo.upsert({ id: 'g1', date: '2026-05-25', startTimeMs: 1000, endTimeMs: 2000, title: 'Old', description: '', attendeesCount: 0, isAllDay: false, declined: false, rawJson: '{}' });
    repo.upsert({ id: 'g1', date: '2026-05-25', startTimeMs: 1000, endTimeMs: 2000, title: 'New', description: '', attendeesCount: 0, isAllDay: false, declined: false, rawJson: '{}' });
    const events = repo.findByDate('2026-05-25');
    expect(events.length).toBe(1);
    expect(events[0].title).toBe('New');
  });

  it('findByDate returns events ordered by start_time', () => {
    repo.upsert({ id: 'b', date: '2026-05-25', startTimeMs: 2000, endTimeMs: 3000, title: 'Second', description: '', attendeesCount: 0, isAllDay: false, declined: false, rawJson: '{}' });
    repo.upsert({ id: 'a', date: '2026-05-25', startTimeMs: 1000, endTimeMs: 2000, title: 'First', description: '', attendeesCount: 0, isAllDay: false, declined: false, rawJson: '{}' });
    const events = repo.findByDate('2026-05-25');
    expect(events.map(e => e.title)).toEqual(['First', 'Second']);
  });

  it('deleteByDate removes all events for that date', () => {
    repo.upsert({ id: 'a', date: '2026-05-25', startTimeMs: 1000, endTimeMs: 2000, title: 'X', description: '', attendeesCount: 0, isAllDay: false, declined: false, rawJson: '{}' });
    repo.upsert({ id: 'b', date: '2026-05-26', startTimeMs: 1000, endTimeMs: 2000, title: 'Y', description: '', attendeesCount: 0, isAllDay: false, declined: false, rawJson: '{}' });
    repo.deleteByDate('2026-05-25');
    expect(repo.findByDate('2026-05-25').length).toBe(0);
    expect(repo.findByDate('2026-05-26').length).toBe(1);
  });

  it('setProjectLabel updates the mapping', () => {
    repo.upsert({ id: 'a', date: '2026-05-25', startTimeMs: 1000, endTimeMs: 2000, title: 'Jackie call', description: '', attendeesCount: 0, isAllDay: false, declined: false, rawJson: '{}' });
    repo.setProjectLabel('a', "Jackie's Website");
    const events = repo.findByDate('2026-05-25');
    expect(events[0].projectLabel).toBe("Jackie's Website");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement** — `src/main/calendar/repo.ts`

```typescript
import type Database from 'better-sqlite3';

export interface CalendarEventRow {
  id: string;
  date: string;
  startTimeMs: number;
  endTimeMs: number;
  title: string;
  description: string;
  attendeesCount: number;
  isAllDay: boolean;
  declined: boolean;
  projectLabel: string | null;
  rawJson: string;
  fetchedAt: number;
}

export interface CalendarEventInput {
  id: string;
  date: string;
  startTimeMs: number;
  endTimeMs: number;
  title: string;
  description: string;
  attendeesCount: number;
  isAllDay: boolean;
  declined: boolean;
  rawJson: string;
}

export class CalendarRepo {
  constructor(private db: Database.Database) {}

  upsert(e: CalendarEventInput): void {
    this.db.prepare(`
      INSERT INTO calendar_events (id, date, start_time, end_time, title, description, attendees_count, is_all_day, declined, source, raw_json, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'google', ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        date=excluded.date,
        start_time=excluded.start_time,
        end_time=excluded.end_time,
        title=excluded.title,
        description=excluded.description,
        attendees_count=excluded.attendees_count,
        is_all_day=excluded.is_all_day,
        declined=excluded.declined,
        raw_json=excluded.raw_json,
        fetched_at=excluded.fetched_at
    `).run(
      e.id, e.date, e.startTimeMs, e.endTimeMs, e.title, e.description,
      e.attendeesCount, e.isAllDay ? 1 : 0, e.declined ? 1 : 0, e.rawJson, Date.now(),
    );
  }

  findByDate(date: string): CalendarEventRow[] {
    const rows = this.db.prepare(`
      SELECT * FROM calendar_events WHERE date = ? ORDER BY start_time ASC
    `).all(date) as Array<any>;
    return rows.map(r => ({
      id: r.id,
      date: r.date,
      startTimeMs: r.start_time,
      endTimeMs: r.end_time,
      title: r.title,
      description: r.description ?? '',
      attendeesCount: r.attendees_count,
      isAllDay: r.is_all_day === 1,
      declined: r.declined === 1,
      projectLabel: r.project_label,
      rawJson: r.raw_json ?? '',
      fetchedAt: r.fetched_at,
    }));
  }

  deleteByDate(date: string): void {
    this.db.prepare('DELETE FROM calendar_events WHERE date = ?').run(date);
  }

  setProjectLabel(eventId: string, label: string | null): void {
    this.db.prepare('UPDATE calendar_events SET project_label = ? WHERE id = ?').run(label, eventId);
  }
}
```

- [ ] **Step 4: Run tests — expect PASS (5/5)**

- [ ] **Step 5: Commit**

```bash
git add src/main/calendar/repo.ts tests/calendar/repo.test.ts
git commit -m "feat(calendar): CalendarRepo (TDD)"
```

---

### Task 10: Calendar sync orchestrator + lifecycle wiring

**Files:**
- Create: `src/main/calendar/sync.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/capture/engine.ts` (add lifecycle hook)

- [ ] **Step 1: Create `src/main/calendar/sync.ts`**

```typescript
import { CalendarRepo } from './repo';
import { getAuthorizedClient } from '../google/auth';
import { fetchEventsForDate } from '../google/calendar';
import { store } from '../store';
import { getDatabase } from '../db/index';
import log from '../log';

const SYNC_INTERVAL_MS = 15 * 60_000;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export class CalendarSync {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private repo: CalendarRepo;
  private lastSyncAt: number | null = null;
  private lastError: string | null = null;

  constructor() {
    this.repo = new CalendarRepo(getDatabase());
  }

  /** Start the polling loop. Idempotent. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.syncNow(), SYNC_INTERVAL_MS);
    this.timer.unref?.();
    void this.syncNow(); // fire once immediately
    log.info('CalendarSync started (15 min polling)');
  }

  /** Stop the polling loop. Idempotent. */
  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    log.info('CalendarSync stopped');
  }

  /** Manual sync trigger. Returns true on success. */
  async syncNow(): Promise<boolean> {
    if (this.running) return false;
    const client = getAuthorizedClient();
    if (!client) {
      this.lastError = 'No Google credentials stored';
      return false;
    }
    this.running = true;
    try {
      const calId = store.get('google.calendarId') ?? 'primary';
      const today = new Date();
      const events = await fetchEventsForDate(client, calId, today);
      const dateKey = isoDate(today);
      // Refresh today's events: delete then re-upsert (handles deleted events)
      this.repo.deleteByDate(dateKey);
      for (const e of events) {
        this.repo.upsert({
          id: e.id,
          date: dateKey,
          startTimeMs: e.startTimeMs,
          endTimeMs: e.endTimeMs,
          title: e.title,
          description: e.description,
          attendeesCount: e.attendeesCount,
          isAllDay: e.isAllDay,
          declined: e.declined,
          rawJson: e.rawJson,
        });
      }
      this.lastSyncAt = Date.now();
      this.lastError = null;
      store.set('google.syncedAt', this.lastSyncAt);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.lastError = msg;
      log.warn('Calendar sync failed', msg);
      return false;
    } finally {
      this.running = false;
    }
  }

  getStatus(): { lastSyncAt: number | null; lastError: string | null; running: boolean } {
    return { lastSyncAt: this.lastSyncAt, lastError: this.lastError, running: this.running };
  }
}
```

- [ ] **Step 2: Wire into `src/main/index.ts`**

Add imports near the top:

```typescript
import { CalendarSync } from './calendar/sync';
import { hasStoredAuth } from './google/auth';
```

Inside `app.whenReady().then(async () => { try { ... } })`, after `engine.start()` and `openMainWindow()` (whichever path):

```typescript
    const calendarSync = new CalendarSync();
    global.__remirrorCalendarSync = calendarSync;

    if (hasStoredAuth()) {
      calendarSync.start();
    }

    // Hook engine lifecycle: pause calendar sync when capture pauses/stops
    engine.on('status', (status) => {
      if (status === 'active' || status === 'excluded') {
        if (hasStoredAuth()) calendarSync.start();
      } else {
        calendarSync.stop();
      }
    });
```

Add to the `global` declaration:

```typescript
declare global {
  // eslint-disable-next-line no-var
  var __remirrorQuitting: boolean | undefined;
  // eslint-disable-next-line no-var
  var __remirrorCalendarSync: CalendarSync | undefined;
}
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add src/main/calendar/sync.ts src/main/index.ts
git commit -m "feat(calendar): sync orchestrator + engine lifecycle wiring"
```

---

## Phase C — Daily stats

### Task 11: Daily stats computation (TDD)

**Files:**
- Create: `src/main/stats/daily-stats.ts`
- Create: `tests/stats/daily-stats.test.ts`

- [ ] **Step 1: Failing tests**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { runMigrations } from '@main/db/migrate';
import { SessionRepo } from '@main/capture/sessions';
import { computeDailyStats } from '@main/stats/daily-stats';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../src/main/db/migrations');

let db: Database.Database;
let sessions: SessionRepo;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  runMigrations(db, migrationsDir);
  sessions = new SessionRepo(db);
});

afterEach(() => db.close());

const MIN = 60_000;
const HOUR = 60 * MIN;

function dayStart(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

describe('computeDailyStats', () => {
  it('returns zero stats when there are no sessions today', () => {
    const stats = computeDailyStats(db, new Date());
    expect(stats.focusBlocksCount).toBe(0);
    expect(stats.switchesCount).toBe(0);
    expect(stats.focusedMs).toBe(0);
    expect(stats.elsewhereMs).toBe(0);
    expect(stats.longestBlock).toBeNull();
  });

  it('counts focus blocks ≥20 minutes by effective duration', () => {
    const now = new Date();
    const start = dayStart(now);

    const id1 = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id1, start + HOUR + 21 * MIN); // 21m → focus block

    const id2 = sessions.open({ startTime: start + 3 * HOUR, appName: 'b', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id2, start + 3 * HOUR + 5 * MIN); // 5m → not a focus block (becomes transition)

    const stats = computeDailyStats(db, now);
    expect(stats.focusBlocksCount).toBe(1);
  });

  it('sums focused vs elsewhere by project label', () => {
    const now = new Date();
    const start = dayStart(now);

    const id1 = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id1, start + HOUR + 60 * MIN); // 60m focused

    const id2 = sessions.open({ startTime: start + 3 * HOUR, appName: 'b', windowTitle: 't', displayId: 0, projectLabel: 'unclassified', confidence: 0 });
    sessions.close(id2, start + 3 * HOUR + 30 * MIN); // 30m elsewhere

    const stats = computeDailyStats(db, now);
    expect(stats.focusedMs).toBe(60 * MIN);
    expect(stats.elsewhereMs).toBe(30 * MIN);
  });

  it('switches counter = count of closed sessions today', () => {
    const now = new Date();
    const start = dayStart(now);

    for (let i = 0; i < 4; i++) {
      const id = sessions.open({ startTime: start + (i + 1) * HOUR, appName: `a${i}`, windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
      sessions.close(id, start + (i + 1) * HOUR + 5 * MIN);
    }
    const stats = computeDailyStats(db, now);
    expect(stats.switchesCount).toBe(4);
  });

  it('returns the longest block by effective duration', () => {
    const now = new Date();
    const start = dayStart(now);

    const id1 = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id1, start + HOUR + 20 * MIN);

    const id2 = sessions.open({ startTime: start + 3 * HOUR, appName: 'b', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id2, start + 3 * HOUR + 47 * MIN);

    const id3 = sessions.open({ startTime: start + 5 * HOUR, appName: 'c', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(id3, start + 5 * HOUR + 30 * MIN);

    const stats = computeDailyStats(db, now);
    expect(stats.longestBlock).not.toBeNull();
    expect(stats.longestBlock!.durationMs).toBe(47 * MIN);
    expect(stats.longestBlock!.id).toBe(id2);
  });

  it('subtracts paused_ms from effective duration', () => {
    const now = new Date();
    const start = dayStart(now);

    const id = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.addPausedMs(id, 15 * MIN); // 15m paused
    sessions.close(id, start + HOUR + 30 * MIN); // 30m wall-clock, 15m effective

    const stats = computeDailyStats(db, now);
    expect(stats.focusedMs).toBe(15 * MIN);
    expect(stats.focusBlocksCount).toBe(0); // 15min effective < 20min threshold
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement** — `src/main/stats/daily-stats.ts`

```typescript
import type Database from 'better-sqlite3';

const FOCUS_BLOCK_THRESHOLD_MS = 20 * 60_000;

export interface DailyStats {
  date: string; // YYYY-MM-DD local
  focusBlocksCount: number;
  switchesCount: number;
  focusedMs: number;
  elsewhereMs: number;
  longestBlock: {
    id: string;
    durationMs: number;
    projectLabel: string;
    startTime: number;
  } | null;
}

function dayBounds(now: Date): { startMs: number; endMs: number; isoDate: string } {
  const s = new Date(now);
  s.setHours(0, 0, 0, 0);
  const e = new Date(now);
  e.setHours(23, 59, 59, 999);
  const y = s.getFullYear();
  const m = (s.getMonth() + 1).toString().padStart(2, '0');
  const dd = s.getDate().toString().padStart(2, '0');
  return { startMs: s.getTime(), endMs: e.getTime(), isoDate: `${y}-${m}-${dd}` };
}

export function computeDailyStats(db: Database.Database, now: Date): DailyStats {
  const { startMs, endMs, isoDate } = dayBounds(now);

  const rows = db.prepare(`
    SELECT id, start_time, end_time, paused_ms, project_label, kind
    FROM sessions
    WHERE start_time >= ? AND start_time <= ? AND end_time IS NOT NULL
  `).all(startMs, endMs) as Array<{
    id: string;
    start_time: number;
    end_time: number;
    paused_ms: number;
    project_label: string | null;
    kind: string;
  }>;

  let focusBlocksCount = 0;
  let focusedMs = 0;
  let elsewhereMs = 0;
  let longest: DailyStats['longestBlock'] = null;

  for (const r of rows) {
    const effective = Math.max(0, r.end_time - r.start_time - r.paused_ms);

    if (r.kind === 'work') {
      if (r.project_label === 'unclassified' || r.project_label === null) {
        elsewhereMs += effective;
      } else {
        focusedMs += effective;
      }
    } else if (r.kind === 'transition') {
      elsewhereMs += effective;
    }

    if (r.kind === 'work' && effective >= FOCUS_BLOCK_THRESHOLD_MS) {
      focusBlocksCount += 1;
    }

    if (!longest || effective > longest.durationMs) {
      longest = {
        id: r.id,
        durationMs: effective,
        projectLabel: r.project_label ?? 'unclassified',
        startTime: r.start_time,
      };
    }
  }

  // If the longest is 0, treat as null (no usable longest block to feature)
  if (longest && longest.durationMs === 0) longest = null;

  return {
    date: isoDate,
    focusBlocksCount,
    switchesCount: rows.length,
    focusedMs,
    elsewhereMs,
    longestBlock: longest,
  };
}
```

- [ ] **Step 4: Run tests — expect PASS (6/6)**

- [ ] **Step 5: Commit**

```bash
git add src/main/stats/daily-stats.ts tests/stats/daily-stats.test.ts
git commit -m "feat(stats): daily stats computation (TDD)"
```

---

### Task 12: Stats cache with invalidation

**Files:**
- Create: `src/main/stats/cache.ts`

Simple in-memory TTL cache invalidated on engine `change` event.

- [ ] **Step 1: Create `src/main/stats/cache.ts`**

```typescript
import { computeDailyStats, type DailyStats } from './daily-stats';
import { getDatabase } from '../db/index';
import type { CaptureEngine } from '../capture/engine';

const TTL_MS = 60_000;

interface CacheEntry {
  computedAt: number;
  stats: DailyStats;
}

export class DailyStatsCache {
  private cache: CacheEntry | null = null;
  private engine: CaptureEngine | null = null;

  attachEngine(engine: CaptureEngine): void {
    if (this.engine === engine) return;
    this.engine = engine;
    engine.on('change', () => this.invalidate());
  }

  get(now: Date = new Date()): DailyStats {
    if (this.cache && Date.now() - this.cache.computedAt < TTL_MS) {
      return this.cache.stats;
    }
    const fresh = computeDailyStats(getDatabase(), now);
    this.cache = { computedAt: Date.now(), stats: fresh };
    return fresh;
  }

  invalidate(): void {
    this.cache = null;
  }
}

// Singleton
export const dailyStatsCache = new DailyStatsCache();
```

- [ ] **Step 2: Wire into `src/main/index.ts`** — attach engine to cache after engine creation:

In the `whenReady` block, after `const engine = new CaptureEngine(getDatabase());`:

```typescript
    const { dailyStatsCache } = await import('./stats/cache');
    dailyStatsCache.attachEngine(engine);
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run typecheck`

```bash
git add src/main/stats/cache.ts src/main/index.ts
git commit -m "feat(stats): in-memory cache with engine-change invalidation"
```

---

### Task 13: Project breakdown + return-count helpers

These are small helpers needed by the renderer for the time-by-project list and the forward-nudge "topProjectToday".

**Files:**
- Modify: `src/main/stats/daily-stats.ts` (add helpers)

- [ ] **Step 1: Append to `src/main/stats/daily-stats.ts`**

```typescript
export interface ProjectBreakdownEntry {
  label: string;
  totalMs: number;
  returnCount: number;
}

export function computeProjectBreakdown(db: Database.Database, now: Date): ProjectBreakdownEntry[] {
  const { startMs, endMs } = dayBounds(now);
  const rows = db.prepare(`
    SELECT project_label, start_time, end_time, paused_ms, kind
    FROM sessions
    WHERE start_time >= ? AND start_time <= ? AND end_time IS NOT NULL
  `).all(startMs, endMs) as Array<{
    project_label: string | null;
    start_time: number;
    end_time: number;
    paused_ms: number;
    kind: string;
  }>;

  const byProject = new Map<string, { totalMs: number; returnCount: number; lastLabel: string | null }>();
  for (const r of rows) {
    const label = r.project_label ?? 'unclassified';
    const effective = Math.max(0, r.end_time - r.start_time - r.paused_ms);
    const entry = byProject.get(label) ?? { totalMs: 0, returnCount: 0, lastLabel: null };
    entry.totalMs += effective;
    // returnCount = number of times this label appeared as a NEW session start (after a different label)
    if (entry.lastLabel !== label) entry.returnCount += 1;
    entry.lastLabel = label;
    byProject.set(label, entry);
  }

  return [...byProject.entries()]
    .map(([label, v]) => ({ label, totalMs: v.totalMs, returnCount: v.returnCount }))
    .sort((a, b) => b.totalMs - a.totalMs);
}
```

Note: the `lastLabel` tracking inside the same iteration doesn't actually capture the cross-row label switches correctly — fix below.

Actually, the correct implementation needs a single pass through rows ordered by `start_time`, tracking the previous label across the whole sequence:

Replace the whole function with:

```typescript
export function computeProjectBreakdown(db: Database.Database, now: Date): ProjectBreakdownEntry[] {
  const { startMs, endMs } = dayBounds(now);
  const rows = db.prepare(`
    SELECT project_label, start_time, end_time, paused_ms, kind
    FROM sessions
    WHERE start_time >= ? AND start_time <= ? AND end_time IS NOT NULL
    ORDER BY start_time ASC
  `).all(startMs, endMs) as Array<{
    project_label: string | null;
    start_time: number;
    end_time: number;
    paused_ms: number;
    kind: string;
  }>;

  const byProject = new Map<string, { totalMs: number; returnCount: number }>();
  let prevLabel: string | null = null;

  for (const r of rows) {
    const label = r.project_label ?? 'unclassified';
    const effective = Math.max(0, r.end_time - r.start_time - r.paused_ms);
    const entry = byProject.get(label) ?? { totalMs: 0, returnCount: 0 };
    entry.totalMs += effective;
    if (prevLabel !== label) {
      entry.returnCount += 1;
    }
    byProject.set(label, entry);
    prevLabel = label;
  }

  return [...byProject.entries()]
    .map(([label, v]) => ({ label, totalMs: v.totalMs, returnCount: v.returnCount }))
    .sort((a, b) => b.totalMs - a.totalMs);
}
```

- [ ] **Step 2: Append a quick test to `tests/stats/daily-stats.test.ts`**

```typescript
import { computeProjectBreakdown } from '@main/stats/daily-stats';

describe('computeProjectBreakdown', () => {
  it('counts returns when project label changes between consecutive sessions', () => {
    const now = new Date();
    const start = dayStart(now);

    const a1 = sessions.open({ startTime: start + HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(a1, start + HOUR + 10 * MIN);
    const b1 = sessions.open({ startTime: start + 2 * HOUR, appName: 'b', windowTitle: 't', displayId: 0, projectLabel: 'Twitter', confidence: 0 });
    sessions.close(b1, start + 2 * HOUR + 5 * MIN);
    const a2 = sessions.open({ startTime: start + 3 * HOUR, appName: 'a', windowTitle: 't', displayId: 0, projectLabel: 'Oracle', confidence: 1 });
    sessions.close(a2, start + 3 * HOUR + 15 * MIN);

    const bd = computeProjectBreakdown(db, now);
    const oracle = bd.find(e => e.label === 'Oracle');
    expect(oracle).toBeDefined();
    expect(oracle!.returnCount).toBe(2); // returned to Oracle twice
  });
});
```

- [ ] **Step 3: Run tests — expect PASS**

- [ ] **Step 4: Commit**

```bash
git add src/main/stats/daily-stats.ts tests/stats/daily-stats.test.ts
git commit -m "feat(stats): project breakdown + return-count helper"
```

---

## Phase D — IPC + preload

### Task 14: Shared types + IPC contract additions

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc-contract.ts`

- [ ] **Step 1: Add types to `src/shared/types.ts`**

Append at the end of the file:

```typescript
export interface CalendarEventDTO {
  id: string;
  startTimeMs: number;
  endTimeMs: number;
  title: string;
  projectLabel: string | null;
  status: 'kept' | 'partial' | 'did-not-start';
  overlapMs: number;
}

export interface DailyStatsDTO {
  date: string;
  focusBlocksCount: number;
  switchesCount: number;
  focusedMs: number;
  elsewhereMs: number;
  longestBlock: {
    id: string;
    durationMs: number;
    projectLabel: string;
    startTime: number;
  } | null;
}

export interface ProjectBreakdownDTO {
  label: string;
  totalMs: number;
  returnCount: number;
}

export interface WeeklyGoalDTO {
  text: string;
  projectLabel?: string;
  setAt: number;
}

export interface GoogleStatusDTO {
  connected: boolean;
  syncedAt: number | null;
  lastError: string | null;
}
```

- [ ] **Step 2: Add channels + API methods to `src/shared/ipc-contract.ts`**

Add inside the existing `IPC` const:

```typescript
  // Stats
  STATS_TODAY: 'stats:today',
  STATS_PROJECT_BREAKDOWN: 'stats:project_breakdown',

  // Calendar
  CALENDAR_LIST_TODAY: 'calendar:list_today',
  CALENDAR_REFRESH: 'calendar:refresh',
  CALENDAR_STATUS: 'calendar:status',

  // Google
  GOOGLE_CONNECT: 'google:connect',
  GOOGLE_DISCONNECT: 'google:disconnect',
  GOOGLE_STATUS: 'google:status',
  GOOGLE_STATUS_CHANGED: 'google:status:changed',

  // Goal
  GOAL_GET: 'goal:get',
  GOAL_SET: 'goal:set',
```

Add to the `RemirrorAPI` interface:

```typescript
import type {
  CalendarEventDTO,
  DailyStatsDTO,
  ProjectBreakdownDTO,
  WeeklyGoalDTO,
  GoogleStatusDTO,
} from './types';

// inside RemirrorAPI:
  todayStatsV2(): Promise<DailyStatsDTO>;
  projectBreakdown(): Promise<ProjectBreakdownDTO[]>;
  calendarListToday(): Promise<CalendarEventDTO[]>;
  calendarRefresh(): Promise<boolean>;
  googleConnect(): Promise<GoogleStatusDTO>;
  googleDisconnect(): Promise<void>;
  googleStatus(): Promise<GoogleStatusDTO>;
  onGoogleStatusChanged(cb: (s: GoogleStatusDTO) => void): () => void;
  getGoal(): Promise<WeeklyGoalDTO | null>;
  setGoal(g: { text: string; projectLabel?: string } | null): Promise<WeeklyGoalDTO | null>;
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/shared/ipc-contract.ts
git commit -m "feat(ipc): Phase 2a contract — stats, calendar, google, goal channels + DTOs"
```

---

### Task 15: IPC handlers in main

**Files:**
- Modify: `src/main/ipc.ts`

- [ ] **Step 1: Add imports at top of `src/main/ipc.ts`**

```typescript
import { dailyStatsCache } from './stats/cache';
import { computeProjectBreakdown } from './stats/daily-stats';
import { CalendarRepo } from './calendar/repo';
import { computeAdherence } from './calendar/adherence';
import { startOAuthFlow, disconnectGoogle, hasStoredAuth } from './google/auth';
import { SessionRepo as _ } from './capture/sessions'; // already imported above, ensure available
import type {
  CalendarEventDTO,
  DailyStatsDTO,
  ProjectBreakdownDTO,
  WeeklyGoalDTO,
  GoogleStatusDTO,
} from '@shared/types';

function isoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
```

- [ ] **Step 2: Add new handlers inside `registerIpc(engine)`** (after existing handlers)

```typescript
  const calRepo = new CalendarRepo(db);

  ipcMain.handle(IPC.STATS_TODAY, (): DailyStatsDTO => dailyStatsCache.get());
  ipcMain.handle(IPC.STATS_PROJECT_BREAKDOWN, (): ProjectBreakdownDTO[] => {
    return computeProjectBreakdown(db, new Date());
  });

  ipcMain.handle(IPC.CALENDAR_LIST_TODAY, (): CalendarEventDTO[] => {
    const today = isoDateLocal(new Date());
    const events = calRepo.findByDate(today);
    const sessionsToday = repo.recentSessions(500).filter(s => {
      const sDate = new Date(s.start_time);
      return isoDateLocal(sDate) === today && s.end_time !== null;
    });
    return events.map(e => {
      const adherence = computeAdherence({
        event: { startMs: e.startTimeMs, endMs: e.endTimeMs, projectLabel: e.projectLabel },
        sessions: sessionsToday.map(s => ({
          startMs: s.start_time,
          endMs: s.end_time as number,
          projectLabel: s.project_label ?? 'unclassified',
        })),
      });
      return {
        id: e.id,
        startTimeMs: e.startTimeMs,
        endTimeMs: e.endTimeMs,
        title: e.title,
        projectLabel: e.projectLabel,
        status: adherence.status,
        overlapMs: adherence.overlapMs,
      };
    });
  });

  ipcMain.handle(IPC.CALENDAR_REFRESH, async (): Promise<boolean> => {
    const sync = global.__remirrorCalendarSync;
    if (!sync) return false;
    return await sync.syncNow();
  });

  ipcMain.handle(IPC.CALENDAR_STATUS, () => {
    return global.__remirrorCalendarSync?.getStatus() ?? { lastSyncAt: null, lastError: null, running: false };
  });

  ipcMain.handle(IPC.GOOGLE_CONNECT, async (): Promise<GoogleStatusDTO> => {
    try {
      await startOAuthFlow();
      global.__remirrorCalendarSync?.start();
      const status: GoogleStatusDTO = {
        connected: true,
        syncedAt: store.get('google.syncedAt') ?? null,
        lastError: null,
      };
      broadcast(IPC.GOOGLE_STATUS_CHANGED, status);
      return status;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const status: GoogleStatusDTO = { connected: false, syncedAt: null, lastError: msg };
      broadcast(IPC.GOOGLE_STATUS_CHANGED, status);
      return status;
    }
  });

  ipcMain.handle(IPC.GOOGLE_DISCONNECT, () => {
    disconnectGoogle();
    global.__remirrorCalendarSync?.stop();
    broadcast(IPC.GOOGLE_STATUS_CHANGED, { connected: false, syncedAt: null, lastError: null });
  });

  ipcMain.handle(IPC.GOOGLE_STATUS, (): GoogleStatusDTO => ({
    connected: hasStoredAuth(),
    syncedAt: store.get('google.syncedAt') ?? null,
    lastError: global.__remirrorCalendarSync?.getStatus().lastError ?? null,
  }));

  ipcMain.handle(IPC.GOAL_GET, (): WeeklyGoalDTO | null => {
    return store.get('weeklyGoal') ?? null;
  });

  ipcMain.handle(IPC.GOAL_SET, (_e, g: { text: string; projectLabel?: string } | null): WeeklyGoalDTO | null => {
    if (g === null) {
      store.delete('weeklyGoal');
      return null;
    }
    const stored: WeeklyGoalDTO = { text: g.text, projectLabel: g.projectLabel, setAt: Date.now() };
    store.set('weeklyGoal', stored);
    return stored;
  });
```

- [ ] **Step 3: Update global declaration** in `src/main/ipc.ts` if needed (the file may need to know about `global.__remirrorCalendarSync`); add at top:

```typescript
declare global {
  // eslint-disable-next-line no-var
  var __remirrorCalendarSync: import('./calendar/sync').CalendarSync | undefined;
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc.ts
git commit -m "feat(ipc): Phase 2a handlers — stats, calendar, google OAuth, goal"
```

---

### Task 16: Preload — expose new API

**Files:**
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Update preload**

Add to the `api` object inside `src/preload/index.ts`:

```typescript
  todayStatsV2: () => ipcRenderer.invoke(IPC.STATS_TODAY),
  projectBreakdown: () => ipcRenderer.invoke(IPC.STATS_PROJECT_BREAKDOWN),
  calendarListToday: () => ipcRenderer.invoke(IPC.CALENDAR_LIST_TODAY),
  calendarRefresh: () => ipcRenderer.invoke(IPC.CALENDAR_REFRESH),
  googleConnect: () => ipcRenderer.invoke(IPC.GOOGLE_CONNECT),
  googleDisconnect: () => ipcRenderer.invoke(IPC.GOOGLE_DISCONNECT),
  googleStatus: () => ipcRenderer.invoke(IPC.GOOGLE_STATUS),
  onGoogleStatusChanged: (cb: (s: any) => void) => {
    const handler = (_e: unknown, s: any) => cb(s);
    ipcRenderer.on(IPC.GOOGLE_STATUS_CHANGED, handler);
    return () => ipcRenderer.off(IPC.GOOGLE_STATUS_CHANGED, handler);
  },
  getGoal: () => ipcRenderer.invoke(IPC.GOAL_GET),
  setGoal: (g: any) => ipcRenderer.invoke(IPC.GOAL_SET, g),
```

- [ ] **Step 2: Typecheck**

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat(preload): expose Phase 2a API surface"
```

---

## Phase E — UI primitives

### Task 17: TruthHeadline component

**Files:**
- Create: `src/renderer/ui/TruthHeadline.tsx`

- [ ] **Step 1: Create the component**

```typescript
import React from 'react';
import type { DailyStatsDTO } from '@shared/types';

function fmt(ms: number): { h: number; m: number } {
  const total = Math.floor(ms / 60_000);
  return { h: Math.floor(total / 60), m: total % 60 };
}

function fmtBlockMin(ms: number): string {
  return `${Math.round(ms / 60_000)} min`;
}

function fmtTimeOfDay(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m.toString().padStart(2, '0')}${period}`;
}

interface Props {
  stats: DailyStatsDTO;
}

export function TruthHeadline({ stats }: Props) {
  const focused = fmt(stats.focusedMs);
  const elsewhere = fmt(stats.elsewhereMs);
  return (
    <div className="mb-5">
      <div className="text-[10px] uppercase tracking-[1.5px] text-muted font-semibold mb-2">Today</div>
      <p className="text-[19px] leading-[1.35] text-text font-medium m-0">
        <span className="text-accent font-bold">{focused.h} {focused.h === 1 ? 'hour' : 'hours'} {focused.m} {focused.m === 1 ? 'minute' : 'minutes'}</span> of focused work.{' '}
        <span className="text-text">{elsewhere.h} {elsewhere.h === 1 ? 'hour' : 'hours'} {elsewhere.m} {elsewhere.m === 1 ? 'minute' : 'minutes'}</span> elsewhere.
        {stats.longestBlock && (
          <>
            {' '}Longest stretch: <span className="text-accent font-bold">{fmtBlockMin(stats.longestBlock.durationMs)} on {stats.longestBlock.projectLabel}</span> at {fmtTimeOfDay(stats.longestBlock.startTime)}.
          </>
        )}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

- [ ] **Step 3: Commit**

```bash
git add src/renderer/ui/TruthHeadline.tsx
git commit -m "feat(ui): TruthHeadline component"
```

---

### Task 18: StatCard component

**Files:**
- Create: `src/renderer/ui/StatCard.tsx`

- [ ] **Step 1: Create the component**

```typescript
import React from 'react';
import clsx from 'clsx';

interface Props {
  label: string;
  value: React.ReactNode;
  emphasize?: boolean; // highlights value in accent color
  className?: string;
}

export function StatCard({ label, value, emphasize, className }: Props) {
  return (
    <div className={clsx(
      'bg-surface rounded-lg p-[14px] border border-[rgba(250,247,240,0.07)]',
      className,
    )}>
      <div className={clsx('text-[11px] font-semibold', emphasize ? 'text-accent' : 'text-muted')}>{label}</div>
      <div className={clsx('text-[24px] font-bold mt-1', emphasize ? 'text-accent' : 'text-text')}>
        {value}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/StatCard.tsx
git commit -m "feat(ui): StatCard primitive"
```

---

### Task 19: SessionBlock component

**Files:**
- Create: `src/renderer/ui/SessionBlock.tsx`

The actual-timeline block. Color by project label, height proportional to duration, label only if focus block ≥20m.

- [ ] **Step 1: Create the component**

```typescript
import React from 'react';
import clsx from 'clsx';
import type { Session } from '@shared/types';

interface Props {
  session: Session;
  pixelsPerMs: number;
  topOffsetPx: number; // calculated by parent based on start_time and timeline origin
  isLongestToday: boolean;
}

// Project label → background color token. "Oracle" or any other goal-aligned label → accent.
// In Phase 2a we hard-code a small mapping; Phase 3 will add user-customizable colors.
function colorForProject(label: string | null): string {
  if (!label || label === 'unclassified') return 'bg-unclassified';
  // Heuristic: first project gets accent, second purple, third green, fall back to unclassified.
  // For now we expose a manual mapping via project_label string match.
  switch (label.toLowerCase()) {
    case 'oracle': return 'bg-accent';
    case "jackie's website":
    case 'jackies website': return 'bg-purple';
    case 'twb course':
    case 'twb': return 'bg-green';
    default: return 'bg-accent'; // user-defined projects default to accent
  }
}

function textOnColor(label: string | null): string {
  // Block text color: dark on light accents
  if (!label || label === 'unclassified') return 'text-text';
  return 'text-bg-deep';
}

export function SessionBlock({ session, pixelsPerMs, topOffsetPx, isLongestToday }: Props) {
  if (!session.end_time) return null;
  const effectiveMs = Math.max(0, session.end_time - session.start_time - session.paused_ms);
  const heightPx = Math.max(4, Math.round(effectiveMs * pixelsPerMs));
  const showLabel = effectiveMs >= 20 * 60_000; // labels only for focus blocks ≥20m
  const colorClass = colorForProject(session.project_label);
  const textColor = textOnColor(session.project_label);

  return (
    <div
      className={clsx(
        'absolute left-[30px] right-[18px] rounded-[5px] overflow-hidden',
        colorClass,
        textColor,
        showLabel ? 'px-3 py-1.5 font-semibold' : 'px-2',
      )}
      style={{ top: `${topOffsetPx}px`, height: `${heightPx}px` }}
      title={`${session.window_title ?? '(no title)'} · ${session.app_name ?? ''} · ${Math.round(effectiveMs / 60_000)} min`}
    >
      {showLabel && (
        <>
          {session.project_label ?? 'unclassified'} · {Math.round(effectiveMs / 60_000)} min
          {isLongestToday && (
            <span className="absolute right-2.5 top-1.5 text-[9px] bg-bg-deep text-accent px-1.5 py-0.5 rounded-[3px] font-bold">
              longest today
            </span>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/SessionBlock.tsx
git commit -m "feat(ui): SessionBlock — proportional bars, labels on focus blocks"
```

---

### Task 20: CalendarEventBlock component

**Files:**
- Create: `src/renderer/ui/CalendarEventBlock.tsx`

- [ ] **Step 1: Create the component**

```typescript
import React from 'react';
import clsx from 'clsx';
import type { CalendarEventDTO } from '@shared/types';

interface Props {
  event: CalendarEventDTO;
  pixelsPerMs: number;
  topOffsetPx: number;
}

function dotColor(status: CalendarEventDTO['status']): string {
  switch (status) {
    case 'kept': return 'bg-accent';
    case 'partial': return 'bg-green';
    case 'did-not-start': return 'bg-quiet';
  }
}

function fmtRange(startMs: number, endMs: number): string {
  const fmt = (ts: number) => {
    const d = new Date(ts);
    const h = d.getHours();
    const m = d.getMinutes();
    const period = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return m === 0 ? `${h12}${period}` : `${h12}:${m.toString().padStart(2, '0')}${period}`;
  };
  return `${fmt(startMs)} – ${fmt(endMs)}`;
}

function statusLine(event: CalendarEventDTO): string {
  if (event.status === 'kept') return 'kept';
  if (event.status === 'partial') {
    const actual = Math.round(event.overlapMs / 60_000);
    const scheduled = Math.round((event.endTimeMs - event.startTimeMs) / 60_000);
    return `${actual} of ${scheduled} min`;
  }
  return 'did not start';
}

export function CalendarEventBlock({ event, pixelsPerMs, topOffsetPx }: Props) {
  const heightPx = Math.max(24, Math.round((event.endTimeMs - event.startTimeMs) * pixelsPerMs));
  return (
    <div
      className="absolute left-[42px] right-[18px] border border-purple rounded-[5px] bg-[rgba(200,154,240,0.10)] text-purple px-2.5 py-1.5"
      style={{ top: `${topOffsetPx}px`, height: `${heightPx}px`, fontSize: '11px' }}
    >
      <div className="font-bold flex items-center gap-1.5">
        <span className={clsx('inline-block w-1.5 h-1.5 rounded-full', dotColor(event.status))} />
        {event.title}
      </div>
      <div className="opacity-85 text-[10px] mt-0.5">
        {fmtRange(event.startTimeMs, event.endTimeMs)} · {statusLine(event)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/CalendarEventBlock.tsx
git commit -m "feat(ui): CalendarEventBlock — outline + adherence dot"
```

---

### Task 21: ForwardNudge component

**Files:**
- Create: `src/renderer/ui/ForwardNudge.tsx`

- [ ] **Step 1: Create the component**

```typescript
import React from 'react';

interface Props {
  text: string | null;
}

export function ForwardNudge({ text }: Props) {
  if (!text) return null;
  return (
    <div className="bg-[rgba(232,176,109,0.12)] border-l-[3px] border-sand rounded-[4px] px-[14px] py-3 mb-6">
      <div className="text-[11px] text-sand mb-1.5 font-semibold">For the rest of today</div>
      <p className="text-[13px] text-text leading-[1.55] m-0">{text}</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/ForwardNudge.tsx
git commit -m "feat(ui): ForwardNudge component"
```

---

### Task 22: ProjectBreakdown component

**Files:**
- Create: `src/renderer/ui/ProjectBreakdown.tsx`

- [ ] **Step 1: Create the component**

```typescript
import React from 'react';
import clsx from 'clsx';
import type { ProjectBreakdownDTO } from '@shared/types';

interface Props {
  entries: ProjectBreakdownDTO[];
}

function fmtDuration(ms: number): string {
  const total = Math.floor(ms / 60_000);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function dotColorClass(label: string): string {
  if (label === 'unclassified') return 'bg-unclassified';
  switch (label.toLowerCase()) {
    case 'oracle': return 'bg-accent';
    case "jackie's website":
    case 'jackies website': return 'bg-purple';
    case 'twb course':
    case 'twb': return 'bg-green';
    default: return 'bg-accent';
  }
}

export function ProjectBreakdown({ entries }: Props) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[1.5px] text-muted font-semibold mb-2.5">Time by project</div>
      {entries.map((e) => (
        <div key={e.label} className="flex items-center gap-2 mb-2">
          <span className={clsx('w-2 h-2 rounded-[2px]', dotColorClass(e.label))} />
          <span className="text-[13px] text-text flex-1">{e.label === 'unclassified' ? 'Unclassified / other' : e.label}</span>
          <span className="text-[12px] text-muted">{fmtDuration(e.totalMs)}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/ProjectBreakdown.tsx
git commit -m "feat(ui): ProjectBreakdown component"
```

---

### Task 23: CalendarTodayList component

**Files:**
- Create: `src/renderer/ui/CalendarTodayList.tsx`

- [ ] **Step 1: Create the component**

```typescript
import React from 'react';
import clsx from 'clsx';
import type { CalendarEventDTO } from '@shared/types';

interface Props {
  events: CalendarEventDTO[];
}

function fmtStatusLine(event: CalendarEventDTO): { line: string; cls: string } {
  if (event.status === 'kept') {
    return { line: `✓ ${event.title} · kept`, cls: 'text-accent' };
  }
  if (event.status === 'partial') {
    const actual = Math.round(event.overlapMs / 60_000);
    const scheduled = Math.round((event.endTimeMs - event.startTimeMs) / 60_000);
    return { line: `✓ ${event.title} · partial (${actual} of ${scheduled} min)`, cls: 'text-accent' };
  }
  return { line: `— ${event.title} · did not start`, cls: 'text-muted' };
}

export function CalendarTodayList({ events }: Props) {
  if (events.length === 0) {
    return (
      <div className="bg-surface rounded-lg p-[14px] mb-5">
        <div className="text-[11px] text-muted font-semibold mb-2">Calendar today</div>
        <div className="text-[13px] text-muted">No events on your calendar today.</div>
      </div>
    );
  }
  return (
    <div className="bg-surface rounded-lg p-[14px] mb-5">
      <div className="text-[11px] text-muted font-semibold mb-2">Calendar today</div>
      <div className="text-[13px] leading-[1.8]">
        {events.map(e => {
          const { line, cls } = fmtStatusLine(e);
          return <div key={e.id} className={clsx(cls)}>{line}</div>;
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/CalendarTodayList.tsx
git commit -m "feat(ui): CalendarTodayList component"
```

---

## Phase F — Column composition

### Task 24: StoryColumn (left)

**Files:**
- Create: `src/renderer/ui/StoryColumn.tsx`

- [ ] **Step 1: Create the component**

```typescript
import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { DailyStatsDTO, ProjectBreakdownDTO, CalendarEventDTO, WeeklyGoalDTO } from '@shared/types';
import { TruthHeadline } from './TruthHeadline';
import { StatCard } from './StatCard';
import { CalendarTodayList } from './CalendarTodayList';
import { ForwardNudge } from './ForwardNudge';
import { ProjectBreakdown } from './ProjectBreakdown';

function fmtHours(ms: number): string {
  return (ms / 3_600_000).toFixed(1);
}

function generateNudgeText(
  goal: WeeklyGoalDTO | null,
  breakdown: ProjectBreakdownDTO[],
  anySessionsToday: boolean,
): string | null {
  // Mirror the logic in src/main/copy/forward-nudge.ts but executed renderer-side
  // for now. (Phase 2b/4 can move this to main if needed for Claude.)
  if (goal) {
    const matched = breakdown.find(b => b.label === goal.projectLabel);
    const progressMs = matched?.totalMs ?? 0;
    const fmt = (ms: number) => {
      const total = Math.floor(ms / 60_000);
      const h = Math.floor(total / 60);
      const m = total % 60;
      return h === 0 ? `${m}m` : `${h}h ${m}m`;
    };
    return `You said ${goal.text}. You've done ${fmt(progressMs)} on it. Your next 90 minutes is the easiest place to close the gap.`;
  }
  if (!anySessionsToday) return null;
  // top project = first in breakdown (already sorted desc by totalMs)
  const top = breakdown.find(b => b.label !== 'unclassified');
  if (!top) return null;
  return `You've returned to ${top.label} ${top.returnCount} times today. That's where your brain keeps wanting to land.`;
}

export function StoryColumn() {
  const api = useRemirror();
  const [stats, setStats] = useState<DailyStatsDTO | null>(null);
  const [breakdown, setBreakdown] = useState<ProjectBreakdownDTO[]>([]);
  const [events, setEvents] = useState<CalendarEventDTO[]>([]);
  const [goal, setGoal] = useState<WeeklyGoalDTO | null>(null);

  async function refresh() {
    const [s, bd, ev, g] = await Promise.all([
      api.todayStatsV2(),
      api.projectBreakdown(),
      api.calendarListToday(),
      api.getGoal(),
    ]);
    setStats(s);
    setBreakdown(bd);
    setEvents(ev);
    setGoal(g);
  }

  useEffect(() => {
    refresh();
    const off = api.onSessionsChanged(refresh);
    const interval = setInterval(refresh, 5000);
    return () => { off(); clearInterval(interval); };
  }, [api]);

  if (!stats) return <div className="text-muted p-6">Loading…</div>;

  const anySessions = stats.switchesCount > 0;
  const nudge = generateNudgeText(goal, breakdown, anySessions);

  return (
    <div className="p-6 border-r border-[#312d28] overflow-auto">
      <TruthHeadline stats={stats} />

      <div className="grid grid-cols-2 gap-2 mb-5">
        <StatCard label="Focus blocks ≥20m" value={stats.focusBlocksCount} emphasize />
        <StatCard label="Window switches" value={stats.switchesCount} />
        <StatCard label="Focused hours" value={fmtHours(stats.focusedMs)} emphasize />
        <StatCard label="Time elsewhere" value={fmtHours(stats.elsewhereMs)} />
      </div>

      <CalendarTodayList events={events} />

      <ForwardNudge text={nudge} />

      <ProjectBreakdown entries={breakdown} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/StoryColumn.tsx
git commit -m "feat(ui): StoryColumn composes left side of Today tab"
```

---

### Task 25: Timeline component (middle column)

**Files:**
- Create: `src/renderer/ui/Timeline.tsx`

The vertical timeline with proportional session blocks.

- [ ] **Step 1: Create the component**

```typescript
import React, { useEffect, useState, useMemo } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { Session, DailyStatsDTO } from '@shared/types';
import { SessionBlock } from './SessionBlock';

interface Props {
  workHoursStart?: string; // 'HH:MM'
  workHoursEnd?: string;
}

function parseHHMM(s: string | undefined, fallback: number): number {
  if (!s) return fallback;
  const [h, m] = s.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return fallback;
  return h * 60 + m;
}

export function Timeline({ workHoursStart, workHoursEnd }: Props) {
  const api = useRemirror();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [stats, setStats] = useState<DailyStatsDTO | null>(null);

  async function refresh() {
    const [s, st] = await Promise.all([
      api.recentSessions(500),
      api.todayStatsV2(),
    ]);
    // Filter to today only
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    setSessions(s.filter(x => x.start_time >= todayMs && x.end_time !== null));
    setStats(st);
  }

  useEffect(() => {
    refresh();
    const off = api.onSessionsChanged(refresh);
    const interval = setInterval(refresh, 5000);
    return () => { off(); clearInterval(interval); };
  }, [api]);

  const { timeRangeStart, timeRangeEnd, pixelsPerMs, totalHeight } = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    // Default range: 7am–10pm
    let startMs = todayMs + 7 * 3_600_000;
    let endMs = todayMs + 22 * 3_600_000;

    if (sessions.length > 0) {
      const earliest = Math.min(...sessions.map(s => s.start_time));
      const latest = Math.max(...sessions.map(s => s.end_time as number));
      startMs = Math.min(startMs, earliest);
      endMs = Math.max(endMs, latest);
    }

    const rangeMs = endMs - startMs;
    const totalHeight = 560; // pixels available for timeline body
    const pixelsPerMs = totalHeight / rangeMs;
    return { timeRangeStart: startMs, timeRangeEnd: endMs, pixelsPerMs, totalHeight };
  }, [sessions]);

  const tickHours = useMemo(() => {
    const start = new Date(timeRangeStart);
    start.setMinutes(0, 0, 0);
    const ticks = [];
    let cur = start.getTime();
    while (cur <= timeRangeEnd) {
      ticks.push(cur);
      cur += 3_600_000;
    }
    return ticks;
  }, [timeRangeStart, timeRangeEnd]);

  function topFor(ms: number): number {
    return (ms - timeRangeStart) * pixelsPerMs;
  }

  function fmtHourLabel(ts: number): string {
    const d = new Date(ts);
    const h = d.getHours();
    if (h === 0) return '12am';
    if (h === 12) return '12pm';
    return h < 12 ? `${h}` : `${h - 12}pm`;
  }

  // Work-hours band
  const todayStart = new Date(timeRangeStart);
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const whStart = todayMs + parseHHMM(workHoursStart, 9 * 60) * 60_000;
  const whEnd = todayMs + parseHHMM(workHoursEnd, 17 * 60) * 60_000;

  const longestId = stats?.longestBlock?.id ?? null;

  return (
    <div className="p-6 border-r border-[#312d28] relative bg-bg-deep" style={{ height: `${totalHeight + 60}px` }}>
      <div className="text-[10px] uppercase tracking-[1.5px] text-muted font-semibold mb-3.5">What you did</div>

      {/* Time tick labels */}
      {tickHours.map(ts => (
        <div
          key={ts}
          className="absolute text-[10px] text-quiet pl-1.5"
          style={{ left: 0, top: `${60 + topFor(ts)}px` }}
        >
          {fmtHourLabel(ts)}
        </div>
      ))}

      {/* Work-hours band */}
      <div
        className="absolute left-[30px] right-[18px] bg-[rgba(93,196,176,0.06)] border-l border-[rgba(93,196,176,0.22)] rounded-[2px]"
        style={{ top: `${60 + topFor(whStart)}px`, height: `${(whEnd - whStart) * pixelsPerMs}px` }}
      />

      {/* Session blocks */}
      {sessions.map(s => (
        <SessionBlock
          key={s.id}
          session={s}
          pixelsPerMs={pixelsPerMs}
          topOffsetPx={60 + topFor(s.start_time)}
          isLongestToday={s.id === longestId}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/Timeline.tsx
git commit -m "feat(ui): Timeline (middle column) — proportional vertical layout"
```

---

### Task 26: CalendarColumn (right)

**Files:**
- Create: `src/renderer/ui/CalendarColumn.tsx`

- [ ] **Step 1: Create the component**

```typescript
import React, { useEffect, useState, useMemo } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { CalendarEventDTO, GoogleStatusDTO } from '@shared/types';
import { CalendarEventBlock } from './CalendarEventBlock';

interface Props {
  workHoursStart?: string;
  workHoursEnd?: string;
}

function parseHHMM(s: string | undefined, fallback: number): number {
  if (!s) return fallback;
  const [h, m] = s.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return fallback;
  return h * 60 + m;
}

export function CalendarColumn({ workHoursStart, workHoursEnd }: Props) {
  const api = useRemirror();
  const [events, setEvents] = useState<CalendarEventDTO[]>([]);
  const [google, setGoogle] = useState<GoogleStatusDTO | null>(null);

  async function refresh() {
    const [ev, gs] = await Promise.all([api.calendarListToday(), api.googleStatus()]);
    setEvents(ev);
    setGoogle(gs);
  }

  useEffect(() => {
    refresh();
    const offGoogle = api.onGoogleStatusChanged(refresh);
    const offSessions = api.onSessionsChanged(refresh);
    const interval = setInterval(refresh, 5000);
    return () => { offGoogle(); offSessions(); clearInterval(interval); };
  }, [api]);

  const { timeRangeStart, timeRangeEnd, pixelsPerMs, totalHeight } = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    let startMs = todayMs + 7 * 3_600_000;
    let endMs = todayMs + 22 * 3_600_000;
    if (events.length > 0) {
      const earliest = Math.min(...events.map(e => e.startTimeMs));
      const latest = Math.max(...events.map(e => e.endTimeMs));
      startMs = Math.min(startMs, earliest);
      endMs = Math.max(endMs, latest);
    }
    const totalHeight = 560;
    return { timeRangeStart: startMs, timeRangeEnd: endMs, pixelsPerMs: totalHeight / (endMs - startMs), totalHeight };
  }, [events]);

  function topFor(ms: number): number {
    return (ms - timeRangeStart) * pixelsPerMs;
  }

  const todayStart = new Date(timeRangeStart);
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();
  const whStart = todayMs + parseHHMM(workHoursStart, 9 * 60) * 60_000;
  const whEnd = todayMs + parseHHMM(workHoursEnd, 17 * 60) * 60_000;

  if (google && !google.connected) {
    return (
      <div className="p-6 relative bg-bg-deep" style={{ height: `${totalHeight + 60}px` }}>
        <div className="text-[10px] uppercase tracking-[1.5px] text-muted font-semibold mb-3.5">Calendar — what you planned</div>
        <div className="text-muted text-sm mt-12">
          Connect Google Calendar in the Schedule tab to see what you planned alongside what you did.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 relative bg-bg-deep" style={{ height: `${totalHeight + 60}px` }}>
      <div className="text-[10px] uppercase tracking-[1.5px] text-muted font-semibold mb-3.5">Calendar — what you planned</div>

      {/* Work-hours band */}
      <div
        className="absolute left-[42px] right-[18px] bg-[rgba(93,196,176,0.06)] border-l border-[rgba(93,196,176,0.22)] rounded-[2px]"
        style={{ top: `${60 + topFor(whStart)}px`, height: `${(whEnd - whStart) * pixelsPerMs}px` }}
      />

      {events.map(e => (
        <CalendarEventBlock
          key={e.id}
          event={e}
          pixelsPerMs={pixelsPerMs}
          topOffsetPx={60 + topFor(e.startTimeMs)}
        />
      ))}

      {/* Legend */}
      <div className="absolute bottom-4 left-[42px] right-[18px] text-[10px] text-quiet leading-[1.6]">
        <div><span className="inline-block w-1.5 h-1.5 bg-accent rounded-full mr-1.5" />kept</div>
        <div><span className="inline-block w-1.5 h-1.5 bg-green rounded-full mr-1.5" />partial</div>
        <div><span className="inline-block w-1.5 h-1.5 bg-quiet rounded-full mr-1.5" />did not start</div>
      </div>

      {google?.lastError && (
        <div className="absolute top-12 right-4 text-[10px] text-sand">
          Calendar unavailable — {google.lastError}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/CalendarColumn.tsx
git commit -m "feat(ui): CalendarColumn — right column with adherence dots + legend"
```

---

### Task 27: Refactor Status.tsx to three-column layout

**Files:**
- Modify: `src/renderer/routes/Status.tsx`

Replace the existing Today tab body (stats cards + recent sessions list) with the new three-column composition.

- [ ] **Step 1: Update `src/renderer/routes/Status.tsx`**

```typescript
import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { EngineStatus, WorkHoursConfigDTO } from '@shared/types';
import { Button } from '../ui/Button';
import { ProjectEditor } from '../ui/ProjectEditor';
import { ExclusionEditor } from '../ui/ExclusionEditor';
import { WorkHoursEditor } from '../ui/WorkHoursEditor';
import { Logo } from '../ui/Logo';
import { StoryColumn } from '../ui/StoryColumn';
import { Timeline } from '../ui/Timeline';
import { CalendarColumn } from '../ui/CalendarColumn';
import clsx from 'clsx';

type Tab = 'today' | 'projects' | 'exclusions' | 'schedule';

interface Props {
  tab: Tab;
  onTabChange: (t: Tab) => void;
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
  const [workHours, setWorkHours] = useState<WorkHoursConfigDTO | null>(null);

  async function refreshStatus() {
    const [st, wh] = await Promise.all([api.getEngineStatus(), api.getWorkHours()]);
    setStatus(st);
    setWorkHours(wh);
  }

  useEffect(() => {
    refreshStatus();
    const off = api.onEngineStatusChanged(setStatus);
    const interval = setInterval(refreshStatus, 10_000);
    return () => { off(); clearInterval(interval); };
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
    <div className="min-h-full">
      <div className="flex items-center justify-between p-4 border-b border-[#312d28] px-6">
        <div className="flex items-center gap-3">
          <Logo size={22} />
          <h1 className="text-[15px] font-semibold text-text">{STATUS_LABEL[status]}</h1>
        </div>
        <div className="flex gap-4 text-xs">
          {tabBtn('today', 'Today')}
          {tabBtn('projects', 'Projects')}
          {tabBtn('exclusions', 'Exclusions')}
          {tabBtn('schedule', 'Schedule')}
        </div>
        <Button
          variant="ghost"
          onClick={() => status === 'paused' ? api.resumeCapture() : api.pauseCapture()}
        >
          {status === 'paused' ? 'Resume' : 'Pause'}
        </Button>
      </div>

      {tab === 'today' && (
        <div className="grid grid-cols-3 min-h-[640px]">
          <StoryColumn />
          <Timeline workHoursStart={workHours?.start} workHoursEnd={workHours?.end} />
          <CalendarColumn workHoursStart={workHours?.start} workHoursEnd={workHours?.end} />
        </div>
      )}

      {tab === 'projects' && <div className="p-6 max-w-4xl"><ProjectEditor /></div>}
      {tab === 'exclusions' && <div className="p-6 max-w-4xl"><ExclusionEditor /></div>}
      {tab === 'schedule' && <div className="p-6 max-w-4xl"><WorkHoursEditor /></div>}
    </div>
  );
}
```

- [ ] **Step 2: Run dev to visually verify**

```bash
npm run dev
```

Open Remirror, click Today tab. Should see the three-column layout. Without a Google connection the calendar column shows the "Connect Google Calendar in Schedule" prompt.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/routes/Status.tsx
git commit -m "feat(ui): Today tab → three-column layout (story/timeline/calendar)"
```

---

## Phase G — Settings UI

### Task 28: GoogleConnectButton + connect flow UI

**Files:**
- Create: `src/renderer/ui/GoogleConnectButton.tsx`

- [ ] **Step 1: Create the component**

```typescript
import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { GoogleStatusDTO } from '@shared/types';
import { Button } from './Button';

export function GoogleConnectButton() {
  const api = useRemirror();
  const [status, setStatus] = useState<GoogleStatusDTO | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setStatus(await api.googleStatus());
  }

  useEffect(() => {
    refresh();
    const off = api.onGoogleStatusChanged(setStatus);
    return off;
  }, [api]);

  async function handleConnect() {
    setBusy(true);
    try {
      await api.googleConnect();
    } finally {
      setBusy(false);
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      await api.googleDisconnect();
    } finally {
      setBusy(false);
    }
  }

  async function handleRefresh() {
    setBusy(true);
    try {
      await api.calendarRefresh();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!status) return <div className="text-muted text-sm">Loading…</div>;

  return (
    <div className="bg-surface rounded-lg p-4 border border-[rgba(250,247,240,0.07)]">
      <h4 className="text-sm font-semibold text-text mb-2">Google Calendar</h4>
      {status.connected ? (
        <>
          <p className="text-xs text-muted mb-3">
            Connected. {status.syncedAt ? `Last synced ${new Date(status.syncedAt).toLocaleTimeString()}.` : 'Sync pending.'}
            {status.lastError && <span className="text-sand"> ⚠ {status.lastError}</span>}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleRefresh} disabled={busy}>Refresh now</Button>
            <Button variant="ghost" onClick={handleDisconnect} disabled={busy}>Disconnect</Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted mb-3">
            Not connected. Connecting lets Remirror show what you planned alongside what you did.
            All data stays local. Setup instructions are in the project README.
          </p>
          <Button onClick={handleConnect} disabled={busy}>{busy ? 'Connecting…' : 'Connect Google Calendar'}</Button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/GoogleConnectButton.tsx
git commit -m "feat(ui): GoogleConnectButton — Settings card for OAuth + refresh"
```

---

### Task 29: GoalEditor

**Files:**
- Create: `src/renderer/ui/GoalEditor.tsx`

- [ ] **Step 1: Create the component**

```typescript
import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { WeeklyGoalDTO, Project } from '@shared/types';
import { Button } from './Button';
import { Input } from './Input';

export function GoalEditor() {
  const api = useRemirror();
  const [goal, setGoal] = useState<WeeklyGoalDTO | null>(null);
  const [draftText, setDraftText] = useState('');
  const [draftProject, setDraftProject] = useState<string>('');
  const [projects, setProjects] = useState<Project[]>([]);

  async function refresh() {
    const [g, p] = await Promise.all([api.getGoal(), api.listProjects()]);
    setGoal(g);
    setProjects(p);
    if (g) {
      setDraftText(g.text);
      setDraftProject(g.projectLabel ?? '');
    }
  }

  useEffect(() => { refresh(); }, [api]);

  async function save() {
    if (!draftText.trim()) return;
    const next = await api.setGoal({ text: draftText.trim(), projectLabel: draftProject || undefined });
    setGoal(next);
  }

  async function clearGoal() {
    await api.setGoal(null);
    setGoal(null);
    setDraftText('');
    setDraftProject('');
  }

  return (
    <div className="bg-surface rounded-lg p-4 border border-[rgba(250,247,240,0.07)]">
      <h4 className="text-sm font-semibold text-text mb-2">This week's goal</h4>
      <p className="text-xs text-muted mb-3">
        Used in the daily forward-looking nudge. One sentence — what you said you'd do this week.
      </p>
      <Input
        placeholder="e.g., Ship the Oracle dashboard"
        value={draftText}
        onChange={e => setDraftText(e.target.value)}
        className="mb-2"
      />
      <select
        className="w-full bg-bg text-text rounded-md px-3 py-2 outline-none ring-1 ring-transparent focus:ring-accent mb-3"
        value={draftProject}
        onChange={e => setDraftProject(e.target.value)}
      >
        <option value="">(optional) link to a project for adherence tracking…</option>
        {projects.map(p => <option key={p.id} value={p.label}>{p.label}</option>)}
      </select>
      <div className="flex gap-2">
        <Button onClick={save} disabled={!draftText.trim()}>Save goal</Button>
        {goal && <Button variant="ghost" onClick={clearGoal}>Clear</Button>}
      </div>
      {goal && (
        <p className="text-xs text-quiet mt-3">Set {new Date(goal.setAt).toLocaleString()}.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/ui/GoalEditor.tsx
git commit -m "feat(ui): GoalEditor — minimal weekly goal input"
```

---

### Task 30: Extend WorkHoursEditor to include Google + Goal

**Files:**
- Modify: `src/renderer/ui/WorkHoursEditor.tsx`

- [ ] **Step 1: Update `src/renderer/ui/WorkHoursEditor.tsx`**

Import the new components and add them under the existing work-hours UI:

```typescript
import React, { useEffect, useState } from 'react';
import { useRemirror } from '../hooks/useRemirror';
import type { WorkHoursConfigDTO } from '@shared/ipc-contract';
import { Input } from './Input';
import { GoogleConnectButton } from './GoogleConnectButton';
import { GoalEditor } from './GoalEditor';

export function WorkHoursEditor() {
  const api = useRemirror();
  const [cfg, setCfg] = useState<WorkHoursConfigDTO | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.getWorkHours().then(setCfg);
  }, [api]);

  async function save(next: WorkHoursConfigDTO) {
    setCfg(next);
    await api.setWorkHours(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (!cfg) return <div className="text-muted">Loading…</div>;

  return (
    <div className="space-y-8">
      <div>
        <div>
          <h3 className="text-lg font-medium mb-1">When do you usually work?</h3>
          <p className="text-muted text-sm mb-4">
            Remirror keeps recording around the clock — this just tells the daily brief how to structure your day.
          </p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={e => save({ ...cfg, enabled: e.target.checked })}
            className="w-4 h-4 accent-accent"
          />
          <span className="text-sm">Use a typical work schedule</span>
        </label>

        <div className={cfg.enabled ? '' : 'opacity-50 pointer-events-none'}>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="space-y-1">
              <label className="text-xs text-muted">Start time</label>
              <Input
                type="time"
                value={cfg.start}
                onChange={e => save({ ...cfg, start: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted">End time</label>
              <Input
                type="time"
                value={cfg.end}
                onChange={e => save({ ...cfg, end: e.target.value })}
              />
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={cfg.weekendsActive}
              onChange={e => save({ ...cfg, weekendsActive: e.target.checked })}
              className="w-4 h-4 accent-accent"
            />
            <span className="text-sm">Weekends count as work days</span>
          </label>
        </div>

        {saved && <p className="text-accent text-xs mt-2">✓ Saved</p>}
      </div>

      <GoalEditor />
      <GoogleConnectButton />
    </div>
  );
}
```

- [ ] **Step 2: Run dev and verify**

```bash
npm run dev
```

Schedule tab should now show: Work hours, Goal, Google Calendar — all stacked vertically with clear separators.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/ui/WorkHoursEditor.tsx
git commit -m "feat(ui): Schedule tab — add Google Calendar + Goal sections"
```

---

## Phase H — Polish + validation

### Task 31: Banned-vocabulary linter test

Mechanical compliance check: scan all renderer TSX strings for banned words.

**Files:**
- Create: `tests/copy/banned-vocab.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rendererDir = path.resolve(__dirname, '../../src/renderer');

const BANNED = [
  'should',
  'failed',
  'missed',
  'wasted',
  'drifted',
  'off-track',
  'skipped',
  'slipping',
  'broken streak',
  'lost focus',
  'gave up',
  'fell off',
  'neglected',
];

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
        // Strip code-symbol-ish lines (variable names, imports, types). Heuristic:
        // only flag inside string literals (single/double/backtick quoted) and JSX text.
        // Simple approach: lower-case everything and search; rule out lines that are clearly imports/comments.
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('import') || trimmed.startsWith('*')) return;
        const lower = line.toLowerCase();
        for (const w of BANNED) {
          // require word boundary so "should" doesn't match "shoulder" etc.
          const re = new RegExp(`\\b${w.replace(/[-]/g, '[-]')}\\b`, 'i');
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

- [ ] **Step 2: Run the test**

```bash
npm test -- tests/copy/banned-vocab.test.ts
```

Expected: PASS. If it fails, fix the copy in the offending files and re-run.

- [ ] **Step 3: Commit**

```bash
git add tests/copy/banned-vocab.test.ts
git commit -m "test: banned-vocabulary linter on renderer copy"
```

---

### Task 32: Resource budget verification + full sweep

Manual + automated verification of Phase 2a acceptance criteria.

**Files:** none — this is a verification pass.

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: all tests pass (Phase 1 tests + the new copy/stats/calendar/banned-vocab tests).

- [ ] **Step 2: Run typecheck + production build**

```bash
npm run typecheck && npm run build
```

Expected: both clean.

- [ ] **Step 3: Manual walkthrough using a fresh state**

Delete the existing DB and config to start clean:

```bash
rm -rf "$APPDATA/remirror/remirror.db"*
rm -rf "$APPDATA/remirror/config.json"
```

(On Windows PowerShell: `Remove-Item "$env:APPDATA\remirror\remirror.db*" -Force -ErrorAction SilentlyContinue; Remove-Item "$env:APPDATA\remirror\config.json" -Force -ErrorAction SilentlyContinue`)

Then `npm run dev` and walk through:

1. Onboarding shows with new coffee palette and updated accent
2. After onboarding, Today tab loads three columns
3. Switch between a few windows — see new session blocks in the middle column
4. Set a work-hours window — see the teal band appear behind both timeline columns
5. Schedule tab → set a weekly goal → Today tab → forward-looking nudge changes to goal-led copy
6. Schedule tab → "Connect Google Calendar" → OAuth flow opens browser → authorize → return to app → calendar events appear in the right column
7. The longest session of the day gets a "longest today" badge in the middle column
8. Stats cards: Focus blocks ≥20m, Window switches, Focused hours, Time elsewhere — match the actual data

- [ ] **Step 4: Resource budget check**

Open Task Manager (Windows) → find the Electron process. Sit idle for 10 minutes.

Expected:
- CPU at idle: < 0.5%
- CPU during active typing: < 2% sustained
- Main-process RSS: < 250 MB
- Renderer RSS: < 200 MB

If any threshold is violated, file a follow-up issue and address before tagging v0.2.0.

- [ ] **Step 5: Commit any minor fixes needed**

If anything was wrong, fix it and:

```bash
git add -A
git commit -m "chore: Phase 2a sweep fixes"
```

---

### Task 33: Tag v0.2.0

- [ ] **Step 1: Verify all 27 acceptance criteria from the spec are passing**

Open [`docs/superpowers/specs/2026-05-25-remirror-phase2a-design.md`](../specs/2026-05-25-remirror-phase2a-design.md) § 9 and check each criterion against the running app.

- [ ] **Step 2: Tag**

```bash
git tag -a v0.2.0 -m "Phase 2a — Timeline, switching metrics, Google Calendar integration"
```

- [ ] **Step 3: Phase 2a is done.** Move to Phase 2b design (screenshots + Claude classification).

---

## Self-review notes

**Spec coverage** — every section of the Phase 2a spec maps to at least one task:

- § 4 UI architecture → Tasks 17-27
- § 5 Color palette → Task 2
- § 6 Data model → Task 1
- § 7 Calendar integration → Tasks 6-10
- § 8 Copy guidelines → Tasks 3, 4, 31
- § 9 Acceptance criteria → Task 32 (manual walkthrough verifies all 27)

**Type consistency check:**
- `DailyStatsDTO` defined in Task 14, used identically in Tasks 17 (TruthHeadline), 19 (SessionBlock), 24 (StoryColumn), 25 (Timeline).
- `CalendarEventDTO` defined in Task 14, used identically in Tasks 20 (CalendarEventBlock), 23 (CalendarTodayList), 26 (CalendarColumn).
- `WeeklyGoalDTO` defined in Task 14, used in Tasks 24 (StoryColumn), 29 (GoalEditor), 15 (IPC handler).
- Method names: `todayStatsV2()` consistently used (distinct from Phase 1's `todayStats()` which returned the simpler `TodayStats` shape). The Phase 1 `todayStats` IPC handler still exists for backward compat.

**Placeholder scan:** None found in code blocks. All "TBD" / "TODO" patterns absent.

**Known scope risks:**
- Google OAuth requires the developer to set up a Google Cloud project (Task 6 is manual). Plan does not block on this for tasks 7-10 since those compile without credentials; runtime verification needs them.
- Phase 2a does not implement multi-day calendar navigation or back-dating. Spec is explicit about today-only scope.
