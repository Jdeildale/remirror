# Remirror Backlog

Known issues and follow-up items that aren't blocking current phase completion. Each entry has: discovered-in, severity, why-deferred.

---

## ~~Orphan-recovery uses `start_time + 5min` instead of last heartbeat~~ — RESOLVED

**Discovered in:** Phase 2a manual sweep (2026-05-27)
**Resolved in:** Batch B.1 — commit `c2617ea` (`fix(db): heartbeat-based orphan recovery (replaces start_time+5min)`)

`recoverOrphanSessions()` now sets `end_time = COALESCE(last_heartbeat, start_time + (5 * 60 * 1000))`, where `last_heartbeat` is updated by the engine's 30-second tick. Recovered duration reflects when the user was last active, not an arbitrary 5-minute slug from session open.

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

---

## BRIEF_CANCEL not wired (AbortController deferred)

**Discovered in:** Audit Batch D.8 (2026-05-27)
**File:** `src/main/ipc.ts` → `IPC.BRIEF_CANCEL` handler, `src/main/brief/generate.ts`
**Severity:** UX — users cannot abort a slow generation mid-stream

The `BRIEF_CANCEL` IPC channel is registered and receives the `generationId`, but does nothing beyond logging. A full abort requires:
1. An `AbortController` stored in the `inFlightByDate` map alongside the `generationId`.
2. The Anthropic streaming call in `generate.ts` wired to `signal: controller.signal`.
3. On cancel: call `controller.abort()`, delete from map, emit a `{kind:'cancelled'}` stream event to the originating renderer.

**Why deferred:** streaming abort was out of scope for the v0.3.0 brief MVP. Users can wait for completion or let the 90-second wall-clock cap trigger. Target: v0.3.2.
