# Release Notes

Version v1.20.3 — February 4, 2026

## 🌟 Highlights
- Expanded the how-to guide with icons and expanded content for easier navigation.
- Added walkthroughs and how-to guides focused on first-time users.
- Documentation now includes a reference for advanced developer settings that influence state updates.
- Web assets refreshed to keep things snappy on the web.

## 🛠️ Improvements
- Clearer timestamp handling and more precise metrics in combat stats for easier interpretation.
- Documentation enhancements to better guide you through features and workflows.
- Dev datasets now persist and restore a `snapshot.json` state (view, notification mode, stat settings, theme, and related dev UI state) alongside logs and report data.
- Dev dataset writes are now transactional: they stream into temporary folders and only become visible after a complete marker is written and an atomic finalize step succeeds.
- Dev dataset manifests now store relative log paths, and snapshot state captures deterministic log order and stable log ids for reliable state replays.

## 🧯 Fixes
- Added a select-none class to prevent text from being accidentally highlighted on buttons.

## ⚠️ Breaking Changes
- None.
