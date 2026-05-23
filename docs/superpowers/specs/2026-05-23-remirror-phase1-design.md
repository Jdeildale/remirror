# Remirror — Phase 1 Design Spec

**Date:** 2026-05-23
**Phase:** 1 of 5 — Capture Engine + Foundation
**Status:** Approved, ready for implementation planning
**Platform target:** Windows 10/11 (Mac follow-on after Phase 1 stabilizes)
**Positioning:** ADHD-specific productivity tool, sold as a commercial product

---

## 1. What we are building

Remirror is a desktop application that silently records what the user is working on by passively observing window focus, window titles, cursor location, and idle state. It writes that record to a local SQLite database. It never asks the user to log anything.

Phase 1 ships the **capture engine and its foundation**: a tray-resident Electron app that records work sessions to disk, classifies them by simple keyword matching against user-defined projects, respects an exclusion list (password managers, banking, private messaging), and exposes a minimal UI for the user to verify capture is working and to correct misclassified sessions.

Phase 1 deliberately does *not* include: screenshots, Claude API calls, vision-based classification, the timeline UI, the daily brief, the weekly mirror, goal alignment scoring, or Zoom/Fathom integration. Each of those layers on top of a working capture engine and gets its own design pass.

### Why ADHD-first matters here

Every architectural decision in this spec is filtered through one rule: **does this help someone with ADHD look back at their week and recognize what actually happened, without making them feel bad?** The two-tier idle handling, the no-judgment language in all UI strings, the deliberate refusal to label time as "wasted," the trimmed onboarding — these are not stylistic choices. They are product requirements.

---

## 2. Stack and project structure

Mirrors the sibling Electron app (Voycer), with deviations called out.

**Runtime + build:**
- Electron 32+ • TypeScript • electron-vite • electron-builder (NSIS target for Windows)
- React 18 + Tailwind 3 in the renderer
- No Zustand in Phase 1 — `useState` covers the small surface area. Add when Phase 2 introduces the timeline UI.

**Storage and persistence:**
- `better-sqlite3` for the local database (sync API, ideal for the Electron main process)
- `electron-store` for non-sensitive preferences
- Electron's `safeStorage` API for any API keys (none used in Phase 1, but the slot exists from day one)

**OS integration:**
- `get-windows` for foreground window + title (the current name of the package historically called `active-win`)
- `uiohook-napi` for global input events — used to gate the capture poll loop so idle CPU stays near zero
- Electron's built-in `screen` module for cursor position and display mapping
- Electron's built-in `powerMonitor` for lock/suspend/idle handling

**Diagnostics and AI:**
- `electron-log` writing to `%APPDATA%\Remirror\logs\main.log`
- `@anthropic-ai/sdk` (current version) installed but **not called** in Phase 1 — present so Phase 2 work doesn't require a dependency bump

**App identity:**
- App ID: `com.remirror.app`
- All branding strings (app name, tray menu labels) live in one config file so a future rename is one change

### Layout

```
remirror/
├─ src/
│  ├─ main/
│  │  ├─ index.ts                 # bootstrap, single-instance lock, tray init
│  │  ├─ tray.ts                  # tray icon + menu
│  │  ├─ hotkey.ts                # global shortcut (default Alt+Shift+R)
│  │  ├─ ipc.ts                   # main↔renderer bridge
│  │  ├─ store.ts                 # electron-store wrapper
│  │  ├─ db/
│  │  │  ├─ index.ts              # connection, PRAGMAs, orphan recovery on startup
│  │  │  ├─ migrate.ts            # numbered .sql migrator
│  │  │  └─ migrations/           # 001_init.sql, 002_seed_exclusions.sql
│  │  ├─ capture/
│  │  │  ├─ engine.ts             # singleton orchestrator: start/stop/pause/resume
│  │  │  ├─ window-poller.ts      # get-windows + input-event gating
│  │  │  ├─ cursor.ts             # cursor → display mapping
│  │  │  ├─ exclusions.ts         # exclusion-match check
│  │  │  ├─ classifier.ts         # keyword matcher
│  │  │  ├─ sessions.ts           # open/close/heartbeat/pause logic
│  │  │  └─ idle.ts               # powerMonitor + 2-tier idle handler
│  │  └─ windows/
│  │     ├─ main-window.ts        # hotkey-opened main window
│  │     └─ create.ts             # shared BrowserWindow factory
│  ├─ preload/
│  │  └─ index.ts                 # contextBridge surface
│  ├─ shared/
│  │  ├─ types.ts                 # types used by both main and renderer
│  │  └─ ipc-contract.ts          # IPC channel names + payload types
│  └─ renderer/
│     ├─ index.html
│     ├─ index.tsx
│     ├─ routes/
│     │  ├─ Onboarding.tsx
│     │  └─ Status.tsx
│     └─ ui/                      # shared components
├─ resources/
│  └─ icons/                      # tray .ico and app icon
├─ scripts/
│  └─ build-icons.mjs             # generates platform icons from source SVG
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ tailwind.config.js
├─ postcss.config.js
├─ tsconfig.json
├─ package.json
└─ docs/superpowers/specs/        # this file lives here
```

