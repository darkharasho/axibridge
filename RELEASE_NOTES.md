# Release Notes

Version v2.13.6 — July 8, 2026

## Fixes

- Fixed the Linux app icon in your menu/launcher breaking after an update. Because each version's AppImage has a different filename, updating left the launcher pointing at the old, deleted file — so clicking it did nothing. AxiBridge now fixes its own launcher entry every time it starts, so the menu shortcut keeps working across updates.
