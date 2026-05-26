# Remirror — Phase 2a Design Spec

**Date:** 2026-05-25
**Phase:** 2a of 5 — Timeline UI + Switching Metrics + Calendar Integration
**Status:** Approved, ready for implementation planning
**Platform target:** Windows 10/11 (Phase 1 already running)
**Positioning:** ADHD-specific productivity tool. The mirror that tells the truth.

---

## 1. What Phase 2a is

Phase 2a transforms the Today tab from a static list of recent sessions into a **three-column visual mirror** of the day: narrative + stats on the left, the actual timeline of what happened in the middle, and the calendar of what was planned on the right. Both timeline columns share a vertical time axis so drift between intent and execution is visible at a glance.

This phase ships three things:

1. **A redesigned Today tab** — three-column layout, vertical timelines, perceptual color hierarchy
2. **New computed metrics** — focus blocks ≥20m, focused hours, time elsewhere, window switches (per day), longest block, calendar adherence (kept / partial / did-not-start)
3. **Google Calendar integration** — OAuth + sync, calendar events overlaid on the daily timeline, calendar-vs-actual adherence math

What Phase 2a is **NOT**:

- Not screenshot capture (Phase 2b)
- Not Claude API classification (Phase 2b)
- Not the daily brief (Phase 4)
- Not the weekly mirror (Phase 5)
- Not week/month historical views (deferred)

## 2. Scope decision — why 2a vs 2b

The original Phase 2 in the master spec bundled four features (screenshots + Claude classification + timeline + context-switch metric). During brainstorming we split it:

- **Phase 2a (this spec):** the visual layer + the metrics layer + calendar integration. Ships value fast. Doesn't require an Anthropic API key. Uses Phase 1's existing keyword classification.
- **Phase 2b (later spec):** screenshot capture + end-of-day Claude vision classification pass to fix mislabeled sessions. Requires user-provided API key.

This ordering means Phase 4 (the daily brief) will get the timeline data + the calendar metadata from 2a. When 2b ships, the brief gets better labels but the surface stays the same.

## 3. Design philosophy

Two experts shaped this design through the expert-council process.

**Dr. Maya Whitfield** (clinical psychologist, ADHD specialization) — established the **banned vocabulary** (`should`, `failed`, `missed`, `wasted`, `drifted`, `off-track`), the **forward-looking nudge** pattern, and the principle that **visual confrontation must be paired with a recovery surface**.

**Dr. Casey Mercer** (performance psychologist, ADHD coaching) — pushed back on Whitfield's "lead with the win, always" rule and replaced it with **lead with the truth**. Insisted the calendar comparison stays in 2a as the leverage point of the entire mirror. Rejected visual scaling tricks ("the mirror has to be true about proportions").

The synthesis: **the mirror tells the truth. The truth determines the words. Wins lead on good days, gaps lead on rough days. Bar lengths are proportional. Visual hierarchy comes from labels and badges, not from cheating the scale. Copy is direct without using shame words. Calendar comparison is shown, calendar comparison stays neutral.**

Crystallized context (the operating frame): [`CRYSTALLIZED-CONTEXT-adhd-design-frame.md`](./CRYSTALLIZED-CONTEXT-adhd-design-frame.md) — the synthesized expert guidance, principles, banned vocabulary, decision heuristics, and evaluation criteria distilled from the Whitfield × Mercer interrogation. Required reading for anyone implementing copy or UI surfaces.

## 4. UI Architecture — Today tab redesign

