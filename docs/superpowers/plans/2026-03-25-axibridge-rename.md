# AxiBridge Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the app from ArcBridge to AxiBridge across the entire codebase, with user data migration, Windows NSIS old-app uninstall, and Linux/portable binary rename — while preserving auto-update continuity from existing ArcBridge installs.

**Architecture:** Big-bang rename in a single release. The `build.publish.repo` stays as `"ArcBridge"` so existing installs find the update. A synchronous userData migration copies `{appData}/ArcBridge/` → `{appData}/AxiBridge/` before the store initializes. A custom NSIS script silently uninstalls the old `com.arcbridge.app` install on Windows.

**Tech Stack:** Electron, electron-builder, NSIS, electron-store, TypeScript, React, Vite

**Spec:** `docs/superpowers/specs/2026-03-25-axibridge-rename-design.md`

---

## Task 1: User Data Migration (src/main/index.ts)

**Files:**
- Modify: `src/main/index.ts:138-146` (add migration before Store init)

This is the most critical change — it must run before `new Store()` to ensure electron-store finds the migrated config.

- [ ] **Step 1: Add migrateUserData function and call it before Store init**

In `src/main/index.ts`, insert the migration function and its call between the dev-mode userData override (line 141) and the Store instantiation (line 145):

```typescript
// Insert after line 141 (end of the dev-mode if block), before line 143 (setupConsoleLogger)

// ─── User data migration: ArcBridge → AxiBridge ─────────────────────────────
// Must run before `new Store()` — electron-store derives its path from
// app.getPath('userData'), which changed when productName became "AxiBridge".
if (app.isPackaged) {
    const appData = app.getPath('appData');
    const oldDir = path.join(appData, 'ArcBridge');
    const newDir = path.join(appData, 'AxiBridge');
    if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
        try {
            fs.cpSync(oldDir, newDir, { recursive: true });
            log.info('[Migration] Copied userData from ArcBridge to AxiBridge');
        } catch (err: any) {
            log.warn('[Migration] Failed to copy userData:', err?.message || err);
        }
    }
} else {
    // Dev mode: migrate ArcBridge-Dev → AxiBridge-Dev
    const appData = app.getPath('appData');
    const oldDevDir = path.join(appData, 'ArcBridge-Dev');
    const newDevDir = path.join(appData, 'AxiBridge-Dev');
    if (fs.existsSync(oldDevDir) && !fs.existsSync(newDevDir)) {
        try {
            fs.cpSync(oldDevDir, newDevDir, { recursive: true });
            log.info('[Migration] Copied dev userData from ArcBridge-Dev to AxiBridge-Dev');
        } catch (err: any) {
            log.warn('[Migration] Failed to copy dev userData:', err?.message || err);
        }
    }
}
```

- [ ] **Step 2: Update the dev userData path**

Change line 139:
```typescript
// Before:
const devUserDataDir = path.join(app.getPath('appData'), 'ArcBridge-Dev');
// After:
const devUserDataDir = path.join(app.getPath('appData'), 'AxiBridge-Dev');
```

- [ ] **Step 3: Update the DPS report cache directory name**

Change line 171:
```typescript
// Before:
const getDpsReportCacheDir = () => path.join(app.getPath('temp'), 'arcbridge-dps-report-cache');
// After:
const getDpsReportCacheDir = () => path.join(app.getPath('temp'), 'axibridge-dps-report-cache');
```

Also add a cache directory migration near the userData migration (after the userData migration block):

```typescript
// Migrate DPS report cache directory
const oldCacheDir = path.join(app.getPath('temp'), 'arcbridge-dps-report-cache');
const newCacheDir = path.join(app.getPath('temp'), 'axibridge-dps-report-cache');
if (fs.existsSync(oldCacheDir) && !fs.existsSync(newCacheDir)) {
    try {
        fs.renameSync(oldCacheDir, newCacheDir);
        log.info('[Migration] Renamed DPS report cache directory');
    } catch (err: any) {
        log.warn('[Migration] Failed to rename cache dir:', err?.message || err);
    }
}
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS (no type errors introduced)

- [ ] **Step 5: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: add userData migration from ArcBridge to AxiBridge"
```

---

## Task 2: Windows NSIS Uninstall Script (build/installer.nsh)

