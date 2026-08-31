# Release Notes

Version v3.4.1 — August 30, 2026

## Fixes

- Scrubbing the replay timeline no longer drags the map along with it. The play bar, squad roster and legend all float on top of the map, and a press on any of them was arming the map's pan gesture at the same time — so the whole map slid around while you were trying to find a moment in the fight. Only presses that land on the map itself pan it now.

NOTE: if you have someone selected to follow, the camera still moves as you scrub. That's the follow camera tracking them through the fight, not the map being dragged.

- Fixed pan and zoom silently doing nothing on some fights. Whether the mouse controls got wired up at all depended on the map's dimensions, so a fight on a map of one particular size came up frozen.
