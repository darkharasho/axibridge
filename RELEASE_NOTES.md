# Release Notes

Version v1.31.0 — February 14, 2026

## 🌟 Highlights
- Refined dashboard visuals with a polished sidebar and restored titlebar baseline.
- SkillUsageSection charts now animate for up to 16 selected players with customizable timing.
- Smoother dashboard experience: sticky ledger headers, improved fight component layout, and consistent styling.
- Faster stats loading thanks to bulk log details caching and a loading indicator.
- Better handling for larger datasets with improved refresh flow and initial mount behavior; computedStats and skillUsageData integrated for more accurate displays.

## 🛠️ Improvements
- Polished stats navigation with expanded rail animations and staged subnav effects.
- Hover-to-expand now activates only when the rail is visible, reducing stray expansions.
- Smoother AppLayout navigation with activeNavView state and quicker view switching.
- Enhanced data handling for large datasets: bulkUploadMode support, smarter refresh, and memoized top-skills aggregation.
- StatsView and AppLayout now leverage computedStats and skillUsageData for more accurate, up-to-date displays.

## 🧯 Fixes
- Decoupled parent collapse timing from subnav child visibility to prevent timing glitches.
- Expanded hover behavior limited to visible collapsed rail to reduce unintended expansions.
- Fixed web report nav scroll behavior and overall stability.
- Fixed stats render loops and stabilized chart mounting for consistent visuals.
- Attendance ledger header styles aligned with web report behavior.

## ⚠️ Breaking Changes
None.