**Files:**
- Create: `build/installer.nsh`
- Modify: `package.json:141-145` (add nsis.include)

- [ ] **Step 1: Create the NSIS include script**

Create `build/installer.nsh`:

```nsis
!macro customInit
  ; Check if old ArcBridge (com.arcbridge.app) is installed and uninstall it silently
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\com.arcbridge.app" "UninstallString"
  ${If} $0 != ""
    ; Extract the directory from the uninstall string (it may be quoted)
    ${If} ${FileExists} $0
      ExecWait '"$0" /S --keep-data'
    ${Else}
      ; Try removing quotes
      StrCpy $1 $0 "" 1
      StrLen $2 $1
      IntOp $2 $2 - 1
      StrCpy $1 $1 $2
      ${If} ${FileExists} $1
        ExecWait '"$1" /S --keep-data'
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
```

- [ ] **Step 2: Reference the script in package.json**

In `package.json`, add `"include"` to the `nsis` block:

```json
"nsis": {
    "oneClick": true,
    "allowToChangeInstallationDirectory": false,
    "differentialPackage": true,
    "include": "build/installer.nsh"
}
```

- [ ] **Step 3: Commit**

```bash
git add build/installer.nsh package.json
git commit -m "feat: add NSIS script to silently uninstall old ArcBridge on Windows"
```

---

## Task 3: Linux AppImage & Windows Portable Binary Rename (src/main/index.ts)

**Files:**
- Modify: `src/main/index.ts:645-683` (extend migration chain)

- [ ] **Step 1: Update migrateLegacyInstallName to also migrate ArcBridge → AxiBridge**

The existing function (lines 645-683) migrates `gw2_arc_log_uploader` → `ArcBridge`. Add a second call that migrates `ArcBridge` → `AxiBridge`. The simplest approach is to add a new function alongside it:

```typescript
const migrateArcBridgeInstallName = () => {
    if (!app.isPackaged) return;
    const legacyPrefix = 'ArcBridge';
    const newPrefix = 'AxiBridge';

    if (process.platform === 'linux') {
        const appImagePath = process.env.APPIMAGE;
        if (!appImagePath) return;
        const baseName = path.basename(appImagePath);
        if (!baseName.startsWith(legacyPrefix)) return;
        // Don't rename if already AxiBridge
        if (baseName.startsWith(newPrefix)) return;
        const newName = baseName.replace(legacyPrefix, newPrefix);
        const targetPath = path.join(path.dirname(appImagePath), newName);
        if (fs.existsSync(targetPath)) return;
        try {
            fs.copyFileSync(appImagePath, targetPath);
            fs.chmodSync(targetPath, 0o755);
            log.info(`[Bridge] Created new AppImage name: ${targetPath}`);
        } catch (err: any) {
            log.warn(`[Bridge] Failed to copy AppImage to new name: ${err?.message || err}`);
        }
        return;
    }

    if (process.platform === 'win32') {
        const portablePath = process.env.PORTABLE_EXECUTABLE;
        if (!portablePath) return;
        const baseName = path.basename(portablePath);
        if (!baseName.startsWith(legacyPrefix)) return;
        if (baseName.startsWith(newPrefix)) return;
        const newName = baseName.replace(legacyPrefix, newPrefix);
        const targetPath = path.join(path.dirname(portablePath), newName);
        if (fs.existsSync(targetPath)) return;
        try {
            fs.copyFileSync(portablePath, targetPath);
            log.info(`[Bridge] Created new portable name: ${targetPath}`);
        } catch (err: any) {
            log.warn(`[Bridge] Failed to copy portable exe to new name: ${err?.message || err}`);
        }
    }
};
```

- [ ] **Step 2: Call the new function**

Find where `migrateLegacyInstallName()` is called (in the `app.whenReady()` block) and add the new call right after it:

```typescript
migrateLegacyInstallName();
migrateArcBridgeInstallName();
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: add AppImage/portable binary rename from ArcBridge to AxiBridge"
```

---

## Task 4: Package.json Identity Rename

**Files:**
- Modify: `package.json` (lines 2, 5, 104, 105, 109, 127, 135)

- [ ] **Step 1: Update all identity fields**

Apply these edits to `package.json`:

