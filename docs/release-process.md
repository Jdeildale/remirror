# Remirror Release Process

The app uses **electron-updater** to silently pull new versions from a public **GitHub Release** on the `thrivingmindmarketing-tmm/remirror` repo. When you publish a new release, every installed copy checks GitHub on launch (and every 4 hours) and silently downloads the new installer. The user gets an unobtrusive "restart to update" prompt; on next quit the installer runs and the app relaunches at the new version.

## One-time setup

You only do these steps once, before your first published release.

### 1. Create the GitHub repo

1. Go to https://github.com/new
2. Owner: **thrivingmindmarketing-tmm**
3. Repo name: **remirror**
4. Visibility: **Public** (required for installed apps to fetch updates without a token)
5. Don't initialize with a README — we already have one
6. Click **Create repository**

### 2. Push the local repo

```powershell
cd C:\Users\Admin\Downloads\Remirror
git remote add origin https://github.com/thrivingmindmarketing-tmm/remirror.git
git push -u origin phase-1-implementation
git push --tags
```

### 3. Create a GitHub Personal Access Token (PAT) for publishing

The `release:win` script needs to upload the installer + `latest.yml` to GitHub Releases on your behalf. This requires a token with `repo` scope.

1. Go to https://github.com/settings/tokens/new
2. Note: `Remirror release publishing`
3. Expiration: pick what feels right (90 days is reasonable; renew when it expires)
4. Scopes: check **`repo`** (Full control of private repositories — needed even for public repo write)
5. Click **Generate token**
6. **Copy the token immediately** — GitHub only shows it once
7. Save it somewhere safe (1Password, Bitwarden, etc.)

### 4. Make the token available to the release script

For each PowerShell session where you'll run `npm run release:win`:

```powershell
$env:GH_TOKEN = "ghp_yourTokenHere"
```

To persist it across sessions (so you don't have to set it every time):

```powershell
[System.Environment]::SetEnvironmentVariable('GH_TOKEN', 'ghp_yourTokenHere', 'User')
```

Then restart PowerShell. (Note: this stores the token in the Windows user env — fine for a personal machine, do NOT use this method on shared machines.)

---

## Cutting a new release

Once setup is done, every new release follows this loop:

### 1. Bump the version

Edit `package.json` → `"version": "0.3.2"` (or whatever the next version is). Use [semver](https://semver.org/): patch (0.3.1 → 0.3.2) for fixes, minor (0.3.x → 0.4.0) for features, major (0.x → 1.0.0) for breaking changes.

### 2. Commit the version bump + any release-note changes

```powershell
git commit -am "release: v0.3.2"
```

### 3. Tag the release

```powershell
git tag -a v0.3.2 -m "What's new in v0.3.2"
```

### 4. Build + publish

```powershell
npm run release:win
```

This:
1. Rebuilds `better-sqlite3` for Electron's ABI
2. Runs `electron-vite build` (main, preload, renderer bundles)
3. Runs `electron-builder --win --publish always`:
   - Packages the app into `dist\Remirror-Setup-0.3.2.exe`
   - Writes the manifest at `dist\latest.yml`
   - Uploads BOTH to a new GitHub Release tagged `v0.3.2`

### 5. Push commits and tag

```powershell
git push origin phase-1-implementation
git push origin v0.3.2
```

### 6. (Optional) Edit the GitHub Release page

After step 4, visit https://github.com/thrivingmindmarketing-tmm/remirror/releases. electron-builder created a draft release with the installer attached. Edit it to add release notes, mark it as the latest, and click **Publish release**.

(If you want the publish to be automatic without manual confirmation, change `releaseType: release` to `releaseType: prerelease` in `electron-builder.yml` and adjust later — or set `releaseType: draft` and always need to publish manually.)

### 7. Verify auto-update flow

On a machine with the previous version installed (e.g. your machine with the v0.3.1 install we just made):

1. Launch Remirror
2. Wait 30 seconds (the auto-updater check runs after a grace period)
3. Look at the main log file: `%APPDATA%\Remirror\logs\main.log`
4. You should see: `autoUpdater: checking for update` → `autoUpdater: update available — 0.3.2` → `autoUpdater: update downloaded — 0.3.2; will install on quit`
5. Right-click the tray icon → **Quit**
6. The NSIS installer runs silently in the background
7. Remirror relaunches at v0.3.2

---

## What gets uploaded to GitHub Releases

Each release attaches:
- **`Remirror-Setup-X.Y.Z.exe`** — the NSIS installer (~93 MB)
- **`Remirror-Setup-X.Y.Z.exe.blockmap`** — used by electron-updater to delta-patch (faster downloads for users)
- **`latest.yml`** — the manifest electron-updater reads to know what's newest

All three must be present and public for auto-update to work. electron-builder uploads them all automatically.

---

## Troubleshooting

### "GH_TOKEN env is not set"

The release script can't authenticate. Set `$env:GH_TOKEN` before running `npm run release:win`.

### "Cannot find module 'electron-updater'"

In dev mode (`npm run dev`), the auto-updater module is loaded but `setupAutoUpdater()` is a no-op in dev because no `app-update.yml` ships with the dev build. This is correct behavior. Auto-update only runs in production-installed builds.

### Users see "Update available" but it never downloads

Check `%APPDATA%\Remirror\logs\main.log` on the user's machine for the autoUpdater output. Common causes:
- Their network blocks `github.com` or `objects.githubusercontent.com`
- The GitHub Release was created but not marked as published (still in draft)
- The `latest.yml` is missing from the release

### Auto-update works but Windows SmartScreen warns on each update

Expected for unsigned installers. The fix is to buy an Authenticode code-signing certificate ($200-400/year) and add `certificateFile` + `certificatePassword` to `electron-builder.yml`'s `win:` block. Deferred until commercial launch.

---

## Going commercial — when to revisit

Two changes worth making before charging money:

1. **Switch the repo to private + host installers on S3** so you don't ship your source code with each release. Change `electron-builder.yml` `publish:` to `provider: s3` with bucket info. The user-installed apps' auto-update still works the same — they just fetch from the S3 URL instead of GitHub.

2. **Code-sign the installer** so Windows SmartScreen stops warning your customers. Adds polish; legally optional but practically required for paid software.
