# Release Notes

Version v3.24.1 — November 11, 2026

## Fixes
- Fixed Rite of the Great Dwarf and the other Revenant modifiers not showing up on logs you re-imported after updating to 3.24.0. AxiBridge was handing back its cached parse from before the update, which didn't have them.

NOTE: To pick up the Revenant modifiers on older logs, re-import the log files. Re-parsing from History won't do it for logs AxiBridge already parsed itself (the 3.24.0 notes got this wrong, sorry).