| Line | Old | New |
|------|-----|-----|
| 2 | `"name": "arcbridge"` | `"name": "axibridge"` |
| 5 | `"ArcBridge - Guild Wars 2 arcDPS Log Uploader"` | `"AxiBridge - Guild Wars 2 arcDPS Log Uploader"` |
| 104 | `"appId": "com.arcbridge.app"` | `"appId": "com.axibridge.app"` |
| 105 | `"productName": "ArcBridge"` | `"productName": "AxiBridge"` |
| 109 | `"ArcBridge-${version}.${ext}"` | `"AxiBridge-${version}.${ext}"` |
| 127 | `"ArcBridge-${version}.${ext}"` | `"AxiBridge-${version}.${ext}"` |
| 135 | `"ArcBridge-${version}-Setup.${ext}"` | `"AxiBridge-${version}-Setup.${ext}"` |

**DO NOT change line 113** (`"repo": "ArcBridge"`) — this stays as-is for auto-update continuity.

- [ ] **Step 2: Verify package-lock.json updates**

Run: `npm install`
This regenerates `package-lock.json` with the new package name.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: rename package identity from ArcBridge to AxiBridge"
```

---

## Task 5: Rename Image Assets

**Files:**
- Rename: `public/img/ArcBridge.png` → `public/img/AxiBridge.png`
- Rename: `public/img/ArcBridgeAppIcon.png` → `public/img/AxiBridgeAppIcon.png`
- Rename: `public/img/ArcBridgeDiscord.png` → `public/img/AxiBridgeDiscord.png`
- Rename: `public/img/ArcBridgeGradient.png` → `public/img/AxiBridgeGradient.png`
- Rename: `public/svg/ArcBridge.svg` → `public/svg/AxiBridge.svg` (if it exists)
- Clean up: `public/img/ArcBridge.png~`, `public/img/ArcBridgeAppIcon.png~`, `public/img/ArcBridgeAppIcon.png.kra`, `public/img/ArcBridgeDiscord.kra` — rename or delete at discretion

- [ ] **Step 1: Rename image files using git mv**

```bash
git mv public/img/ArcBridge.png public/img/AxiBridge.png
git mv public/img/ArcBridgeAppIcon.png public/img/AxiBridgeAppIcon.png
git mv public/img/ArcBridgeDiscord.png public/img/AxiBridgeDiscord.png
git mv public/img/ArcBridgeGradient.png public/img/AxiBridgeGradient.png
```

Check if `public/svg/ArcBridge.svg` exists before renaming:
```bash
[ -f public/svg/ArcBridge.svg ] && git mv public/svg/ArcBridge.svg public/svg/AxiBridge.svg
```

For backup/working files, rename them too:
```bash
git mv public/img/ArcBridge.png~ public/img/AxiBridge.png~ 2>/dev/null || true
git mv public/img/ArcBridgeAppIcon.png~ public/img/AxiBridgeAppIcon.png~ 2>/dev/null || true
git mv public/img/ArcBridgeAppIcon.png.kra public/img/AxiBridgeAppIcon.png.kra 2>/dev/null || true
git mv public/img/ArcBridgeDiscord.kra public/img/AxiBridgeDiscord.kra 2>/dev/null || true
```

- [ ] **Step 2: Commit**

```bash
git add -A public/img/ public/svg/
git commit -m "chore: rename image assets from ArcBridge to AxiBridge"
```

---

## Task 6: Main Process Branding Rename

**Files:**
- Modify: `src/main/index.ts` (lines 310, 718)
- Modify: `src/main/discord.ts` (lines 33, 295, 942, 1007, 1015)
- Modify: `src/main/integration.ts` (line 8)
- Modify: `src/main/handlers/appHandlers.ts` (line 26)
- Modify: `src/main/handlers/settingsHandlers.ts` (lines 184, 185)
- Modify: `src/main/handlers/githubHandlers.ts` (lines 32, 85, 148, 344, 583, 850, 857)

- [ ] **Step 1: Update src/main/index.ts**

Line 310 — protocol handler:
```typescript
// Before:
const GITHUB_PROTOCOL = 'arcbridge';
// After:
const GITHUB_PROTOCOL = 'axibridge';
```

Line 718 — tray tooltip:
```typescript
// Before:
tray.setToolTip('ArcBridge');
// After:
tray.setToolTip('AxiBridge');
```

- [ ] **Step 2: Update src/main/discord.ts**

Line 33 — avatar URL (update image filename to match renamed asset):
```typescript
// Before:
const DISCORD_WEBHOOK_AVATAR_URL = 'https://raw.githubusercontent.com/darkharasho/ArcBridge/main/public/img/ArcBridgeDiscord.png';
// After:
const DISCORD_WEBHOOK_AVATAR_URL = 'https://raw.githubusercontent.com/darkharasho/ArcBridge/main/public/img/AxiBridgeDiscord.png';
```

Lines 295, 1007, 1015 — Discord webhook usernames (replace all occurrences):
```typescript
// Before:
username: "ArcBridge",
// After:
username: "AxiBridge",
```

Line 942 — embed footer:
```typescript
// Before:
text: `ArcBridge • ${new Date().toLocaleTimeString()}`
// After:
text: `AxiBridge • ${new Date().toLocaleTimeString()}`
```

- [ ] **Step 3: Update src/main/integration.ts**

Line 8:
```typescript
// Before:
this.appName = app.name || 'ArcBridge';
// After:
this.appName = app.name || 'AxiBridge';
```

- [ ] **Step 4: Update src/main/handlers/appHandlers.ts**

Line 26 — User-Agent:
```typescript
// Before:
'User-Agent': 'ArcBridge',
// After:
'User-Agent': 'AxiBridge',
```

**DO NOT change line 19** — the GitHub API URL stays as `darkharasho/ArcBridge` for now.

- [ ] **Step 5: Update src/main/handlers/settingsHandlers.ts**

Line 184:
```typescript
// Before:
title: 'Export ArcBridge Settings',
// After:
title: 'Export AxiBridge Settings',
```

Line 185:
```typescript
// Before:
defaultPath: 'arcbridge-settings.json',
// After:
defaultPath: 'axibridge-settings.json',
```

Also check for an import settings dialog with similar text and update it too.

- [ ] **Step 6: Update src/main/handlers/githubHandlers.ts**

Replace all `'User-Agent': 'ArcBridge'` with `'User-Agent': 'AxiBridge'` (lines 32, 85, 148, 850, 857).

Line 344:
```typescript
// Before:
description: 'ArcBridge Reports'
// After:
description: 'AxiBridge Reports'
```

Line 583:
```typescript
// Before:
<title>ArcBridge</title>
// After:
<title>AxiBridge</title>
```

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/main/index.ts src/main/discord.ts src/main/integration.ts src/main/handlers/
git commit -m "feat: rename all main process branding from ArcBridge to AxiBridge"
```

