# Remirror v0.3.0 Audit — Fix Plan

**Source audits:** 5 parallel senior-dev audits run on 2026-05-27 covering capture engine, Phase 2a calendar/stats, Phase 4 brief, IPC/preload/security, and React renderer.

**Total findings:** 15 Blocking, 33 Important, 15 Nit. (Some overlap across audits — e.g., safeStorage plaintext fallback was flagged for both Anthropic key and Google refresh token.)

**Strategy:** five sequential batches by subsystem. Each batch ends with `npm test` clean and a tag-able commit. Mercer consult triggered for any user-facing copy or behavior change.

**Target tag:** v0.3.1

---

## Batch A — Security (5 Blocking, 4 Important)

Highest priority. These are the kind of issues that don't show in normal use but become catastrophic if the renderer is ever XSS'd or if a user clicks a malicious link.

### A.1 Enable Chromium sandbox + explicit security flags (B4.1, B4.2)
**File:** `src/main/windows/create.ts`
Set `sandbox: true`, `nodeIntegration: false`, `nodeIntegrationInSubFrames: false`, `webviewTag: false`. Preload is `.mjs` and uses only `contextBridge` + `ipcRenderer` — both work under sandbox. Verify by launching the app post-change and confirming the renderer functions.

### A.2 Content-Security-Policy (B4.3)
**File:** `src/renderer/index.html`
Add a meta CSP tag:
```html
<meta http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self';">
```
In dev mode, electron-vite's HMR uses ws to localhost:5173 — extend `connect-src` and `script-src` accordingly for dev. Use Vite's environment-conditional injection if needed.

### A.3 Guard `setWindowOpenHandler` against `file:` / `javascript:` / arbitrary schemes (B4.4)
**File:** `src/main/windows/create.ts`
```typescript
win.webContents.setWindowOpenHandler(({ url }) => {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') {
      void shell.openExternal(url);
    }
  } catch { /* malformed URL, ignore */ }
  return { action: 'deny' };
});
```
Also add `win.webContents.on('will-navigate', (e, url) => { e.preventDefault(); /* same allowlist + shell.openExternal */ })` to block internal navigation to external schemes.

### A.4 IPC input validation — `anthropicSetKey`, `anthropicSetModel` (B4.5)
**File:** `src/main/ipc.ts`
```typescript
ipcMain.handle(IPC.ANTHROPIC_SET_KEY, (_e, key: unknown) => {
  if (typeof key !== 'string' || key.length === 0 || key.length > 500) {
    throw new Error('Invalid Anthropic key format');
  }
  // Anthropic keys: sk-ant-api03-... Permissive enough for future key formats.
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim())) {
    throw new Error('Anthropic key must start with sk-ant- and be at least 28 chars');
  }
  writeAnthropicKey(key);
});

ipcMain.handle(IPC.ANTHROPIC_SET_MODEL, (_e, modelId: unknown) => {
  if (typeof modelId !== 'string' || !Object.values(MODEL_IDS).includes(modelId as never)) {
    throw new Error('Unknown model id');
  }
  const cur = store.get('anthropic');
  store.set('anthropic', { ...cur, model: modelId });
});
```

### A.5 Clamp / validate every IPC handler with a `limit` or unstructured payload (I4.8, I4.9)
**File:** `src/main/ipc.ts`
For every handler that accepts external input:
- `SESSIONS_RECENT`: `const n = Math.min(Math.max(1, Math.floor(Number(limit) || 20)), 1000)`
- `BRIEF_LIST_PAST`: same pattern, cap at 365
- `GOAL_SET`: validate `g === null` or `{text: string, projectLabel?: string}` with `text.length <= 500`
- `WORK_HOURS_SET`: validate shape: `{enabled: boolean, start: /^\d{2}:\d{2}$/, end: /^\d{2}:\d{2}$/, weekendsActive: boolean}`
- `PROJECTS_UPSERT` / `EXCLUSIONS_UPSERT`: validate shapes (label/category/keywords array of strings)
- `SESSIONS_RECLASSIFY`: validate id is non-empty string, label is non-empty string

