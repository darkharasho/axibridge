# Release Notes

Version v3.1.1 — August 24, 2026

## Faster, More Reliable Map Replays

Replay data is now compressed before it's published, so bigger raid/WvW sessions that used to lose their map replay entirely (because the uncompressed file blew past GitHub's 50MB limit) now fit and publish normally. Compression happens on both Cloudflare and the GitHub Pages fallback, so this applies everywhere reports get published.

NOTE: Old reports don't need to be republished — the viewer detects compressed vs. uncompressed replay data automatically and loads either one.

## Fixes

- Fixed a bug where the desktop app could corrupt replay data while reading it from storage, since binary data was being handled as text instead of raw bytes.
- Deleting a report now properly cleans up old replay files left over from before this change.
