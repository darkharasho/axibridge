# AxiBridge Rename Design Spec

## Summary

Rename the app from "ArcBridge" to "AxiBridge" across the entire codebase, including build identity, branding, and all user-facing strings. The release must be discoverable by existing ArcBridge installs via auto-update. Includes user data migration, Windows uninstall of the old version, and Linux/Windows portable binary rename.

## Constraints

- **Auto-update continuity**: Existing ArcBridge installs must be able to find and install this release via `electron-updater`. The `build.publish.repo` field stays as `"ArcBridge"` for this release.
- **GitHub repo rename happens after**: The repo stays `darkharasho/ArcBridge` when this release is published. GitHub URLs in source stay as-is; they'll be updated in a follow-up after the repo rename (GitHub redirects cover the gap).
- **Legacy migration chain preserved**: The existing `gw2_arc_log_uploader` → `ArcBridge` migration code stays intact for users who skipped many versions.

## 1. Build Identity (package.json)

| Field | Old | New |
|-------|-----|-----|
| `name` | `"arcbridge"` | `"axibridge"` |
| `description` | `"ArcBridge - Guild Wars 2..."` | `"AxiBridge - Guild Wars 2..."` |
| `build.appId` | `"com.arcbridge.app"` | `"com.axibridge.app"` |
| `build.productName` | `"ArcBridge"` | `"AxiBridge"` |
| `build.artifactName` | `"ArcBridge-${version}.${ext}"` | `"AxiBridge-${version}.${ext}"` |
| `build.linux.artifactName` | `"ArcBridge-${version}.${ext}"` | `"AxiBridge-${version}.${ext}"` |
| `build.win.artifactName` | `"ArcBridge-${version}-Setup.${ext}"` | `"AxiBridge-${version}-Setup.${ext}"` |
| `build.publish.repo` | `"ArcBridge"` | **`"ArcBridge"` (unchanged)** |

The `publish.repo` stays as `"ArcBridge"` so the generated `app-update.yml` points existing installs to the right place. A follow-up commit after the GitHub repo rename changes this to `"AxiBridge"`.

## 2. User Data Migration

### Problem

Changing `productName` from `"ArcBridge"` to `"AxiBridge"` causes Electron to resolve `app.getPath('userData')` to `{appData}/AxiBridge/` instead of `{appData}/ArcBridge/`. Since `electron-store` uses `app.getPath('userData')` as its default `cwd`, existing users' settings would be lost.

Additionally, the auto-generated `updaterCacheDirName` (currently `arcbridge-updater`, derived from the package `name`) will change to `axibridge-updater`. This is harmless — the old cache dir is just orphaned.

### Solution

Add a synchronous migration step in `src/main/index.ts` that runs **before** `new Store()` is called:

```
function migrateUserData() {
    if (!app.isPackaged) return;  // dev mode handled separately
    const appData = app.getPath('appData');
    const oldDir = path.join(appData, 'ArcBridge');
    const newDir = path.join(appData, 'AxiBridge');
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
        fs.cpSync(oldDir, newDir, { recursive: true });
    }
}
```

Key details:
- **Copy, not move** — leaves old dir as rollback fallback
- **Runs before `new Store()`** — so electron-store finds the migrated config
- **Idempotent** — only copies if old exists and new doesn't
- **Dev mode**: `ArcBridge-Dev` → `AxiBridge-Dev` (same pattern, in the dev-mode branch)

### DPS Report Cache

The temp directory `arcbridge-dps-report-cache` renames to `axibridge-dps-report-cache`. Same copy-if-old-exists pattern, applied to `app.getPath('temp')`.

## 3. Windows NSIS Uninstall of Old Version

### Problem

Changing `appId` from `com.arcbridge.app` to `com.axibridge.app` means the NSIS installer treats this as a new app. Users end up with both installed.

### Solution

Create `build/installer.nsh` with a custom NSIS macro that runs during install:

1. Read registry key `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\com.arcbridge.app\UninstallString` (electron-builder NSIS uses the raw appId as the registry key name, not GUID-wrapped)
2. If found, execute the old uninstaller with `/S` (silent) flag
3. Wait for completion, then proceed with new install

Reference in `package.json`:
```json
"nsis": {
    "oneClick": true,
    "allowToChangeInstallationDirectory": false,
    "differentialPackage": true,
    "include": "build/installer.nsh"
}
```

The uninstall happens silently since the installer is already `oneClick: true`.

## 4. Linux AppImage & Windows Portable Migration

Extend `migrateLegacyInstallName` in `src/main/index.ts` to add a second rename step:

**Current chain:** `gw2_arc_log_uploader` → `ArcBridge`
**New chain:** `gw2_arc_log_uploader` → `ArcBridge` → `AxiBridge`

Add a new function `migrateArcBridgeInstallName()` using the same pattern as the existing `migrateLegacyInstallName()`:
- Detect if the running binary starts with `ArcBridge`
- Copy to `AxiBridge`-prefixed name
- Guard with a version check (the version this ships as)

## 5. Branding String Rename

### Source Code (src/)