### A.6 `electron-store` schema + `clearInvalidConfig` (I4.10)
**File:** `src/main/store.ts`
Add `clearInvalidConfig: true` to the `new Store(...)` options. Optionally define a JSON Schema for top-level keys.

### A.7 `BRIEF_GENERATE` server-side regen cap + in-flight guard (I4.6, B3.1)
**File:** `src/main/ipc.ts` + `src/main/brief/generate.ts`
- Add a `Map<string, Promise<DailyBriefDTO>>` keyed by date in the IPC handler
- If a generation is in-flight for today, return the existing `generationId`
- Enforce `canRegenerate(...)` server-side BEFORE starting generation — UI cap alone is renderer-trusted

### A.8 Broadcast `BRIEF_STREAM` only to the originating renderer (I4.7)
**File:** `src/main/ipc.ts` + `src/main/brief/generate.ts`
Capture `event.sender.id` in the generate handler, pass through to `generateBrief`, and target `webContents.fromId(originId)` instead of `getAllWindows()`. Falls back to broadcast if the original renderer is destroyed.

### A.9 Refuse safeStorage plaintext fallback OR mark stored values with encryption flag (B3.4, I2.5, N4.16)
**Files:** `src/main/anthropic/key.ts`, `src/main/google/auth.ts`
Change stored shape to `{ encrypted: boolean, value: string }` (or a single string with a `enc:` prefix). On read, branch on the flag, not on current `safeStorage.isEncryptionAvailable()`. If decryption fails, log and return null AND set a one-time `keyRequiresReentry` flag so the UI surfaces a clear "key present but unreadable, re-enter" state.

### A.10 NAVIGATE payload validation (I4.13)
**File:** `src/preload/index.ts`
Validate `route` against the route enum before invoking `cb(route)`. If invalid, log and ignore.

### A.11 Hot-reload safety on IPC handler registration (I4.12)
**File:** `src/main/ipc.ts`
At the top of `registerIpc`, iterate `Object.values(IPC)` and call `ipcMain.removeHandler(channel)` first. Idempotent; safe.

### A.12 Listener cleanup on quit for tray + cache (I4.11)
**File:** `src/main/tray.ts`, `src/main/stats/cache.ts`
Keep bound handler references so they can be passed to `engine.off('status', handler)` in `will-quit`. Also call `tray.destroy()` in `will-quit`.

---

## Batch B — Capture engine integrity (3 Blocking, 7 Important)

### B.1 Heartbeat-based orphan recovery (B1.2 — already in backlog)
**Files:** `src/main/db/migrations/007_session_last_heartbeat.sql` (new), `src/main/capture/sessions.ts`, `src/main/db/index.ts`

Migration adds `last_heartbeat INTEGER` column to `sessions`. Update on every `open`, `heartbeat`, `close`. Orphan recovery becomes:
```sql
UPDATE sessions
SET end_time = COALESCE(last_heartbeat, start_time)
WHERE end_time IS NULL;
```
Tests: add `tests/db/orphan-recovery.test.ts` with two scenarios — heartbeat present (recover to heartbeat), heartbeat null (recover to start_time + 0).

### B.2 `evaluateIdle` clamping (B1.1)
**File:** `src/main/capture/engine.ts` around the resume tick path
Wrap the `addPausedMs` write with clamping:
```typescript
const sessionDuration = now - this.active.startTime;
const maxPause = Math.max(0, sessionDuration - this.active.pausedMs);
const safeAdd = Math.max(0, Math.min(outcome.addPausedMs, maxPause));
if (safeAdd > 0) {
  this.repo.addPausedMs(this.active.id, safeAdd);
  this.active.pausedMs += safeAdd;
}
this.active.idleStartedAt = null;
```
Add test for: negative `addPausedMs` (clock backwards), addPausedMs > sessionDuration (clock forwards or stale idleStartedAt).

### B.3 `before-quit` awaits in-flight tick (B1.3)
**File:** `src/main/capture/engine.ts`, `src/main/capture/lifecycle.ts`, `src/main/index.ts`
Track `tickInFlight` promise in the engine. Add `async stopAndDrain()` method that awaits in-flight tick before `closeActive`. In `before-quit`, `e.preventDefault()` and call `engine.stopAndDrain().finally(() => app.exit(0))` guarded by a `quitting` flag.

