# Release Notes

Version v3.15.3 — September 20, 2026

## Share Links Are Faster and More Reliable
The fights repo that backs share links is now fully managed for you — it's created automatically the first time you need it, and there's nothing to configure in settings anymore. Share blobs are also read directly from raw.githubusercontent.com instead of waiting on a GitHub Pages build, so a brand new share link resolves right away instead of sitting there until Pages catches up.

## Fixes
- GitHub API calls now time out after 60 seconds of socket inactivity, so a dead connection can no longer stall log processing indefinitely.
- Share failures are now logged to main.log, making them easier to diagnose if a share link doesn't go through.
