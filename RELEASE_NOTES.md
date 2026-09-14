# Release Notes

Version v3.10.2 — September 13, 2026

## Fixes

- Fixed Revives showing empty on cached logs. Combat replay is now kept locally by default, so revive tracking (down/dead timing) no longer disappears just because a log was processed with the old default settings.
- Parser Settings now separates "Keep Combat Replay Locally" (positions for Map Replay, tag distance, On Tag Review, stability performance) from "Publish Combat Replay" (whether that data goes into an uploaded web report). Publishing has no effect if local replay is off, since there's nothing to send.
- The Replay page and category nav now flag when Map Replay is present locally but won't be included in your next web upload, with a one-click toggle to include it.

NOTE: This won't repair Revives on logs that predate this release unless they still carry position data — logs re-processed under the old default may need to be re-processed again.