Three columns, equal width (1fr 1fr 1fr), full window height below the app header.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [Logo] Capture: Active        Today  Projects  Exclusions  Schedule    Pause │
├──────────────────────────────────────────────────────────────────────────────┤
│                  │                          │                                │
│    TODAY         │     WHAT YOU DID         │    CALENDAR — PLANNED          │
│    (left)        │     (middle)             │    (right)                     │
│                  │                          │                                │
│    Truth-led     │     Vertical timeline    │    Vertical timeline           │
│    headline      │     of actual sessions   │    of calendar events          │
│                  │     7am → 11pm           │    7am → 11pm                  │
│    4 stat cards  │     Color-coded by       │    Same time axis as middle    │
│                  │     project              │                                │
│    Calendar      │     Hero block badged    │    Outlined event cards        │
│    today list    │     ("longest today")    │    Adherence dot (kept/        │
│                  │                          │    partial/did-not-start)      │
│    Forward       │                          │                                │
│    nudge         │                          │                                │
│                  │                          │                                │
│    Time by       │                          │                                │
│    project       │                          │                                │
│                  │                          │                                │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Left column — TODAY

Five vertical sections, scrollable:

1. **Truth-led headline** (19px, ~1.35 line height)
   - Pattern: `"X hours Y minutes of focused work. Z hours W minutes elsewhere. Longest stretch: <X> min on <project> at <time>."`
   - Focused hours and longest-block project name are highlighted in accent teal `#5dc4b0`
   - On a "rough" day where focused < elsewhere, the headline still uses the same structure (the math determines the sentence; no template flip)
   - Generated at render time from session data — no AI required for Phase 2a

2. **Stat cards** (2x2 grid)
   - **Focus blocks ≥20m** — accent teal. Count of sessions where effective duration (end − start − paused_ms) ≥ 20 minutes AND `kind = 'work'`.
   - **Window switches** — warm white. Count of distinct session-open events today.
   - **Focused hours** — accent teal. Sum of effective duration for all `kind = 'work'` sessions today, in decimal hours (1 decimal).
   - **Time elsewhere** — warm white. Sum of `unclassified` work-kind sessions + `transition` sessions, in decimal hours.

3. **Calendar today list**
   - One line per calendar event for today's date.
   - Format: `<icon> <event title> · <status>`
   - Statuses: `kept`, `partial (X of Y min)`, `Z min vs Y scheduled`, `did not start`
   - Kept = ≥80% of scheduled time was spent on a session whose `project_label` matches the event's mapped project
   - Partial = 20–80%
   - Did not start = <20%

4. **Forward-looking nudge** (sand-colored `#e8b06d` accent strip)
   - Pattern: `"You said <commitment>. You've done <actual>. <Forward-looking observation>."`
   - Phase 2a hardcodes the commitment to whatever's in the user's stated weekly goal (manual entry — full goal system is Phase 5).
   - If no goal is set, the nudge surfaces the project the user has returned to most often today instead: *"You've returned to <project> N times today. That's where your brain keeps wanting to land."*
   - If no goal is set AND no sessions exist for today yet (e.g., first launch of the day, engine just started), hide the nudge surface entirely. Empty space is better than a meaningless invitation.

5. **Time by project** (bar list)
   - One row per project, sorted by descending duration
   - Color dot + project name + total time
   - "Unclassified / other" row at the bottom in warm grey-brown

### 4.2 Middle column — WHAT YOU DID

Vertical timeline, top = 7am, bottom = roughly 11pm (adjustable based on actual data range).

- **Time tick labels** down the left edge (7, 8, 9, 10, 11, 12, 1, 2, 3, 5pm) in muted warm-brown `#8a7f70`
- **Time range** — earliest session start to latest session end. If no sessions today, default to 7am–10pm. If a calendar event today extends earlier or later than any session, expand the range to include it.
- **Work-hours band** — translucent teal wash `rgba(93,196,176,0.06)` behind the time region defined by the user's work-hours config (defaults 9am–5pm). Subtle left border.
- **Session blocks** — absolute-positioned, height proportional to duration (1 minute = 1 pixel; minimum 4px for visibility)
  - Color by project: see § 5 (Color palette)
  - Focus blocks (≥20 min) get the full project label + duration as inline text
  - Switches <5 min get rendered as slivers with no inline text (label appears on hover)
  - Idle blocks: dashed warm-brown outline, transparent fill, label `"idle · Nm"`
