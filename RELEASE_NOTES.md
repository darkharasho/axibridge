# Release Notes

Version v1.40.0 — March 3, 2026

## New features and major updates
- Heal Effectiveness: a new Heal Effectiveness section with calculation logic for healing metrics. See how efficiently healing is used in fights.
- Fight diff and timeline/map data: fight differences are now computed with new tables, plus timeline and map data are processed to show how fights change over time.
- Spike damage and WvW labels: added spike damage data and utilities to handle World vs World labels.
- Settings and uploads: new handlers to manage application settings and log uploads more directly from the app.
- KDR updates: KDR now uses total allies dead and adds an alliesDead field in rollup data.
  - NOTE: this applies to new data going forward; existing recordings won’t gain the alliesDead field retroactively.
- Top lists: enhanced addTopList with filtering options and zero allowances to focus the data you care about.
- MVP cards: visuals updated for improved visibility and hover feedback.

## Big UX improvements
- File picker UX refined: easier to pick and attach files, with clearer interactions.

## Visual/Theme updates
- Icon path fix: application icon now loads from the correct filename.
- Kinetic slate web theme: updated to align with the new visuals.
- Frontend assets refreshed: dist-web assets updated to reflect the UI changes.

## QoL Improvements
- Code and state management facelift: App component split into hooks for settings, upload retry queue, and navigation; metrics, constants, and shared state structures reorganized for clarity and maintainability. This should make future tweaks smoother and debugging quicker.

## Fixes
- Date picker reliability: showPicker behavior refined so date picking is more predictable.
- Web reports theme overrides: user theme overrides are now respected in web reports again.