### B.4 SessionRepo `close()` as a transaction (I1.9)
**File:** `src/main/capture/sessions.ts`
Wrap the SELECT + UPDATE in a `db.transaction(() => { ... })` block.

### B.5 Migration runner safety (I1.4)
**File:** `src/main/db/migrate.ts`
Add a check that the SQL doesn't contain `BEGIN`/`COMMIT`/`ROLLBACK`. Wrap the entire migration in a transaction at the runner level (`db.exec` runs inside the transaction; the `_migrations` insert is part of the same transaction).

### B.6 WAL checkpoint on shutdown (I1.5)
**File:** `src/main/db/index.ts`
In `closeDatabase`, run `db.pragma('wal_checkpoint(TRUNCATE)')` inside a try/catch before `db.close()`.

### B.7 `pollActiveWindow` timeout (I1.6)
**File:** `src/main/capture/window-poller.ts`
Wrap the `get-windows` call in a `Promise.race` with a 1-second timeout, falling back to the last good snapshot. Tests: feed a stalled mock.

### B.8 `InputGate.start()` surfaces failure (I1.7)
**File:** `src/main/capture/input-gate.ts`, `src/main/capture/engine.ts`
On uiohook startup failure, emit `'error'` from InputGate. Engine sets a `degraded: true` flag and includes it in the next `'status'` event payload. Periodic 30s timer still runs.

### B.9 Single-instance lock UX (I1.8)
**File:** `src/main/index.ts`
Move `app.on('second-instance', ...)` BEFORE `requestSingleInstanceLock()`. Use `app.exit(0)` instead of `process.exit(0)`.

### B.10 Exclude `idle`/`excluded`/`meeting` consistently in stats (I2.10)
**File:** `src/main/stats/daily-stats.ts`
The current `computeDailyStats` switches on `kind === 'work'` then `'transition'` but silently drops `'idle'`/`'excluded'`/`'meeting'`. `switchesCount = rows.length` counts ALL kinds. Either filter the SQL to `kind IN ('work', 'transition', 'meeting')` (excluding `idle`/`excluded` from BOTH switchesCount and ms totals), OR route `'meeting'` to focused, `'idle'`/`'excluded'` to elsewhere. Pick the second for consistency with the spec's "show both sides" intent.

### B.11 Long-running cross-midnight sessions (I2.11)
**File:** `src/main/stats/daily-stats.ts`
Change SQL predicate to `WHERE end_time >= ? AND start_time <= ?` (overlaps day window). Clip the effective duration: `effective = min(end_time, dayEndMs) - max(start_time, dayStartMs) - paused_ms * proportion`. For simplicity in v0.3.1, clip the time range only; the paused_ms math can be approximated.

---

## Batch C — Phase 2a calendar (4 Blocking, 5 Important)

**Mercer consult required** for B.4 + B.4 follow-up UX (revoked token re-prompt copy). Other items are technical.

### C.1 Fix nested-key write (B2.1)
**File:** `src/main/calendar/sync.ts`
Line 77: replace `store.set('google.syncedAt', ...)` with `const g = store.get('google'); store.set('google', { ...g, syncedAt: this.lastSyncAt });`.

### C.2 Cross-midnight event date assignment (B2.2)
**File:** `src/main/calendar/sync.ts`
After fetching events, compute `dateKey = isoDate(new Date(e.startTimeMs))` per event (not the query window date). Multi-day events get one row per local date. For v0.3.1, classify by `startTimeMs`'s local date — late-night events belong to the day they started.

### C.3 Debounce `CalendarSync.start` immediate-sync (B2.3)
**File:** `src/main/calendar/sync.ts`
Add `lastSyncAttemptAt` timestamp. In `syncNow`, if `Date.now() - lastSyncAttemptAt < 60_000`, skip and log. Engine status flipping rapidly no longer bursts API quota.