- **Hero block badge** — the day's single longest block (regardless of project) gets a small `"longest today"` badge in the top-right corner of the block

**Interactions:**
- Hover a block → tooltip with full window title, app name, exact start/end times, duration, project label
- Click a block → opens reclassify popover (carried over from Phase 1)
- Right-click a block → context menu: delete, mark as personal (excludes from totals but keeps the row)

### 4.3 Right column — CALENDAR (what you planned)

Vertical timeline, same time axis as the middle column.

- **Same time tick labels** as middle column
- **Same work-hours band**
- **Calendar event cards** — outlined boxes (1px lavender `#c89af0`), translucent fill
  - Title + time range
  - **Adherence indicator dot** in the top-left of each event title:
    - Teal `#5dc4b0` = kept
    - Yellow-green `#bdd470` = partial
    - Warm grey `#8a7f70` = did not start
  - Status line below title: `"19 of 60 min"`, `"did not start"`, etc.
- **Legend** at the bottom of the column explaining the three dot colors

**Calendar source:** Google Calendar via OAuth. Phase 2a supports Google only; Outlook/Apple Calendar deferred.

**What we pull:** events from the user's primary calendar for today's date only. No recurring-event expansion logic; the Google API returns instances. All-day events ignored (Phase 2a). Declined events ignored. Events without a `summary` (title) ignored.

## 5. Color palette — locked

The palette migrates from Phase 1's cool dark to the **coffee editorial** family. This is a brand-level update; the Tailwind config, the SVG logo, the inline-SVG favicon, and the existing Phase 1 UI surfaces all migrate.

| Token | Hex | Use |
|---|---|---|
| `bg` | `#1a1816` | App background |
| `bg-deep` | `#0d0b09` | Timeline columns (carved wells) |
| `surface` | `#312d28` | Cards, stat blocks |
| `surface-border` | `rgba(250,247,240,0.07)` | Hairline borders on cards |
| `text` | `#faf7f0` | Primary body text (near-white, whisper of warmth) |
| `text-muted` | `#b8b1a4` | Labels, secondary text |
| `text-quiet` | `#8a7f70` | Time tick marks, legends |
| `accent` | `#5dc4b0` | **Brand accent — sage-teal**. Logo, focus blocks, wins, headline highlights, active tab |
| `purple` | `#c89af0` | Calendar events, "client work" project class |
| `green` | `#bdd470` | Other classified projects, "partial" adherence |
| `sand` | `#e8b06d` | Forward-looking nudge accent strip |
| `unclassified` | `#8a7f70` | Time-elsewhere blocks, warm grey-brown |
| `idle-outline` | `#4a4540` | Dashed border on idle blocks |

**Block text colors on colored backgrounds:**
- Text on `#5dc4b0` (teal): `#0d0b09` (bg-deep)
- Text on `#c89af0` (purple): `#1a1816` (bg)
- Text on `#bdd470` (green): `#1a1816`
- Text on `#8a7f70` (unclassified): `#faf7f0`

**Brand teal change:** Phase 1 used `#5fb6c4`. Phase 2a moves to `#5dc4b0`. This requires:
- Tailwind palette update (`tailwind.config.js`)
- Logo SVG source files update (`resources/icons/source/remirror-*.svg`)
- Regenerate `app.ico`, `tray.ico`, and the renderer PNG/SVG favicon via `npm run build:icons`
- Inline favicon data URI in `src/renderer/index.html` updated
- The Phase 1 "Capture: Active" colored text, the `accent` Tailwind class everywhere

## 6. Data model additions

### 6.1 New table: `calendar_events`

