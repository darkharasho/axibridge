# Release Notes

Version v2.13.7 — July 17, 2026

## Fixes

- Fixed "Upload to Web" getting stuck disabled with "Stats are still loading" even when nothing was actually processing. This mostly hit logs coming in through the log watcher, and could also show up for every log right after restarting the app. The dashboard was missing the moment a log finished settling, so it kept waiting forever — it now catches it and re-enables the upload on its own.
