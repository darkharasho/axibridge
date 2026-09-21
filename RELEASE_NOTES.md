# Release Notes

Version v3.15.5 — September 20, 2026

## Fixes
- Fixed share links not getting created for logs that came from a cache hit, skipped local parsing, or failed to parse — those used to just fall back to a manual "mint link" button and a dps.report-only link even when everything needed for sharing was already set up.
- Fixed the Axilog coverage banner blaming a bad cache read for logs that actually parsed fine but got rejected by storage. Rejected logs now get their own message and retry a couple times instead of the usual eight.
