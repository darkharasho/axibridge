# Release Notes

Version v2.5.17 — April 26, 2026

## Fixes

**Fights stuck as "Unknown" after bulk uploads.** When local Elite Insights finished parsing a log within the same ~50ms window as dps.report returning the permalink, the renderer's batched update queue was dropping the EI summary (squad count, outcome, duration) and only keeping the permalink. Rows ended up showing `0` / `--:--` / `Unknown` even though the link worked. The queue now merges updates per file instead of replacing them, so the summary survives. NOTE: this won't retroactively fix rows that are already broken — drop those `.zevtc` files into the watch folder again and they'll process correctly.

**Stab Performance party overlay missing in web reports.** The drilldown chart in the published web report wasn't drawing party overlays because the data wasn't being computed before export. Now precomputed at export time so the overlay renders.