### C.4 OAuth refresh-token revocation surfaces error (B2.4)
**File:** `src/main/calendar/sync.ts`, `src/main/google/auth.ts`
In `syncNow`'s catch, sniff `err.message`/`err.code` for `invalid_grant` or `401`. On match, call `disconnectGoogle()` and broadcast `GOOGLE_STATUS_CHANGED` with `connected: false, lastError: 'Google access was revoked. Please reconnect.'`. The renderer's GoogleConnectButton already surfaces lastError — verify the copy is non-banned.

**Mercer consult:** the reconnect copy ("Google access was revoked. Please reconnect.") needs to land without sounding accusatory. Confirm with Mercer.

### C.5 Rate-limit backoff for 429s (I2.8)
**File:** `src/main/calendar/sync.ts`
Parse `err.response?.headers?.['retry-after']` (if present) or default to exponential backoff (60s, 300s, 900s, capped at the 15-min interval). Set `cooldownUntil` and skip syncs until elapsed.

### C.6 Adherence math defensive checks (I2.7)
**File:** `src/main/calendar/adherence.ts`
Add `Number.isFinite` guards. Reject `endMs < startMs` or non-finite durations with `did-not-start` + logged warning. Catches Google API anomalies and `NaN` from malformed `dateTime` strings.

### C.7 Calendar repo upsert preserves project_label only on title match (I2.9)
**File:** `src/main/calendar/repo.ts`
The current upsert omits `project_label` from the SET, preserving user mapping across re-fetches. Add a JSDoc comment documenting this behavior. Optionally: clear `project_label` when title changes significantly (Levenshtein < 80%). For v0.3.1, just document the sticky behavior.

### C.8 raw_json NOT NULL DEFAULT '{}' (I2.6)
**File:** `src/main/db/migrations/008_calendar_events_raw_json_default.sql`
```sql
-- raw_json was originally nullable; make it non-null with a JSON-empty default to prevent JSON.parse crashes
-- SQLite ALTER COLUMN is limited — recreate the constraint via INSERT-from-old-table pattern, or accept TEXT-with-default-'{}' on writes via the repo
-- For pragmatic v0.3.1: enforce '{}' default at the application layer (CalendarRepo.upsert), not via schema migration
```
Use the cheap fix: change `CalendarRepo.upsert` to default `e.rawJson ?? '{}'`. Schema migration deferred to v0.4.

### C.9 DailyStatsCache attach/detach safety (N2.12)
**File:** `src/main/stats/cache.ts`
Store `boundInvalidate` reference; on re-attach, call `this.engine?.off('change', this.boundInvalidate)` before reassigning. Important for tests.

### C.10 Truth headline / forward nudge NaN guards (N2.14, N2.15)
**Files:** `src/main/copy/truth-headline.ts`, `src/main/copy/forward-nudge.ts`
At the entry of each formatter, add `if (!Number.isFinite(ms)) ms = 0;` defensive guards. Headline "0 hours 0 minutes" is acceptable copy per the operating frame (truth-led) — don't change.

---

## Batch D — Phase 4 brief (4 Blocking, 7 Important)

**Mercer consult required** for B.6 (banned-vocab flashing in UI) — voice contract violation.

### D.1 Concurrent generation guard (B3.1 — covered in A.7)
See Batch A. The in-flight Map + server-side regen cap together solve both the security and the data-corruption angles of the same bug.

### D.2 Pass prior assistant turn on regen (B3.3)
**File:** `src/main/brief/generate.ts`, `src/main/anthropic/stream.ts`
Change the regen path: instead of mutating systemPrompt, append `{role: 'assistant', content: rawMarkdown}` then `{role: 'user', content: bannedVocabRegenPrompt(violatedWords)}` to the messages array. Claude sees its own prior bad output and can surgically fix it. Reduces multi-attempt failure rate and token spend.

### D.3 Streaming banned-vocab abort (I3.6 — Mercer-flagged)
**Files:** `src/main/brief/generate.ts`, `src/main/anthropic/stream.ts`, `src/main/brief/gate.ts`
Add an `onTextDelta` interceptor that maintains a sliding-window scanner over the last ~50 chars of accumulated output. On detecting a banned word, abort the stream (`stream.controller.abort()`) and begin auto-regen WITHOUT having emitted that delta. This prevents the user from seeing banned vocab even briefly.