---

## Task 7: Renderer Branding Rename

**Files:**
- Modify: `src/renderer/App.tsx` (line 556)
- Modify: `src/renderer/app/AppLayout.tsx` (lines 25, 141)
- Modify: `src/renderer/WalkthroughModal.tsx` (lines 14, 31, 53, 56)
- Modify: `src/renderer/HowToModal.tsx` (lines 79-85, 221-225)
- Modify: `src/renderer/SettingsView.tsx` (lines 2233, 2254, 2276, 2284)
- Modify: `src/renderer/index.css` (lines 251, 254, 255, 840)

- [ ] **Step 1: Update src/renderer/App.tsx**

Line 556 — rename variable:
```typescript
// Before:
const arcbridgeLogoStyle = { WebkitMaskImage: `url(${appIconPath})`, maskImage: `url(${appIconPath})` } as const;
// After:
const axibridgeLogoStyle = { WebkitMaskImage: `url(${appIconPath})`, maskImage: `url(${appIconPath})` } as const;
```

Update all references to `arcbridgeLogoStyle` → `axibridgeLogoStyle` in this file (prop passing).

- [ ] **Step 2: Update src/renderer/app/AppLayout.tsx**

Line 25 — prop destructuring:
```typescript
// Before:
arcbridgeLogoStyle,
// After:
axibridgeLogoStyle,
```

Line 141 — logo element:
```typescript
// Before:
<span className="arcbridge-logo h-5 w-5" style={arcbridgeLogoStyle} aria-label="ArcBridge logo" />
// After:
<span className="axibridge-logo h-5 w-5" style={axibridgeLogoStyle} aria-label="AxiBridge logo" />
```