```sql
CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY,                  -- Google event ID
  date TEXT NOT NULL,                   -- YYYY-MM-DD local timezone
  start_time INTEGER NOT NULL,          -- Unix ms epoch
  end_time INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  attendees_count INTEGER DEFAULT 0,
  is_all_day INTEGER DEFAULT 0,
  declined INTEGER DEFAULT 0,
  project_label TEXT,                   -- mapped project (NULL if unmapped)
  source TEXT NOT NULL DEFAULT 'google',
  raw_json TEXT,                        -- the raw API response for debugging
  fetched_at INTEGER NOT NULL
);
CREATE INDEX idx_calendar_events_date ON calendar_events(date);
CREATE INDEX idx_calendar_events_start ON calendar_events(start_time);
```

Migration: `003_calendar_events.sql`.

### 6.2 New table: `daily_stats` (computed cache)

```sql
CREATE TABLE daily_stats (
  date TEXT PRIMARY KEY,                -- YYYY-MM-DD local timezone
  computed_at INTEGER NOT NULL,
  focus_blocks_count INTEGER NOT NULL,
  switches_count INTEGER NOT NULL,
  focused_ms INTEGER NOT NULL,
  elsewhere_ms INTEGER NOT NULL,
  longest_block_id TEXT,                -- references sessions(id)
  longest_block_ms INTEGER NOT NULL,
  calendar_kept INTEGER NOT NULL,
  calendar_partial INTEGER NOT NULL,
  calendar_missed INTEGER NOT NULL,
  raw_json TEXT                         -- the full computed snapshot
);
```

Migration: `004_daily_stats.sql`. Recomputed when the Today tab opens, and invalidated immediately on any engine `change` event (session open/close/reclassify) or when the 60-second cache TTL elapses, whichever comes first.

### 6.3 Schema additions to `projects`

Add `oauth_id` column for future calendar-event-to-project mapping convenience:

```sql
ALTER TABLE projects ADD COLUMN calendar_keywords TEXT NOT NULL DEFAULT '[]';
```

This is a JSON array of keywords used to match calendar event titles to projects (separate from the window-title keywords). If empty, the existing `keywords` column is used as fallback. Migration: `005_projects_calendar_keywords.sql`.

### 6.4 Settings additions in `electron-store`

```typescript
type Prefs = {
  // ... existing
  google: {
    refreshToken?: string;          // stored via Electron safeStorage
    calendarId: string;             // default 'primary'
    syncedAt?: number;
  };
  weeklyGoal?: {
    text: string;                   // free-form, e.g., "Ship Oracle dashboard"
    projectLabel?: string;          // optional binding to a project
    setAt: number;
  };
};
```

## 7. Calendar integration

### 7.1 OAuth flow

- Use `@google-cloud/local-auth` or equivalent for the desktop OAuth flow
- Required scope: `https://www.googleapis.com/auth/calendar.events.readonly`
- The OAuth flow opens the system browser, user authorizes, redirects to a local loopback callback (`http://127.0.0.1:0` — port chosen at runtime)
- Refresh token stored via `safeStorage` encrypted, written to `electron-store`
- A "Connect Google Calendar" CTA lives in the existing Settings UI (new section between Exclusions and Schedule tabs, or inside Schedule)

### 7.2 Sync cadence

- Initial sync on app startup if a refresh token exists
- Polling every 15 minutes thereafter, while the engine is `active` OR `excluded` (i.e., capture is running). Paused and off-hours pause polling too; resume restarts it. Stopped engine never polls.
- Manual "Refresh calendar" button in the UI
- Failed syncs are logged but never block the rest of the app; the right column shows "Calendar unavailable" with the last successful sync timestamp

### 7.3 Event-to-project mapping

The right column needs to know which sessions count toward each calendar event for the kept/partial/did-not-start math. Mapping happens in two stages:

1. **Explicit mapping** — if the user has set `calendar_keywords` on a project (e.g., `["jackie", "call with jackie"]`), any event whose title contains any of those keywords (case-insensitive) maps to that project.
2. **Implicit mapping** — if no explicit match, fall back to the project's regular `keywords` field. If still no match, the event is shown but no adherence math runs against it (status: "did not start" unless a project-matching session ran during the event window).

