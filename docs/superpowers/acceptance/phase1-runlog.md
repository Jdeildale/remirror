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
- [ ] 9. Project A + keywords `["projecta", "client-work"]` → title `client-work · main · VS Code` gets label, confidence=1.0.
- [ ] 10. No match → `unclassified`, confidence=0.
- [ ] 11. "Set project ▾" → row updates, confidence=1.0.

## UX
- [ ] 12. Tray status reflects active / paused / excluded.
- [ ] 13. Hotkey Alt+Shift+R opens window; second press focuses (no second window).
- [ ] 14. First launch → onboarding; second launch → status.
- [ ] 15. Status counts + recent list auto-refresh.

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

(record observations, failures, fixes during the walkthrough here)
