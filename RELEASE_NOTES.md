# Release Notes

Version v1.41.0 — March 20, 2026

## Damage Modifiers Section

- A new Damage Modifiers section is now available in the stats dashboard, showing per-player modifier totals aggregated across fights.
- The section includes both a collapsed sidebar view and a full expanded/fullscreen dense table view.
- A chart/table toggle lets you switch between a bar chart overlay and a raw table for each modifier.
- Personal vs. shared damage modifiers can be filtered with a hypothetical toggle.
- Negative modifiers (reduced damage) are visually distinguished from positive ones.
- The damage modifier data is merged across all selected logs and exposed in the stats output.

NOTE: Damage modifier data depends on EI providing `damageModMap` in the log JSON. Older uploads may not include this data; re-uploading those logs will pick it up.

## APM (No Procs) Column

- A new APM (No Procs) column has been added to the All Skills view, showing actions per minute excluding auto-attacks, trait procs, gear procs, and unconditional procs.
- Proc flags are now preserved through the full data pipeline: EI JSON parsing, renderer-side pruning, and `computeSkillUsageData`.

## Condition Metrics Improvements

- Condition metrics tracking now handles outgoing conditions more accurately, with improved pruning logic to keep only the relevant condition data through the processing pipeline.

## Pruning Improvements

- Both the main-process and renderer-side pruners have been converted from allowlist to denylist models, which makes it easier to preserve new EI fields automatically without needing to explicitly add them.

## Bug Fixes

- Fixed `damageModMap` and modifier arrays being dropped during main-process pruning, causing missing data on subsequent views.
- Fixed a case where cached log details missing `damageModMap` would not trigger a re-fetch; affected logs now re-hydrate correctly.
- Reverted and re-applied the EI incoming flag modifier filter — modifiers are now split by the player data itself rather than filtered by an EI flag.
- Fixed SVG fill colors on icon components and corrected button label from prior text to "Copy Link".
- Removed an XSS risk from a `dangerouslySetInnerHTML` usage in the modifiers section.
- Fixed bar gradient rendering and duplicate player entries in the modifiers chart view.

## Internal Changes

- Added design specs and implementation plans for damage modifiers, APM No Procs, and pruning denylist conversion.
- `autoAttack` option is now included in skill metadata and flows through pruning logic.
