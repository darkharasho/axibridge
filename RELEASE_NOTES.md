# Release Notes

Version v2.5.8 — April 18, 2026

## Redesigned Web Upload Modal

The upload modal now shows a proper step-by-step progress indicator (Prepare → Build → Package → Upload → Finalize) with a live activity log streaming status messages as they arrive. The old single-line status that sometimes got stuck on "Preparing report..." is gone.

## Upload Log Viewer

After a successful upload, the banner now has a **Logs** button that reopens the full activity log from that upload in a modal. Useful if something looked off and you want to review what happened.

## History Tab: Copy Link & Delete

Each report card in the History tab now has a three-dot menu with two actions: **Copy link** copies the web address for that report to your clipboard, and **Delete** removes it from GitHub Pages (and from R2 if you have that configured).

## Theme-Aware Upload UI & Map Chrome

The upload modal, banner, and a few map elements (active fight card highlight, commander tag range rings, the squad DPS chart line) now pick up your chosen color palette instead of always being cyan-blue.

## Fixes

- Upload modal now correctly shows live status messages from the backend instead of staying stuck on the initial "Preparing report..." text.
- Build status error icon in the upload banner now shows a red background as intended.
- Rapid second uploads no longer leave the modal faded out.
- Glass mode dropdowns are now solid-colored instead of see-through.