---

## 3. The capture engine

This is the heart of Phase 1. The engine's only job is to produce honest session records.

### Trigger model

The spec called this "event-driven." On Windows, there is no Node-accessible OS event for foreground-window-change without writing a native addon against `SetWinEventHook`. The practical equivalent — and what we ship — is **input-gated polling**:

```
on input event (keyboard or mouse) via uiohook-napi:
  mark "input seen at now"
  if no tick is already scheduled within 1500ms, schedule one

on each scheduled tick (only fires if input was seen recently):
  1. read cursor position           → screen.getCursorScreenPoint()
  2. read foreground window         → get-windows()
  3. read system idle seconds       → powerMonitor.getSystemIdleTime()
  4. apply the state machine below

if no input for 30 seconds:
  cancel any pending tick
  rely on powerMonitor.on('suspend' | 'lock-screen') for state transitions
```

**Result:** at the keyboard, ticks happen at most every 1.5s. Sitting idle, the tick loop sleeps to zero. This honors the spec's "event-driven" intent and the < 2% CPU constraint, comfortably.

### Idle handling (two-tier)

The spec did not include idle handling. Without it, walking away counts as work — which destroys the data's integrity. The model:

| Idle duration | What the engine does |
|---|---|
| 0–120s | Session continues normally. Thinking, reading, conversation. Counts as work. |
| 120–600s | Session is **paused**. The row stays open, but `paused_ms` accumulates. Reported duration excludes the pause. |
| > 600s | Session is **closed retroactively**. `end_time = idle-start-timestamp` (i.e., the moment activity stopped, not "now"). |

When the user resumes activity after a long idle, the next tick opens a fresh session normally.

### Sleep, lock, and quit

| Event | Handler | Action |
|---|---|---|
| `powerMonitor.on('suspend')` | `idle.ts` | Close current session, `end_time = now` |
| `powerMonitor.on('lock-screen')` | `idle.ts` | Close current session, `end_time = now` |
| `powerMonitor.on('resume' \| 'unlock-screen')` | `idle.ts` | No-op; next tick opens a new session normally |
| `app.on('before-quit')` | `engine.ts` | Close current session, flush WAL, close DB |

### Crash recovery on startup

On startup, `db/index.ts` runs:

```sql
UPDATE sessions
SET end_time = MIN(start_time + 300000, ?)  -- start + 5min, capped at "now"
WHERE end_time IS NULL;
```

This closes any orphans from a previous crash or hard-quit with a conservative duration estimate. Anything older than an hour is closed at `start_time` exactly (zero-duration, will be filtered from summaries).

### Session lifecycle on a "change" tick

```
tickInputGated() {
  if currently in exclusion app:
    closeCurrentSession(end_time = now)
    return  // do not open a new session

  if foreground window unchanged AND title unchanged:
    if 90s since last heartbeat:
      heartbeat: write end_time = now on the current session
    return

  // something changed → transition
  closeCurrentSession(end_time = now)
  classification = keywordMatch(app, title)
  display_id = displayContainingCursor()
  openNewSession(app, title, display_id, classification)
}
```

### Cursor-as-attention — what we ship vs. what the spec promised

The spec said: *"If cursor is on Display 2 but the active window is on Display 1, classify based on what is on Display 2 — use `screen.getDisplayNearestPoint()` to identify what app is under the cursor."*

This does not work as described. `screen.getDisplayNearestPoint()` returns the **display**, not the **window** under the cursor. Hit-testing windows by cursor position requires a native addon (`WindowFromPoint` on Win32) and full window enumeration.

**Phase 1 ships the honest version:** we record `display_id` (which monitor the cursor was on) but credit work to the **foreground window**, not "the window under the cursor." The multi-monitor refinement is documented as a Phase 2+ item and called out as a known limitation.

