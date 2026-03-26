# AxiBridge Release Guide — Order of Operations

## Pre-Release

1. **Merge PR #18** (`feature/unified-theme-redesign` → `main`)

2. **Bump version** on `main` — pick your version number (this is a major branding change, so minor or major makes sense)

3. **Build both targets:**
   ```bash
   npm run build:linux    # produces AxiBridge-{version}.AppImage
   npm run build:win      # produces AxiBridge-{version}-Setup.exe
   ```

4. **Smoke test the builds locally:**
   - Launch the AppImage/installer — verify "AxiBridge" branding everywhere (window title, tray tooltip, settings page, walkthrough)
   - Check that Discord webhook posts show "AxiBridge" username
   - Confirm the about section says "AxiBridge is free software..."

## Release (while repo is still `darkharasho/ArcBridge`)

5. **Create a draft release** on `darkharasho/ArcBridge`:
   ```bash
   gh release create v{version} --draft --title "v{version}" \
     dist_out/AxiBridge-{version}.AppImage \
     dist_out/AxiBridge-{version}-Setup.exe
   ```
   Add release notes explaining the rename.

6. **Test auto-update from an existing ArcBridge install:**
   - Install a previous ArcBridge version (e.g., v1.43.x)
   - The draft release is already visible to electron-updater (config uses `"releaseType": "draft"`)
   - Verify:
     - Update downloads and installs successfully
     - App restarts as "AxiBridge"
     - All settings survived the migration
     - On Windows: old "ArcBridge" entry is gone from Add/Remove Programs

7. **If auto-update test passes**, the release is live (already visible as draft).

## Rename Repo (can do immediately after step 7)

8. **Rename the GitHub repo:**
   - Go to `github.com/darkharasho/ArcBridge` → Settings → Repository name
   - Change to `axibridge` (lowercase)
   - GitHub automatically creates permanent redirects — any user still on the old version checking `darkharasho/ArcBridge` for updates will be redirected to `darkharasho/axibridge` and find the release

9. **Update the codebase for the new repo name** (on a new branch off `main`):
   ```
   build.publish.repo  →  "axibridge"
   ```
   And all GitHub URLs in source code:
   ```
   darkharasho/ArcBridge  →  darkharasho/axibridge
   ```
   Files to update:
   - `package.json` line 113 (`build.publish.repo`)
   - `src/main/discord.ts` (avatar raw.githubusercontent URL)
   - `src/main/handlers/appHandlers.ts` (GitHub API URL)
   - `src/renderer/SettingsView.tsx` (repo link, LICENSE link, THIRD_PARTY_NOTICES link)
   - `src/web/reportApp.tsx` (repo link, LICENSE link, THIRD_PARTY_NOTICES link)
   - `src/shared/__tests__/autoUpdateErrors.test.ts` (error fixture URL)

10. **Merge, build, and release again** — this cleans up the URLs so future builds point directly to the right repo instead of relying on redirects.

## Rollback Plan

- If auto-update is broken: delete the draft release, users stay on old ArcBridge
- If userData migration fails: the old `ArcBridge/` directory is preserved (copy, not move) — users can manually copy it back
- If repo rename causes issues: GitHub redirects are permanent, so old URLs keep working indefinitely
