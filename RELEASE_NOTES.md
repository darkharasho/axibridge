# Release Notes

Version v3.2.1 — August 27, 2026

## Fixes
- **Damage Modifiers section is no longer blank for locally parsed logs.** Logs parsed natively (rather than fetched from dps.report) were missing the `personalDamageMods` catalog, which the app used to tell personal modifiers apart from shared ones. With that catalog empty, every modifier was treated as unclassified and hidden behind the "Hypothetical" toggle, leaving the section showing "No damage modifier data available".
- An empty catalog is now treated as *unclassified* rather than as "nothing is personal": all modifiers are shown and the Hypothetical toggle is hidden when there is nothing to classify. This keeps older logs working even without the catalog.

## Under the hood
- Bumped `@axiapps/axilog` to 1.7.1, which emits the top-level `personalDamageMods` map. New parses get proper personal-vs-shared classification and the Hypothetical toggle returns.
- Added `damageModifierSummaries` with unit coverage for the classification and toggle-visibility rules.

NOTE: Logs already in your history keep whatever data they were parsed with. Re-parse or upload a log to pick up the full personal/shared split.
