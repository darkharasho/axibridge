# Release Notes

Version v2.10.2 — June 13, 2026

## Fixes

- Fixed a crash on startup in 2.10.1 where the app would immediately show "A JavaScript error occurred in the main process — Cannot find module '@axiapps/bridge-metrics/metricsSettings'". The metrics package wasn't getting bundled into the build, so the app couldn't open at all. It's bundled now. If 2.10.1 wouldn't launch for you, this is the fix — grab this build and you're good.
