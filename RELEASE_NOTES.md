# Release Notes

Version v2.12.3 — June 24, 2026

## Fix: Distance to Tag / Closest to Tag showing 0

EI v3.24 changed how it exposes distance data — it now only emits the distance scalars when combat replay is parsed. As a result, Distance to Tag and Closest to Tag were showing 0 for everyone in logs uploaded with v2.12.1 or v2.12.2.

The app now always parses combat replay to get that data. The "Detailed Combat Replay" setting still works the same from your perspective — it just controls whether the full position trail is kept around after parsing, not whether replay gets parsed at all.

NOTE: Logs that show 0 for these stats will self-heal if you re-parse them.
