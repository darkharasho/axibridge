# Release Notes

Version v3.19.3 — October 3, 2026

## Fixes

- Fixed "N logs could not be read back from the cache" errors during bulk ingest. Several logs parsing at once could race each other and wipe out each other's cache entries; that's fixed, and as a backstop, if a log's cached details ever go missing they're now automatically re-parsed from the original file and saved back to disk.
- Fixed published web reports showing a 404 right after publishing. Publishing now actually waits for GitHub Pages to finish building the report you just pushed instead of trusting a stale "built" status. The report viewer also keeps retrying for a few minutes instead of giving up immediately if the page isn't live yet.
- Reduced "Not Responding" freezes during large batches of logs. The cache was clearing itself out too aggressively under memory pressure, which made the app re-parse big JSON files on the main thread over and over. NOTE: this is an improvement to a known cause of stalls, not a guarantee that all main-thread freezes are gone.
