# Release Notes

Version v1.40.12 — March 7, 2026

## SettingsView: faster last-call data
- The last-call data fetch in SettingsView was cleaned up to load faster and be more reliable.
- You’ll still see the same info, but it should feel snappier and less flaky.

NOTE: This is mainly internal cleanup with user-facing speed and reliability benefits.

## Asset and UI visuals
- Front-end bundles were refreshed and a new gradient image was added to keep visuals in sync with the code changes.
- These asset updates help keep the UI stable after the changes under the hood.

## Tests and stability
- Added comprehensive tests for SettingsView and related utilities to catch edge cases earlier.
- This should translate to fewer surprises when you update or tweak settings in the future.

## QoL Improvements
- Small polish in the SettingsView code paths aims for more consistent behavior across sessions.
- The broader test coverage and asset refresh reduce chances of flaky UI in edge cases.
