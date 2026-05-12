# Release Notes

Version v2.7.1 — May 11, 2026

## Avg Uptime per Application (Outgoing Conditions)

The outgoing conditions table now has an **Avg/app** column showing how long each applied stack of a condition actually stuck on the target. It's the closest thing in logs to arcdps's in-game "duration avg" hover tooltip — lower than the skill's nominal duration means cleansing (or short-base-duration condi).

Sortable in both the standard and dense views. The "All Conditions" aggregate uses weighted totals so the number isn't an average-of-averages.

NOTE: dps.report's WvW JSON doesn't expose per-condition cleanse events on the enemy aggregate target, so this is a proxy for cleanse pressure, not a literal "% cleansed".