**Mercer consult:** confirm this is the right behavior. Alternative is buffer-and-flush — delay deltas by ~50 chars. Mercer's call on UX tradeoff: instant streaming with possible reset flicker vs. small delay with guaranteed clean output. Recommend the abort approach.

### D.4 safeStorage encryption-state marker (B3.4 — covered in A.9)
See Batch A.

### D.5 generation_count not incremented on stream failure (I3.5)
**File:** `src/main/brief/generate.ts`
On the exhausted-fallback path (after 3 auto-regen attempts), do NOT increment `userGenCount`. Either skip the write entirely (let the IPC error event drive UI state) OR write with `generationCount: existing?.generationCount ?? 0` (no bump).

### D.6 Accumulate token counts across retries (I3.7)
**File:** `src/main/brief/generate.ts`
Replace `inputTokens = result.inputTokens` with `inputTokens += result.inputTokens`. Reset before the loop. Document that the stored count is "total tokens consumed for this brief including auto-retries."

### D.7 Retry on `parseStructuredTail` null (I3.8)
**File:** `src/main/brief/generate.ts`
After successful section parse, also check `parseStructuredTail`. If null, append regen prompt mentioning missing structured tail and `continue`. Counts against the 3-attempt cap.

### D.8 Wall-clock cap on auto-regen loop (I3.11)
**File:** `src/main/brief/generate.ts`
Track `startedAt = Date.now()` before the loop. If `Date.now() - startedAt > 90_000`, break to fallback. Also expose `IPC.BRIEF_CANCEL` that aborts in-flight generation via an AbortController.

### D.9 API key scrubbing in error messages (N3.12)
**Files:** `src/main/anthropic/client.ts`, `src/main/anthropic/stream.ts`
Before logging or surfacing any error message, `.replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-***')`. Apply to all `log.warn`/`log.error` calls in the anthropic/ subtree.

### D.10 `parseStructuredTail` anchor to last JSON block (N3.14)
**File:** `src/main/brief/parse-tail.ts`
Change regex to grab the LAST `` ```json ... ``` `` block in the document, not the first.

### D.11 `assembleBriefPayload` consistent clock (N3.15)
**File:** `src/main/brief/assemble-payload.ts`
Replace `Date.now() - SEVEN_DAYS_MS` with `now.getTime() - SEVEN_DAYS_MS` so the function is deterministic given `now`.

### D.12 Remove dead code `bumpGenerationCount` OR use it (I3.9)
**File:** `src/main/brief/repo.ts`
Remove the unused export, OR — better — use it inside the concurrent-guard transaction from A.7.

---

## Batch E — Renderer (3 Blocking, 5 Important)

### E.1 `useRemirror` guard against missing preload (B5.1)
**File:** `src/renderer/hooks/useRemirror.ts`
```typescript
export function useRemirror(): RemirrorAPI {
  const api = window.remirror;
  if (!api) {
    throw new Error('Preload not loaded — Remirror IPC unavailable. Check console for preload script errors.');
  }
  return api;
}
```
Add a top-level error boundary in `src/renderer/index.tsx` that catches this and shows a fatal-error screen.

### E.2 Brief stream race fixes (B5.2)
**File:** `src/renderer/routes/Brief.tsx`
- Set `activeGenId.current = '__pending__'` BEFORE awaiting `briefGenerate()`
- Change filter from `if (activeGenId.current && e.generationId !== activeGenId.current) return;` to `if (e.generationId !== activeGenId.current) return;` (drop the truthy short-circuit)
- Reset `activeGenId.current = null` only in `done` and `error` branches; never leave a window where any generationId passes

### E.3 isMounted guard across every async effect (B5.3)
**Files:** all renderer components with `useEffect` doing async work
Standard pattern:
```typescript
useEffect(() => {
  let alive = true;
  (async () => {
    const data = await api.foo();
    if (alive) setData(data);
  })();
  return () => { alive = false; };
}, [api]);
```
Apply to: `Brief.tsx`, `Status.tsx`, `StoryColumn.tsx`, `Timeline.tsx`, `CalendarColumn.tsx`, `GoalEditor.tsx`, `AnthropicApiCard.tsx`, `WorkHoursEditor.tsx`, `GoogleConnectButton.tsx`.

