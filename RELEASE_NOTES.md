# Release Notes

Version v1.39.2 — March 1, 2026

## UI improvements
- App and AppLayout layout and styling are cleaner, giving you a steadier, more intuitive UI.

## Theme resolution
- KINETIC_SLATE_WEB_THEME_ID is now supported in theme resolution, so that theme picks up correctly.

## Behind the scenes
- Added version utilities, details processing, and an upload retry queue to improve how uploads and reports are prepared.
- Uploads that fail will be retried automatically.
- Details are parsed and summarized for dashboards and reports.

## QoL Improvements
- General stability tweaks and small polish across the app to feel more reliable day-to-day.