### 7.4 Adherence math

For each calendar event:

```
overlap_ms = total milliseconds where at least one session had project_label
             matching the event's mapped project AND the session's [start, end]
             overlapped with the event's [start, end]

event_duration_ms = event.end_time - event.start_time

adherence_ratio = overlap_ms / event_duration_ms

if adherence_ratio >= 0.80 → "kept"
if adherence_ratio >= 0.20 → "partial"
otherwise                  → "did not start"
```

Events without a mapped project always show "did not start" unless a session of any project happened during the event window (in which case: "partial, on another project").

## 8. Copy guidelines (operating frame)

Derived from the expert-council synthesis. Every user-facing string in Phase 2a must pass these rules.

### 8.1 Banned vocabulary

The following words MUST NOT appear in any user-facing surface:
- `should`, `failed`, `missed`, `wasted`, `drifted`, `off-track`, `skipped`, `behind`, `slipping`, `broken streak`, `lost focus`, `gave up`, `fell off`, `neglected`, `ignored`

A simple linter check on copy strings before commit is recommended (not required for Phase 2a but easy to add later).

### 8.2 Preferred vocabulary

`returned`, `restarted`, `kept`, `partial`, `did not start`, `came back to`, `found your way to`, `stretches of focus`, `moments where you`, `longest`, `your best`, `you started at`, `what worked today`, `you said`, `you've done`.

### 8.3 Truth-led headline pattern

Single sentence, generated from the day's data. Same structure regardless of day shape (good vs mixed vs rough):

```
{focusedHours} {focusedMinutes} of focused work.
{elsewhereHours} {elsewhereMinutes} elsewhere.
Longest stretch: {longestBlockMs} on {longestBlockProject} at {longestBlockStartTime}.
```

The numbers determine the emotional weight. Good day: focused > elsewhere, longest is impressive. Rough day: elsewhere > focused, longest is small. The mirror shows both.

### 8.4 Forward-looking nudge pattern

```
You said {commitment}. You've done {actualToward}. {observation}.
```

Where `{observation}` is computed:
- If a weekly goal is set and progress is below target pace → *"Your next {N} minutes is the easiest place to close the gap."*
- If progress is on or above pace → *"You're tracking ahead. Keep the current rhythm."*
- If no goal is set → *"You've returned to {topProject} {N} times today. That's where your brain keeps wanting to land."*

Phase 2a uses heuristic templates; Phase 4 will replace these with Claude-generated copy that reads less templated.

## 9. Acceptance criteria

Phase 2a is done when all of the following pass.

### Visual + layout (1–8)

1. Today tab renders three columns (`grid-template-columns: 1fr 1fr 1fr`) at the default 900×700 window size.
2. Timeline columns share an aligned vertical time axis from earliest session start to latest session end (or 7am–10pm if narrower).
3. The full coffee palette from § 5 is applied across the app, including Phase 1 surfaces (tray icon menu, status text, onboarding).
4. The brand logo, app icon, tray icon, and favicon all reflect the new accent teal `#5dc4b0`.
5. Hairline borders on cards are visible against the bg in a screenshot test (no anti-aliasing collapse).
6. Hero "longest today" badge appears on exactly one session block per day.
7. Switches <5min appear as visual slivers with no inline label, but their tooltip on hover shows full info.
8. Idle blocks render as dashed-outline transparent boxes labeled "idle · Nm".

### Metrics correctness (9–14)

