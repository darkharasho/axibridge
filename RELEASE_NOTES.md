# Release Notes

Version v2.13.11 — July 30, 2026

## Fixed: Upload to Web stuck disabled during live sessions

If you played with the watch folder running, Upload to Web could grey out with "Stats are still loading" and never come back — even with the dashboard fully loaded and nothing computing. Logs that arrived mid-session could get wedged in a permanent "waiting on details" state that silently blocked the uploader (restarting the app was the only way out).

That state can't happen anymore: the button re-enables on its own once stats settle. Bulk imports were never affected.
