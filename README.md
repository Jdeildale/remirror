# Remirror

An honest mirror for your attention.

Remirror is a Windows desktop app that silently records what you work on by passively observing window focus, window titles, cursor location, and idle state. All data stays on your machine — no cloud, no telemetry, no account.

Designed for ADHD work patterns: never asks you to log anything, never tells you that you "wasted time," and treats your data as something you reflect on, not something you're scored against.

## Status

**Phase 1** — capture engine, exclusions, project keyword matching, minimal status UI.
Phases 2–5 (Claude-powered end-of-day classification, timeline UI, meeting integration, daily brief, weekly mirror) are on the roadmap.

## Requirements

- **Windows 10 or 11**
- **Node.js 20.18.0** (Electron 32 ships its own Node, but tests and tooling expect a matching local Node)

If you use [nvm-windows](https://github.com/coreybutler/nvm-windows), the project's `.nvmrc` pins the version:

```powershell
nvm install 20.18.0
nvm use 20.18.0
```

## Install

```powershell
npm install
```

The `postinstall` hook rebuilds the three native modules (`better-sqlite3`, `get-windows`, `uiohook-napi`) against Electron's ABI. On a fresh machine without C++ build tools, this may take a moment but uses prebuilt binaries — no compiler required.

If a Windows toolchain issue blocks `postinstall`, see "Native module troubleshooting" below.

## Run the app

```powershell
npm run dev
```

The app appears in your system tray. Press **Alt+Shift+R** to open the UI. The first launch shows onboarding (add projects + customize exclusions); subsequent launches go straight to the status view.

## Run tests

```powershell
npm test
```

The test script handles a small dance behind the scenes: it rebuilds `better-sqlite3` for the local Node 20 ABI (test runner), runs vitest, then rebuilds it back for Electron 32's ABI (runtime). After `npm test` you can `npm run dev` immediately.

## Build a Windows installer

```powershell
npm run build:win
```

Output: `dist\Remirror-Setup-<version>.exe`.

## Where Remirror keeps things

| What | Path |
|---|---|
| Database | `%APPDATA%\Remirror\remirror.db` |
| Logs | `%APPDATA%\Remirror\logs\main.log` |
| Preferences | `%APPDATA%\Remirror\config.json` (electron-store) |

Uninstall removes the app; deleting `%APPDATA%\Remirror` removes all Remirror data.

## Privacy

Remirror makes **no network calls** in Phase 1. Future phases that use Claude for end-of-day classification and weekly summaries will use your own Anthropic API key — provided through the in-app Settings, stored via Electron's `safeStorage`, never bundled or proxied.

Exclusions are checked *before* a session is opened, never after. Password managers, banking, and private messaging apps are pre-seeded; you can add more from the Exclusions tab.

## Project layout

```
remirror/
├─ src/
│  ├─ main/              # Electron main process (capture engine, DB, tray, IPC)
│  ├─ preload/           # contextBridge surface
│  ├─ shared/            # types + IPC contract used on both sides
│  └─ renderer/          # React + Tailwind UI
├─ tests/                # vitest unit tests
├─ resources/icons/      # tray + app icons
├─ scripts/              # build helpers (run-tests.mjs, etc.)
└─ docs/superpowers/     # design spec + implementation plan + acceptance runlog
```

The design spec ([`docs/superpowers/specs/2026-05-23-remirror-phase1-design.md`](docs/superpowers/specs/2026-05-23-remirror-phase1-design.md)) is the source of truth for what Phase 1 ships and why.

## Native module troubleshooting

Three packages have native bindings: `better-sqlite3`, `get-windows`, `uiohook-napi`. They ship Windows prebuilt binaries for common Node and Electron ABIs, so `npm install` should succeed without a compiler on a fresh Windows machine.

If you hit a `MSBUILD : error MSB1009: Project file does not exist` or a ClangCL error, the package needs to compile from source. Install [Visual Studio Build Tools 2022](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with the "Desktop development with C++" workload, then `npm run rebuild:electron`.

## License

Proprietary. Not for redistribution.
