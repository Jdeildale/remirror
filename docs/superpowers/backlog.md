# Remirror Backlog

Known issues and follow-up items that aren't blocking current phase completion. Each entry has: discovered-in, severity, why-deferred.

---

## Orphan-recovery uses `start_time + 5min` instead of last heartbeat

**Discovered in:** Phase 2a manual sweep (2026-05-27)
**File:** `src/main/db/index.ts` → `recoverOrphanSessions()`
**Severity:** Cosmetic / minor data integrity

When the Electron process is killed without a graceful shutdown (e.g. `taskkill /F`, crash, system reboot), any session with `end_time = NULL` is left dangling in the DB. On next launch, `recoverOrphanSessions()` closes it with:

```sql
UPDATE sessions SET end_time = MIN(start_time + 5min, now) WHERE end_time IS NULL
```

The 5-minute slug is positioned at the session's `start_time`, regardless of when the user was actually last active. Result: a session opened at 3am that the user abandoned at 3:02am (then crashed at 9am) gets recorded as ending at 3:05am — but worse, multiple such phantoms can accumulate visually as "stripes" in the Timeline if the process was killed repeatedly during a dev session.

**Fix direction:** add a per-session `last_heartbeat` column updated by the engine's existing 30s tick. On orphan-recovery, set `end_time = COALESCE(last_heartbeat, start_time + 5min)`. This makes the recovered duration reflect when the user was actually last active, not an arbitrary 5-min slug.

**Why deferred:** the bug only manifests when the process is force-killed mid-session. Normal Quit-via-tray closes sessions gracefully via the `will-quit` handler. In real user operation this is rare (process crashes only).

---

## Hotkey conflict on Alt+Shift+R

**Discovered in:** Phase 2a manual sweep (2026-05-27)
**File:** `src/main/hotkey.ts`, `src/shared/branding.ts`
**Severity:** UX

Some user machines have other apps that grab the global shortcut `Alt+Shift+R` before Remirror can register it. The current behavior: log a warning, continue without the hotkey, force the user to use the tray icon. No user-visible feedback that the hotkey failed.

**Fix directions** (combine or pick one):
- Try a fallback hotkey if the primary fails (e.g., `Ctrl+Alt+R`, then `Win+Shift+R`)
- Add a Settings → Hotkey UI so the user can pick their own combo and rebind live
- Surface the failure in the tray menu ("Hotkey unavailable — click here to rebind")

**Why deferred:** the tray icon left-click already opens the window. The hotkey is a power-user nicety. Defer until rebinding UI lands as part of a broader Settings pass.
