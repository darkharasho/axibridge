# Release Notes

Version v3.4.5 — August 31, 2026

## Fixes

- **Boon Uptime was showing 0.0% for subgroup rows.** Any report or session published before v3.4.3 rendered every boon as 0.0 on subgroup rows, while individual player rows looked fine right next to them. The fallback that rebuilds coverage for older reports was only triggering when attendance was zero, but synthesized subgroup rows always have positive attendance and just lack the newer coverage data — so they never hit the fallback. Subgroup rows now show correct boon uptime again.
