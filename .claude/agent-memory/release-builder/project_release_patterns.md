---
name: Release patterns and conventions
description: How releases are structured (CI vs local mode scripts), where artifacts live, RELEASE_NOTES.md format requirements, and conventions observed across release runs
metadata:
  type: project
---

Release notes live in `RELEASE_NOTES.md` at the repo root, **overwritten** (not appended) each release — only the current release's notes should be in the file at tag-push time. Style guide: `docs/release-notes-style.md`.

Two separate release scripts, chosen by build mode:
- **CI mode** (default): `node scripts/prepare-release.mjs <bump> --skip-release-notes`. Runs `npm run validate` (typecheck+lint only — NOT the full test suite), bumps `package.json` + `npm install`, commits `chore: release v<X>`, pushes to main, tags `v<X>`, pushes the tag. Does not build artifacts locally.
- **Local mode**: `node scripts/build-github.mjs <bump> --skip-release-notes`. Full pipeline: validate, ci:local (audits + unit + e2e tests), version bump + commit + push, build, commit-web-dist, electron-builder (linux+win), tag+push, GitHub Release upload. (An earlier version of this memory only described this local-mode script and called it "the full release pipeline" — that conflated the two modes. Keep them distinct.)

Important: in CI mode, the full test suite (`audit:boons`, `audit:metrics`, `audit:conditions:consistency`, `test:unit`) is **not** run locally by `prepare-release.mjs` — it runs as the gating `test` job inside `.github/workflows/release.yml`, which the `build` job (`needs: [test]`) depends on. So pushing the tag in CI mode still gets full-suite coverage before artifacts build, just remotely rather than locally. `prepare-release.mjs`'s inline comment confirms this is intentional: "Quick local validation (typecheck + lint); full test suite runs in CI".

`.github/workflows/release.yml` (display name in `gh run list`: **"Build Release Artifacts"**) triggers on `push: tags: ['v*']` with 4 jobs: `test` → `build` (matrix: linux AppImage + win nsis, via `electron-builder --publish always`) → `deploy-pages` (GitHub Pages web report) + `publish` (un-drafts the GH release, sets notes, posts to Discord if `DISCORD_WEBHOOK_URL` var is set). Only one workflow run is triggered per tag push (find it via `gh run list --json headBranch --jq 'select(.headBranch == "<tag>")'`).

Feature branches in this repo are often worked in worktrees (`.claude/worktrees/<name>` or `.worktrees/<name>`), each producing its own "docs: add design spec"/"docs: add implementation plan" commits alongside the feature commits. When merged/cherry-picked into `main`, these docs commits can appear twice (once from the worktree branch, once as a cherry-pick duplicate with a different hash but the same message) — e.g. v2.14.3 had `b718d4d1`/`3d21f008`/`4d9b9461`/`0ad42842` (feature) plus `40c099dd`/`4d6f9650`/`d7d43478`/`aa33e97c` (2 docs messages × 2 duplicates). Treat these internal design-doc/plan commits as non-user-facing and exclude them from release notes even though they don't match the style guide's generic `chore:`/`build:`/dependency filters.

**Critical**: the `publish` job's "Set release notes" step extracts the section from `RELEASE_NOTES.md` matching a line `^Version v<TAG> — ` (awk match on the exact tag string). If no matching section exists, it fails loudly (`exit 1`) rather than publishing with empty notes. This means `RELEASE_NOTES.md`'s header (`Version v<VERSION> — <Month Day, Year>`) must exactly match the tag being pushed, or the CI publish step fails even though the build/tag already succeeded. Write release notes with the correct target version *before* running either release script.

`prepare-release.mjs`'s release commit stages only `package.json`, `package-lock.json`, and `RELEASE_NOTES.md` (confirmed v2.15.0: "3 files changed" matched exactly these). It does not `git add -A` — unrelated dirty files elsewhere in the working tree (e.g. uncommitted agent-memory edits, untracked `.claude/worktrees/`) are left alone and don't get swept into the release commit. Safe to run the release with other local changes uncommitted.

Artifact output directory (local mode only): `dist_out/`
- Linux AppImage: `dist_out/AxiBridge-{version}.AppImage`
- Windows NSIS installer: `dist_out/AxiBridge-{version}-Setup.exe`

Version tag pattern: `v{semver}` (e.g. `v2.13.10`). Patch bumps increment the 3rd number only (2.13.9 → 2.13.10, not 2.14.0). `npm install` during the bump step prints a pre-existing `npm audit` vulnerability summary (33 vulnerabilities as of 2026-07) — unrelated to the release, non-blocking, not a regression to chase.

The chunk-size warnings from Vite (index.js > 500 kB) are pre-existing and non-blocking.

**Why:** Documents conventions so future runs don't re-discover them, and so CI vs local mode isn't conflated.
**How to apply:** Write release notes to `RELEASE_NOTES.md` (header must exactly match the tag about to be pushed) before running either script. In CI mode, do not manually run `ci:local`/tests yourself — the release workflow's `test` job covers it after the tag is pushed. Only run the one documented command for the requested mode; never run individual build/test steps yourself.