Update the prop type definition for this component as well.

- [ ] **Step 3: Update src/renderer/WalkthroughModal.tsx**

Line 14:
```typescript
// Before:
description: 'ArcBridge watches your arcdps logs folder...'
// After:
description: 'AxiBridge watches your arcdps logs folder...'
```

Line 31:
```typescript
// Before:
const arcbridgeLogoStyle = ...
// After:
const axibridgeLogoStyle = ...
```

Line 53:
```typescript
// Before:
<span className="arcbridge-logo h-7 w-7 rounded-lg" style={arcbridgeLogoStyle} aria-label="ArcBridge logo" />
// After:
<span className="axibridge-logo h-7 w-7 rounded-lg" style={axibridgeLogoStyle} aria-label="AxiBridge logo" />
```

Line 56:
```typescript
// Before:
<div className="text-lg font-bold text-white">Welcome to ArcBridge</div>
// After:
<div className="text-lg font-bold text-white">Welcome to AxiBridge</div>
```

- [ ] **Step 4: Update src/renderer/HowToModal.tsx**

Lines 79-85 — icon definition:
```typescript
// Before:
arcbridge: (node) => (
    <span className="arcbridge-logo w-5 h-5 inline-block mb-1 mx-1" ... aria-label="ArcBridge logo" />
)
// After:
axibridge: (node) => (
    <span className="axibridge-logo w-5 h-5 inline-block mb-1 mx-1" ... aria-label="AxiBridge logo" />
)
```

Update all other references in this file (icon key lookups, etc.).

- [ ] **Step 5: Update src/renderer/SettingsView.tsx**

Line 2254:
```typescript
// Before:
ArcBridge is free software by harasho...
// After:
AxiBridge is free software by harasho...
```

**DO NOT change lines 2233, 2276, 2284** — these are GitHub URLs that stay as `darkharasho/ArcBridge` for now.

- [ ] **Step 6: Update src/renderer/index.css**

Line 251:
```css
/* Before: */
--arcbridge-gradient: linear-gradient(90deg, #3b82f6, #6366f1);
/* After: */
--axibridge-gradient: linear-gradient(90deg, #3b82f6, #6366f1);
```

Line 254-255:
```css
/* Before: */
.arcbridge-gradient-text {
    background-image: var(--arcbridge-gradient);
/* After: */
.axibridge-gradient-text {
    background-image: var(--axibridge-gradient);
```

Line 840:
```css
/* Before: */
.arcbridge-logo {
/* After: */
.axibridge-logo {
```

- [ ] **Step 7: Run typecheck and lint**

