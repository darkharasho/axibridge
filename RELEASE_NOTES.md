# Release Notes

Version v1.40.7 — March 4, 2026

## Fixes
- OverviewSection now uses the correct fields for allied and enemy stats. Allied Downs/Deaths and Enemy Downs/Deaths are now shown from the appropriate totalSquad*/totalEnemy* values (no more swapped numbers).
- Added unit tests to lock in the correct calculations and prevent regressions.
- NOTE: This only changes how numbers are displayed in the Overview. If you have dashboards open, refresh to see the corrected totals.
