# Release Notes

Version v3.15.2 — September 20, 2026

## Fixes

- Fixed Fight Breakdown rows getting stuck on "Pending" instead of linking out. Share links from v3.15.0 meant new logs no longer got a dps.report permalink, and several parts of the app were only checking for that permalink to know a log was ready — so fight links, details loading, and replays could all silently fail to show up. Everything now checks the share link first and falls back to the dps.report link, so things load like they should again.
