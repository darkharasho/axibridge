# Release Notes

Version v3.15.1 — September 20, 2026

## Fixes
- Fixed the Discord report card silently vanishing instead of posting. Heavy rosters could push the graphic card's size past a hidden browser limit, and it would just disappear with no explanation — the status line now tells you why a card was dropped instead of staying silent.
- Fixed the replay opening a beat late for almost everyone. The opening frame was missing most players' first position update, which also meant the camera sometimes skipped centering on your commander when you opened a replay. Nothing is faked or backfilled — it just opens on the first real data instead of an empty one.
