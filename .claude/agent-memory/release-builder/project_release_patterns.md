---
name: Release patterns and conventions
description: How releases are structured, where artifacts live, and conventions observed across release runs
type: project
---

Release notes are stored in `RELEASE_NOTES.md` at the repo root. Style guide is in `docs/release-notes-style.md`.

The full release pipeline is `node scripts/build-github.mjs <bump> --skip-release-notes`. This script handles everything after release notes are written: validate, ci:local, version bump + commit + push, full build, commit-web-dist, electron-builder (linux + win), git tag + push, and GitHub Release upload.

Artifact output directory: `dist_out/`
- Linux AppImage: `dist_out/AxiBridge-{version}.AppImage`
- Windows NSIS installer: `dist_out/AxiBridge-{version}-Setup.exe`

Version tag pattern: `v{semver}` (e.g. `v1.41.0`). Tags are created by `build-github.mjs` via `generate-release-notes.mjs`.

The chunk-size warnings from Vite (index.js > 500 kB) are pre-existing and non-blocking.

**Why:** Documents conventions so future runs don't re-discover them.
**How to apply:** Write release notes to `RELEASE_NOTES.md`, then run `build-github.mjs --skip-release-notes`. Do NOT run individual build steps yourself.
