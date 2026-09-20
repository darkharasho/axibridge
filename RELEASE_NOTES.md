# Release Notes

Version v3.15.4 — September 20, 2026

## Fixes
- Fixed a bug where the app could appear to freeze while processing logs. A stalled network connection during a share upload could hang forever instead of timing out.
- Fixed logs getting stuck showing "pending" with retries doing nothing. A file that stalled during processing was staying marked as in-progress, so every retry attempt was silently skipped.
