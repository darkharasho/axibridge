# Release Notes

Version v2.13.4 — July 2, 2026

## Fixes

- Fixed the web upload button getting stuck grayed out with "Stats are still loading" even when nothing was actually calculating. This could happen when a log's details finished loading at just the wrong moment, leaving the combat replay data marked as unavailable for good. The app now catches that state and quietly finishes the replay so you can upload again.