### E.4 Polling visibility gate (I5.5)
**Files:** `src/renderer/ui/StoryColumn.tsx`, `Timeline.tsx`, `CalendarColumn.tsx`, `src/renderer/routes/Status.tsx`
Wrap interval callbacks: `if (document.visibilityState === 'visible') refresh();` Saves IPC churn when the user has the app in the background.

### E.5 Markdown perf — memoize + fix O(n²) tokenizer (I5.7, I5.9)
**File:** `src/renderer/ui/markdown.tsx`
- Wrap parse in `useMemo`
- In the tokenizer's fallback branch, consume a chunk of plain text up to the next special character instead of one char per iteration:
```typescript
const nextSpecial = remaining.search(/[*`]/);
const chunkEnd = nextSpecial === -1 ? remaining.length : nextSpecial;
tokens.push({ type: 'text', content: remaining.slice(0, chunkEnd) });
remaining = remaining.slice(chunkEnd);
```

### E.6 AnthropicApiCard model change error surface (I5.8)
**File:** `src/renderer/ui/AnthropicApiCard.tsx`
Wrap `changeModel` in try/catch. On failure, set `setTestResult({ ok: false, error: 'Failed to save model selection' })`.

### E.7 WorkHoursEditor save debounce + setTimeout cleanup (I5.11)
**File:** `src/renderer/ui/WorkHoursEditor.tsx`
Debounce the `save` call with 300ms timer. Track the `setTimeout(setSaved(false), 1500)` handle and `clearTimeout` on unmount.

### E.8 Timeline / CalendarColumn `Math.min(...arr)` safety (N5.12)
**Files:** `Timeline.tsx`, `CalendarColumn.tsx`
Replace `Math.min(...arr.map(...))` with a reduce. Not strictly necessary today (limit cap of 500), but cheap defensive fix.

### E.9 Timeline live in-progress session indicator (N5.13)
**File:** `Timeline.tsx`
Render the currently-open session (where `end_time === null`) with `end_time = Date.now()` and a pulsing border. Out of scope for v0.3.1 unless trivial. **Defer to v0.4.**

### E.10 Pause/Resume button busy state (N5.16)
**File:** `Status.tsx`
Add `disabled={busy}` to the Pause/Resume button.

### E.11 AnthropicApiCard MODEL_OPTIONS import location (N5.18)
**File:** `src/renderer/ui/AnthropicApiCard.tsx` + `src/shared/anthropic-models.ts` (new)
Move `src/main/anthropic/models.ts` to `src/shared/anthropic-models.ts`. Update all importers. Renderer no longer imports from `src/main/`.

---

## Batch F — Sweep (Nits)

Bundle: Markdown italic regex tighten, exhaustive route check in App.tsx, GoogleConnectButton refresh-race log, classifier sort cleanup, `recentSessions` upper bound (covered in A.5), `window-all-closed` regression-guard comment, etc.

Plus a comprehensive `npm test` run, manual smoke test against `npm run dev`, then tag v0.3.1.

---

## Execution order

1. **Batch A — Security** (highest-leverage; everything else builds on a secure shell)
2. **Batch B — Capture engine** (data integrity)
3. **Batch C — Phase 2a calendar** (with Mercer consult on revoked-token UX)
4. **Batch D — Phase 4 brief** (with Mercer consult on streaming banned-vocab UX)
5. **Batch E — Renderer**
6. **Batch F — Sweep + tag v0.3.1**

Total estimated commits: ~40-50.
Estimated tests added: ~20-30 (orphan recovery, idle clamping, NaN guards, stream race, IPC validation).

---

## Risk notes

- **Batch B.1 (heartbeat migration)** changes the sessions table — verify backward compat with any existing user DB. Migration 007 is additive (adds column with default `0`), so safe.
- **Batch C.2 (cross-midnight event date)** could shift the dates of historical events on the next sync. Acceptable — the new behavior is correct; old data was wrong.
- **Batch D.3 (streaming abort)** depends on the Anthropic SDK exposing an abort controller. Verify before implementing. Fallback: server-side buffer-and-flush with ~50-char delay.
