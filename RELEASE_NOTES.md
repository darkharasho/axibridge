# Release Notes

Version v2.6.0 — April 26, 2026

## Squad Distance to Tag Table

A new section in the stats view shows per-player distance from the commander tag across all loaded fights. Each row gives you avg, p25, median, p75, and max distance, plus the number of fights that had usable replay data. Profession icons (with the multiclass dot) match the rest of the app, and you can filter by minimum-fights inline with the section header.

NOTE: This only works on logs that have replay data. If your cached details predate the replay setting being on, see the fix below.

## Squad Distance to Tag Visual

A dartboard-style radial visualisation of the same data — each player sits at their median distance from the tag, color-coded into muted distance bands. Useful for spotting at a glance who's playing in melee range vs. who's drifting out to ranged.

## Fights Ordered Chronologically

Fight Breakdown and Tag Distance Deaths now consistently number fights with F1 = earliest, F2 = next, etc. Previously these two views inherited the upload order (newest first), so F1 was actually your most recent fight while every other view used F1 = oldest. They now match.

## Fixes

- The "LOG" status pill no longer turns green until the log is actually finished processing.
- If your cached details for a log don't include replay data but you have "parse combat replay" enabled, the app will now re-parse instead of silently using the old data — needed for the new Squad Distance to Tag sections to populate retroactively.
- Distance-to-tag table toolbar stays on a single line and the min-fights toggle sits inline with the section title.

## QoL Improvements

- Cleaned up the dev-only "Copy Paths" button styling so it matches the surrounding toolbar buttons.