9. "Focus blocks ≥20m" counter matches `SELECT COUNT(*) FROM sessions WHERE date(start_time) = today AND kind='work' AND (end_time - start_time - paused_ms) >= 1200000`.
10. "Window switches" counter matches `SELECT COUNT(*) FROM sessions WHERE date(start_time) = today AND end_time IS NOT NULL`.
11. "Focused hours" = sum of effective durations for `kind='work'` sessions today, rounded to 1 decimal.
12. "Time elsewhere" = sum of effective durations for `kind='transition'` + sessions with `project_label='unclassified'`, rounded to 1 decimal.
13. "Longest block" matches the session with maximum effective duration today; the headline names its project + start time.
14. The truth-led headline regenerates correctly across day boundary changes (midnight test — open the app at 11:59pm and 12:01am; the headline reflects the new day's data).

### Calendar integration (15–20)

15. Google Calendar OAuth flow completes end-to-end from a fresh state: click "Connect Google Calendar" → system browser opens → user authorizes → refresh token written to `electron-store` via safeStorage → first sync runs → today's events appear in the right column.
16. Polling every 15 minutes pulls latest events; manual "Refresh" works.
17. All-day events and declined events are excluded from the right column.
18. Each event shows the correct adherence dot (kept / partial / did-not-start) given the actual session data.
19. Adherence math: a project-matched session covering ≥80% of an event's time window flags "kept"; 20–79% flags "partial"; <20% flags "did not start".
20. Calendar unavailable (network down, expired token) gracefully shows "Calendar unavailable" with last successful sync timestamp; no crash; engine continues running.

### Copy compliance (21–24)

21. No user-facing string in the renderer contains any banned word from § 8.1 (a one-time grep at commit time passes).
22. The truth-led headline follows the structure in § 8.3 verbatim (numbers substituted, structure preserved).
23. The forward-looking nudge follows the three-pattern logic in § 8.4 depending on goal state.
24. Calendar adherence labels in the left column "Calendar today" list use only: "kept", "partial (X of Y min)", "did not start". No moral framing.

### Resource budget (25–27)

25. Today tab first paint < 500ms on a fresh open with 100 sessions in DB.
26. Calendar sync (foreground) completes < 3 seconds when network is available.
27. Memory footprint unchanged from Phase 1 baseline (main process RSS < 250 MB, renderer RSS < 200 MB).

## 10. Out of scope

Pulled out explicitly to prevent scope creep:

- **Screenshot capture and Claude vision classification** — Phase 2b
- **Daily brief** (the Claude-written narrative) — Phase 4
- **Weekly mirror** + 10% improvement target — Phase 5
- **Outlook / Apple Calendar / iCloud integration** — Phase 2c or later
- **Multi-day timeline view** (yesterday, last week) — Phase 3+
- **Drag-to-reclassify, drag-to-merge sessions** — Phase 3+
- **Customizable color palette per project** — Phase 3+
- **Light mode** — deferred indefinitely
- **Weekly goal UI** — Phase 5 will own this; Phase 2a reads from `electron-store` if present, surfaces a placeholder if not
- **Calendar event creation/editing from within Remirror** — read-only forever
- **Notification-style "you're drifting" alerts** — explicitly declined per Whitfield/Mercer synthesis

## 11. Open questions for implementation

These need answers before writing-plans, but not before this spec ships:

1. **Where does the "Connect Google Calendar" CTA live?** Inside the existing Schedule tab, or as a new tab? Inside Schedule is simpler.
2. **Should calendar events also surface in the middle column** as a translucent background hint behind matching sessions? Phase 2a default: no (calendar lives in right column only). Revisit after first usage.
3. **What's the exact ratio of column widths if the user resizes the window narrower than 900px?** Default Phase 2a: stack vertically below 700px; horizontal below that. Single column < 500px.
4. **Sessions that span midnight** — does a session starting 11:50pm and ending 12:30am count toward day A or day B? Phase 2a rule: counts toward the day of `start_time`. Same as Phase 1.

## 12. Definition of done

When all 27 acceptance criteria pass and a manual walkthrough confirms the UX feels right (especially: opening on a rough day doesn't feel shame-inducing; opening on a good day feels validating; the calendar comparison feels useful, not punishing), Phase 2a ships as v0.2.0.

Phase 2b (screenshots + Claude classification) begins design immediately after.
