# Release Notes

Version v2.13.9 — July 27, 2026

## Fixes

- Fixed the Upload to Web button staying grayed out during live sessions. When logs rolled in naturally between fights, a log could silently get stuck in "calculating" forever, which kept the web upload disabled even after everything looked settled. Logs now finish processing reliably, and the button re-enables once the last fight's data is in.
