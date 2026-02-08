# Release Notes

Version v1.25.6 — February 7, 2026

## 🌟 Highlights
- Clearer crash reports when something goes wrong.
- Crash diagnostics are now sent automatically to help fix issues faster.
- More robust crash logging that works even if parts of the app are failing.

## 🛠️ Improvements
- Added a crash diagnostics flow that captures error name, message, and stack when available.
- Diagnostics cover uncaughtExceptionMonitor, uncaughtException, and unhandledRejection to provide fuller context.
- Diagnostics include runtime app details to aid debugging.
- Non-Error crash reasons are handled gracefully and reported with a clear name.

## 🧯 Fixes
- Crash reporting uses a direct path with a fallback to avoid breaking logging if something goes wrong.
- Stack traces are included when available to help pinpoint the source.
- Non-Error crash reasons are captured and reported with a descriptive name.

## ⚠️ Breaking Changes
None.