Run: `npm run validate`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/renderer/
git commit -m "feat: rename all renderer branding from ArcBridge to AxiBridge"
```

---

## Task 8: Web Report Branding Rename

**Files:**
- Modify: `src/web/reportApp.tsx` (lines 951, 952, 956, 959, 1073, 1101, 1123, 1132, 1281, 1523, 1625, 1776, 2097)

- [ ] **Step 1: Update document titles**

Lines 951, 952, 956, 959 — page title strings:
```typescript
// Before:
`ArcBridge — ${report.meta.title} — ${dateLabel}`
`ArcBridge — ${report.meta.title}`
document.title = 'ArcBridge — All Reports';
document.title = 'ArcBridge Reports';
// After:
`AxiBridge — ${report.meta.title} — ${dateLabel}`
`AxiBridge — ${report.meta.title}`
document.title = 'AxiBridge — All Reports';
document.title = 'AxiBridge Reports';
```

- [ ] **Step 2: Update about/license text**

Line 1101:
```typescript
// Before:
ArcBridge is free software by harasho...
// After:
AxiBridge is free software by harasho...
```

**DO NOT change lines 1073, 1123, 1132** — these are GitHub URLs that stay as `darkharasho/ArcBridge`.

- [ ] **Step 3: Update logo variable name and aria-labels**

Line 1281:
```typescript
// Before:
const arcbridgeLogoUrl = joinAssetPath(assetBasePath, 'svg/AxiBridge.svg');
// After:
const axibridgeLogoUrl = joinAssetPath(assetBasePath, 'svg/AxiBridge.svg');
```

Update all references to `arcbridgeLogoUrl` → `axibridgeLogoUrl` (lines 1513, 1514).

Lines 1523, 1625, 1776 — aria-labels:
```typescript
// Before:
aria-label="ArcBridge logo"
// After:
aria-label="AxiBridge logo"
```

Line 2097:
```typescript
// Before:
alt="ArcBridge logo"
// After:
alt="AxiBridge logo"
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/web/reportApp.tsx
git commit -m "feat: rename web report branding from ArcBridge to AxiBridge"
```

---

## Task 9: HTML, Config, and Script Rename

**Files:**
- Modify: `index.html` (line 8)
- Modify: `web/index.html` (line 7)
- Modify: `.gitignore` (line 62)
- Modify: `docs/support/how-to-tree.json` (lines 2-5 and throughout)
- Modify: `scripts/fetch-latest-log-json.mjs` (lines 42, 43, 49-52, 76)
- Modify: `scripts/fake-first-time.mjs` (line 6)

- [ ] **Step 1: Update index.html**

Line 8:
```html
<!-- Before: -->
<title>ArcBridge</title>
<!-- After: -->
<title>AxiBridge</title>
```

- [ ] **Step 2: Update web/index.html**

Line 7:
```html
<!-- Before: -->
<title>ArcBridge</title>
<!-- After: -->
<title>AxiBridge</title>
```

- [ ] **Step 3: Update .gitignore**

Line 62:
```
# Before:
arcbridge-settings.json
# After:
axibridge-settings.json
```

- [ ] **Step 4: Update docs/support/how-to-tree.json**

Replace all occurrences of `ArcBridge` with `AxiBridge` and `arcbridge` with `axibridge` throughout the file. Key lines:

```json
"id": "axibridge",
"title": "AxiBridge How-To",
"summary": "Use this guide to navigate every core workflow in AxiBridge.",
```

And all content strings that reference the app name.

- [ ] **Step 5: Update scripts/fetch-latest-log-json.mjs**

Lines 42-43:
```javascript
// Before:
if (!watchDir && process.env.ARCBRIDGE_LOG_DIR) {
    watchDir = process.env.ARCBRIDGE_LOG_DIR;
// After:
if (!watchDir && process.env.AXIBRIDGE_LOG_DIR) {
    watchDir = process.env.AXIBRIDGE_LOG_DIR;
```

Lines 49-52 — config directory paths (keep old paths as fallbacks, add new ones first):
```javascript
// After:
path.join(xdgConfigHome, 'AxiBridge', 'config.json'),
path.join(xdgConfigHome, 'axibridge', 'config.json'),
path.join(xdgConfigHome, 'ArcBridge', 'config.json'),
path.join(xdgConfigHome, 'arcbridge', 'config.json'),
path.join(os.homedir(), '.config', 'AxiBridge', 'config.json'),
path.join(os.homedir(), '.config', 'axibridge', 'config.json'),
path.join(os.homedir(), '.config', 'ArcBridge', 'config.json'),
path.join(os.homedir(), '.config', 'arcbridge', 'config.json'),
```

Line 76 — error message:
```javascript
// Before:
ARCBRIDGE_LOG_DIR
// After:
AXIBRIDGE_LOG_DIR
```

- [ ] **Step 6: Update scripts/fake-first-time.mjs**

Line 6:
```javascript
// Before:
const inputPath = process.argv[2] || 'arcbridge-settings.json';
// After:
const inputPath = process.argv[2] || 'axibridge-settings.json';
```

- [ ] **Step 7: Commit**

```bash
git add index.html web/index.html .gitignore docs/support/how-to-tree.json scripts/
git commit -m "feat: rename HTML titles, config, and scripts from ArcBridge to AxiBridge"
```

---

## Task 10: Test Assertions Update

**Files:**
- Modify: `src/renderer/__tests__/App.firstTimeExperience.test.tsx` (lines 58, 73, 81, 99, 113, 117, 123, 142)
- Modify: `src/shared/__tests__/autoUpdateErrors.test.ts` (line 25)
- Modify: `tests/e2e/electron/app.spec.ts` (line 44)

- [ ] **Step 1: Update first-time experience test**

Replace all `'Welcome to ArcBridge'` with `'Welcome to AxiBridge'` (lines 58, 73, 81, 99, 113, 117, 142).

Line 123:
```typescript
// Before:
expect(screen.getAllByRole('button', { name: 'ArcBridge How-To' }).length).toBeGreaterThan(0);
// After:
expect(screen.getAllByRole('button', { name: 'AxiBridge How-To' }).length).toBeGreaterThan(0);
```

- [ ] **Step 2: Update auto-update error test**

Line 25 — the URL in the error fixture stays as `darkharasho/ArcBridge` since that's what the actual error message would contain from existing installs. **No change needed here** unless the test is checking a formatted output that includes the app name.

Review the test to confirm. If the assertion only checks the URL content, leave it. If it checks a user-facing message that includes "ArcBridge", update that part.

- [ ] **Step 3: Update E2E Electron test**

Line 44:
```typescript
// Before:
await expect(window).toHaveTitle(/ArcBridge/i);
// After:
await expect(window).toHaveTitle(/AxiBridge/i);
```

- [ ] **Step 4: Run unit tests**

Run: `npm run test:unit`
Expected: PASS (all tests pass with updated assertions)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/__tests__/ src/shared/__tests__/ tests/
git commit -m "test: update assertions from ArcBridge to AxiBridge"
```

---

## Task 11: Documentation Rename

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `docs/new_features.md`
- Modify: `docs/theme-design-spec.md`
- Modify: `.claude/agents/release-builder.md`
- Modify: `.claude/agent-memory/release-builder/project_release_patterns.md`
- Modify: Any other docs with "ArcBridge" references

- [ ] **Step 1: Update README.md**

Line 1 — update logo reference and title:
```markdown
# <img width="36" height="36" alt="AxiBridge logo" src="public/img/AxiBridge.png" /> AxiBridge
```

Replace all other `ArcBridge` occurrences with `AxiBridge` in the file.

- [ ] **Step 2: Update CLAUDE.md**

Replace all `ArcBridge` with `AxiBridge` throughout. Key lines:
- Line 7: `"AxiBridge is an Electron desktop app..."`
- Line 60: `"Dev userData is isolated to AxiBridge-Dev when not packaged"`
- Line 144: `"to AxiBridge-Dev to avoid corrupting production settings"`

- [ ] **Step 3: Update remaining docs**

- `docs/new_features.md`: title and references
- `docs/theme-design-spec.md`: title and ideology references
- `.claude/agents/release-builder.md`: memory path reference
- `.claude/agent-memory/release-builder/project_release_patterns.md`: artifact filenames

For any other docs found via grep, update `ArcBridge` → `AxiBridge` where it refers to the app name (not historical migration references).

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md docs/ .claude/
git commit -m "docs: rename ArcBridge to AxiBridge across documentation"
```

---

## Task 12: Final Validation

- [ ] **Step 1: Run full validate**

Run: `npm run validate`
Expected: PASS (typecheck + lint with zero warnings)

- [ ] **Step 2: Run unit tests**

Run: `npm run test:unit`
Expected: All tests pass

- [ ] **Step 3: Grep for remaining ArcBridge references**

Run: `grep -ri "arcbridge" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" --include="*.json" --include="*.html" --include="*.css" src/ web/ scripts/ index.html package.json .gitignore`

Expected remaining references (acceptable):
- `package.json` line 113: `"repo": "ArcBridge"` (intentionally kept)
- `src/main/index.ts`: legacy migration `newPrefix = 'ArcBridge'` (intentionally kept)
- `src/main/discord.ts`: avatar URL containing `darkharasho/ArcBridge` (GitHub URL, kept for now)
- `src/main/handlers/appHandlers.ts` line 19: GitHub API URL (kept for now)
- `src/renderer/SettingsView.tsx`: GitHub URLs (kept for now)
- `src/web/reportApp.tsx`: GitHub URLs (kept for now)
- `src/shared/__tests__/autoUpdateErrors.test.ts`: error fixture URL (kept)
- `scripts/fetch-latest-log-json.mjs`: old config paths kept as fallbacks

Any other references should be investigated and fixed.

- [ ] **Step 4: Run dev mode smoke test**

Run: `npm run dev`
Verify:
- Window title shows "AxiBridge"
- Tray tooltip shows "AxiBridge"
- Settings page shows "AxiBridge" branding
- No console errors about missing assets

- [ ] **Step 5: Commit any final fixes**

If any issues were found, fix and commit.