| File | What changes |
|------|-------------|
| `src/main/index.ts:139` | `'ArcBridge-Dev'` → `'AxiBridge-Dev'` |
| `src/main/index.ts:171` | `'arcbridge-dps-report-cache'` → `'axibridge-dps-report-cache'` |
| `src/main/index.ts:310` | `GITHUB_PROTOCOL = 'arcbridge'` → `'axibridge'` (users with active OAuth sessions will need to re-authenticate once) |
| `src/main/index.ts:648` | Keep `'ArcBridge'` as `newPrefix` in legacy migration (it migrates TO ArcBridge from gw2_arc_log_uploader) |
| `src/main/index.ts:718` | Tray tooltip `'ArcBridge'` → `'AxiBridge'` |
| `src/main/discord.ts:33` | Avatar URL — update image filename once renamed |
| `src/main/discord.ts:295,1007,1015` | Discord username `"ArcBridge"` → `"AxiBridge"` |
| `src/main/discord.ts:942` | Footer `'ArcBridge •'` → `'AxiBridge •'` |
| `src/main/integration.ts:8` | Fallback app name → `'AxiBridge'` |
| `src/main/handlers/appHandlers.ts:26` | User-Agent `'ArcBridge'` → `'AxiBridge'` |
| `src/main/handlers/settingsHandlers.ts:184,185` | Dialog title and default filename → `'AxiBridge'` / `'axibridge-settings.json'` |
| `src/main/handlers/githubHandlers.ts` | User-Agent headers and HTML titles → `'AxiBridge'` |
| `src/renderer/App.tsx` | `arcbridgeLogoStyle` → `axibridgeLogoStyle` |
| `src/renderer/app/AppLayout.tsx` | Logo aria-label → `'AxiBridge logo'` |
| `src/renderer/WalkthroughModal.tsx` | Logo style, className, aria-label → AxiBridge |
| `src/renderer/HowToModal.tsx` | Icon key, className, aria-label → AxiBridge |
| `src/renderer/SettingsView.tsx` | License text, about section → `'AxiBridge'` |
| `src/web/reportApp.tsx` | Logo URL variable, mask images → AxiBridge |

### CSS (src/renderer/index.css)

| Selector/Variable | Change |
|-------------------|--------|
| `--arcbridge-gradient` | → `--axibridge-gradient` |
| `.arcbridge-gradient-text` | → `.axibridge-gradient-text` |
| `.arcbridge-logo` | → `.axibridge-logo` |

### HTML

| File | Change |
|------|--------|
| `index.html` | `<title>ArcBridge</title>` → `<title>AxiBridge</title>` |
| `web/index.html` | `<title>ArcBridge</title>` → `<title>AxiBridge</title>` |

### Config Files

| File | Change |
|------|--------|
| `.gitignore` | `arcbridge-settings.json` → `axibridge-settings.json` |
| `docs/support/how-to-tree.json` | ID, title, summary → AxiBridge |

### Image Files

Rename (git mv):
- `public/img/ArcBridge.png` → `public/img/AxiBridge.png`
- `public/img/ArcBridgeAppIcon.png` → `public/img/AxiBridgeAppIcon.png`
- `public/img/ArcBridgeDiscord.png` → `public/img/AxiBridgeDiscord.png`
- `public/img/ArcBridgeGradient.png` → `public/img/AxiBridgeGradient.png`
- `public/svg/ArcBridge.svg` → `public/svg/AxiBridge.svg` (if exists)

Keep existing `AxiBridge-white.png` and `AxiBridge-white.svg` as-is.

Backup/working files (`*.kra`, `*.png~`) can be renamed or deleted at your discretion.

### Tests

Update string assertions in:
- `src/renderer/__tests__/App.firstTimeExperience.test.tsx` — `'Welcome to ArcBridge'` → `'Welcome to AxiBridge'`
- `src/shared/__tests__/autoUpdateErrors.test.ts` — URL fixture update
- `tests/e2e/electron/app.spec.ts` — window title regex `/ArcBridge/i` → `/AxiBridge/i`

### Documentation

Update "ArcBridge" → "AxiBridge" in:
- `README.md`
- `CLAUDE.md`
- `docs/new_features.md`
- `docs/theme-design-spec.md`
- Other docs referencing the app name

### Scripts

- `scripts/fetch-latest-log-json.mjs` — config path references
- `scripts/fake-first-time.mjs` — default filename

## 6. What Does NOT Change (Yet)

- **`build.publish.repo`** — stays `"ArcBridge"` until after GitHub repo rename
- **GitHub URLs** in source code (release notes API, license links, repo links) — stay pointing to `darkharasho/ArcBridge`. Updated in a follow-up after repo rename. GitHub redirects cover any users who click these links after rename.
- **Legacy migration code** (`gw2_arc_log_uploader` → `ArcBridge`) — preserved for long-time non-updaters
- **`src/main/handlers/appHandlers.ts:19`** — GitHub API URL stays `darkharasho/ArcBridge` (will redirect after rename)

## 7. Release Sequence

1. Implement all changes on a feature branch
2. Build and publish to `darkharasho/ArcBridge` as a draft release
3. Test auto-update from an existing ArcBridge install (verify it finds the release, installs, migrates data, removes old Windows install)
4. Publish the release
5. Rename the GitHub repo to `darkharasho/axibridge` (lowercase)
6. Follow-up commit: update `build.publish.repo` to `"axibridge"` and all GitHub URLs in source to use `darkharasho/axibridge`