### Classification

Keyword matching only in Phase 1. Loaded from the `projects` table at engine startup, refreshed on any project edit:

```
for each project in projects:
  for each keyword in project.keywords:
    if window_title.lower().includes(keyword.lower())
       OR app_name.lower().includes(keyword.lower()):
      return { label: project.label, confidence: 1.0 }
return { label: 'unclassified', confidence: 0 }
```

No Claude API. No vision. The first match wins (project order matters — handled in the UI by allowing reorder later).

### Engine API

```typescript
class CaptureEngine {
  start(): void              // begin input gating + tick loop
  stop(): void               // close current session, stop everything
  pause(): void              // close current session, mark engine 'paused' (tray reflects)
  resume(): void             // start() again
  status(): EngineStatus     // 'active' | 'paused' | 'excluded' | 'stopped'
}
```

Single instance, lives in `main`, exposed to renderer via IPC.

---

## 4. Database

### Schema

Single migration file (`001_init.sql`) creates all tables Phases 1–5 will need. Subsequent phases add migrations rather than rewrite this one.

```sql
-- Sessions: the core record
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                -- ULID
  start_time INTEGER NOT NULL,        -- Unix ms epoch
  end_time INTEGER,                   -- NULL while session is open
  app_name TEXT,
  window_title TEXT,
  display_id INTEGER,                 -- which monitor cursor was on at session start
  project_label TEXT,                 -- 'unclassified' if no keyword match
  confidence REAL DEFAULT 0,          -- 1.0=keyword, 0.8=vision, 0.5=title-only, 0=none
  kind TEXT NOT NULL DEFAULT 'work',  -- work|transition|meeting|idle|excluded
  frames_sampled INTEGER DEFAULT 0,   -- reserved for Phase 2 (screenshots)
  paused_ms INTEGER DEFAULT 0         -- accumulated idle-pause time within this session
);
CREATE INDEX idx_sessions_start_time ON sessions(start_time);
CREATE INDEX idx_sessions_project_label ON sessions(project_label);
CREATE INDEX idx_sessions_kind ON sessions(kind);

-- Projects: user-defined work categories
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  category TEXT,                      -- e.g., 'client-work', 'internal', 'personal'
  keywords TEXT NOT NULL DEFAULT '[]',-- JSON array of strings
  goal_id TEXT,                       -- nullable, used in Phase 4/5
  display_order INTEGER DEFAULT 0     -- so user can reorder in UI
);

-- Exclusions: apps/titles never captured
CREATE TABLE exclusions (
  id TEXT PRIMARY KEY,
  app_name TEXT,                      -- match if app_name EQUALS this (case-insensitive)
  window_title_contains TEXT,         -- match if window_title CONTAINS this (case-insensitive)
  reason TEXT                         -- free text for the user's reference
);

-- Reserved for later phases — created now to avoid future migrations
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

-- Migration tracker
CREATE TABLE _migrations (
  filename TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
```

### Connection setup

Every connection runs these PRAGMAs:

```sql
PRAGMA journal_mode = WAL;          -- concurrent reads while writes happen
PRAGMA foreign_keys = ON;           -- enforce FK constraints (off by default!)
PRAGMA synchronous = NORMAL;        -- safe with WAL, much faster than FULL
```

### Migration runner

`db/migrate.ts` reads `migrations/*.sql` in alphanumeric order, checks `_migrations` for what has run, applies missing ones inside a transaction, and inserts a row per applied file. Idempotent.

### Seed exclusions (`002_seed_exclusions.sql`)

Inserted only if not already present:

- App name (exact, case-insensitive): `1Password`, `Bitwarden`, `Keychain Access`, `Messages`, `iMessage`, `WhatsApp`, `Signal`, `Telegram`, `FaceTime`
- Title contains (substring, case-insensitive): `password`, `bank`, `chase`, `login`, `sign in`, `2fa`, `authentication`

User can add their own from the Settings UI.

### Data location

`%APPDATA%\Remirror\remirror.db` (resolved via `app.getPath('userData')`). The directory also holds the WAL/SHM files and the `logs/` folder. Uninstalling the app and deleting this folder removes all Remirror data.

---

## 5. First-run onboarding

**Trigger:** `SELECT COUNT(*) FROM projects` returns 0.

**Flow** — three screens, one window:

1. **Projects.** "Tell Remirror what you work on."
   List editor with rows of `{label, keywords}`. Empty state shows two placeholder rows with generic examples (`Project A — projecta, client-work` / `Project B — internal, dev`) and helper text that explains keywords match window titles and app names. User edits/adds rows, presses Continue.

2. **Exclusions.** "These apps and windows are never recorded."
   Shows the seeded default list as a read-only block (so the user sees they're protected by default). Below it, an editor for adding custom exclusions: app-name match or title-substring match. Press Continue.

3. **You're done.**
   "Capture starts now. Remirror lives in your tray. Press Alt+Shift+R any time to open it." Single "Got it" button closes the window and signals the engine to start.

### Engine start timing

- **First run** (`projects` table is empty): on `app.whenReady`, the engine is *initialized but not started*. The onboarding window opens. The engine `start()` call fires only after the user clicks "Got it" on step 3.
- **Subsequent runs:** on `app.whenReady`, after the DB connection opens and migrations apply, the engine `start()` is called immediately. The main window does not open unless the user invokes the hotkey or clicks the tray icon.

**Re-running:** the tray menu's **Settings…** entry opens the same window with the steps repurposed as tabs (Projects / Exclusions). Same React components, different shell. Onboarding code is reused, not duplicated.

---

## 6. Tray and main window

### Tray

- Monochrome mirror-glyph icon (`.ico`). Placeholder art for Phase 1; real icon design later.
- Tooltip reflects engine status: "Remirror — Active", "Remirror — Paused", "Remirror — Excluded app active".
- Status dot color: green (active), amber (paused), gray (excluded app currently in focus).

### Tray menu (right-click)

```
Open Remirror              Alt+Shift+R
─────────────────────
● Capture: Active
  └ Pause Capture
─────────────────────
Settings…
─────────────────────
About
Quit
```

(*"Open Remirror" lands on the status route, which already shows the recent-sessions list — no separate "Recent sessions…" entry needed.*)

### Hotkey

Default: `Alt+Shift+R`. Registered via `globalShortcut`. Configurable in Settings (stored in `electron-store`). Single-click on the tray icon opens the main window as well.

### Main window — Phase 1 routes

- `/onboarding` — the 3-step flow above.
- `/status` — the day-of view:
  - "Capture: Active" / "Paused" headline
  - Today's quick stats: total sessions, top 3 projects by total time, longest single block
  - Recent 20 sessions as a plain list: `HH:MM • app • title • detected project label`
  - Each row has a small "Set project ▾" button for manual reclassification
  - "Pause / Resume" toggle

### Window behavior

- Opens centered at 900×700, resizable
- Closing the window (X) hides it back to the tray; does not quit
- Quitting only via tray menu or `Cmd/Ctrl+Q` while window has focus
- `setSkipTaskbar(true)` on Windows so the app doesn't clutter the taskbar when running

---

## 7. Cross-cutting requirements

Things that are not features but without which Phase 1 produces unreliable data:

| Item | Why |
|---|---|
| `app.requestSingleInstanceLock()` | Two instances = duplicate rows + DB lock contention |
| `uiohook-napi` input gating | Drops idle CPU to ~zero; the practical version of "event-driven" |
| 2-tier idle handling | 5-minute close kills ADHD thinking blocks; <120s pause is work |
| `powerMonitor` lock/suspend handlers | Sleep otherwise counts as "working" |
| `before-quit` session close | Quitting otherwise leaves dangling NULL `end_time` rows |
| Startup orphan recovery | Cleans up any NULL `end_time` rows from a previous crash |
| WAL + `foreign_keys=ON` + `synchronous=NORMAL` | Concurrency + FK enforcement + speed |
| Numbered SQL migrations | Schema evolves every phase; doing this on day 1 costs nothing |
| `electron-log` to `%APPDATA%\Remirror\logs\` | Without logs, debugging a silent background app is impossible |
| Window-close → hide-to-tray | Otherwise users quit accidentally and tracking stops |

---

## 8. Commercialization constraints

Remirror is being built as a standalone product, eventually sold to other ADHD users. These rules apply from day one:

1. **Zero telemetry.** No Sentry, no PostHog, no Segment, no analytics SDK of any kind. "All data stays local" is the trust proposition. Any future error-reporting is opt-in only.
2. **No bundled API key.** When Phase 2+ requires Claude, the user provides their own Anthropic key in Settings. BYOK is the sustainable model. The slot exists in `electron-store` from day one.
3. **No personal references in shipped code.** No "Jesse," no real project names, no Voycer in user-facing strings. Generic placeholders only in onboarding examples.
4. **All branding in one config file.** App name, tray strings, window titles. A future rename is one change.
5. **License-key field reserved in `electron-store` from day one.** Phase 1 does not validate it; later phases can without a refactor.

---

## 9. Acceptance criteria

Phase 1 is done when all 24 of these pass.

### Engine correctness

1. App starts on launch, hides to tray, no taskbar entry (`setSkipTaskbar(true)`).
2. Switching between two windows produces exactly 2 sessions in `sessions` (verified by `SELECT * FROM sessions ORDER BY start_time DESC LIMIT 5`).
3. Opening 1Password produces zero new rows; the previous session is closed at the moment 1Password came to the foreground.
4. Walking away for 3 minutes shows the open session's `paused_ms` growing during the idle window, then activity resumes.
5. Walking away for 15+ minutes shows the session closed retroactively with `end_time` equal to when activity stopped (not when the close was detected).
6. Locking the screen closes the current session immediately.
7. Closing the laptop / sleep closes the current session immediately.
8. Hard-killing the process, then restarting, finds the orphan session and closes it with a conservative duration.

### Classification

9. With a project named "Project A" and keywords `["projecta", "client-work"]`, a window titled `client-work · main · VS Code` gets `project_label='Project A'`, `confidence=1.0`.
10. With no keyword match, the session gets `project_label='unclassified'`, `confidence=0`.
11. Clicking the "Set project ▾" button on a session row in the status view and choosing a project updates the row and sets `confidence=1.0`.

### UX

12. Tray icon shows green / amber / gray correctly across active / paused / exclusion states.
13. Hotkey `Alt+Shift+R` opens the main window; pressing it again with the window open focuses it (no second window).
14. First launch shows onboarding; second launch goes straight to `/status`.
15. The status view's session counts and recent list update without requiring a manual refresh.

### Resource budget

16. Idle CPU (laptop sitting untouched, no input for 10 minutes): **sustained < 0.5%**.
17. Active CPU (typing in VS Code, switching tabs): **average < 2%**, peak < 5%.
18. Memory: main-process RSS **< 250 MB**.
19. Disk write traffic while idle: **zero** (no heartbeats fire when there is no active session).
20. Disk write traffic during active use: **< 10 writes/minute** including heartbeats.

### Privacy and safety

21. DB file lives at `%APPDATA%\Remirror\remirror.db` and opens cleanly in DB Browser for SQLite.
22. No screenshots are captured anywhere in Phase 1 — `screenshots` table stays empty, no files appear in `%APPDATA%\Remirror\`.
23. Network monitor shows **no outbound calls** during a normal session (Anthropic SDK is installed but never invoked).
24. The exclusion check is case-insensitive on both app names and title substrings. `Chase Bank Login - Google Chrome` is excluded by the `bank` substring.

---

## 10. Out of scope for Phase 1

Pulling any of these into Phase 1 will be refused unless the design is re-opened explicitly:

- Screenshot capture (Phase 2)
- Any Claude API calls or vision-based classification (Phase 2)
- Timeline / Gantt UI, context-switch metric, fragmentation score (Phase 2)
- Zoom + Fathom meeting integration (Phase 3)
- Daily brief, weekly mirror, goal alignment scoring (Phase 4, Phase 5)
- Weekly target system (Phase 5)
- Multi-monitor "window under cursor" hit-testing (deferred; Phase 1 stores `display_id` only)
- Mac build (Windows-first; Mac added once Phase 1 is stable)
- Auto-updater (added once a release channel exists)
- License key validation (slot exists; no check until a billing phase)
- CSV / JSON export (post-Phase-5 polish)
- Settings beyond projects + exclusions + hotkey (e.g., log viewer, theme picker)

---

## 11. Open questions deferred to later phases

- **Fathom API access.** Phase 3 assumes Jesse has API access. Confirm before Phase 3 design.
- **The "window under cursor" implementation.** Native addon vs. window-enumeration-with-bounds-hit-test. Decided in Phase 2.
- **Daily-brief and weekly-mirror prompt versioning.** Prompts are part of the shipped binary; we need a mechanism to update them across releases. Decided in Phase 4.
- **Licensing and billing model.** Subscription vs. one-time vs. freemium. Decided when ready to ship to first paying customer.

---

## 12. Done definition for this spec

This document is the input to the implementation planning phase. When all 24 acceptance criteria in Section 9 pass, Phase 1 ships as v0.1.0 and Phase 2 design begins.
