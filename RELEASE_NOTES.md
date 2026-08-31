# Release Notes

Version v3.4.2 — August 30, 2026

## Replay marks now land where people actually died

Downed and dead circles in the replay looked like they lagged behind the players they belonged to. Two separate things were causing it, and both are fixed.

- Player icons were being drawn from the wrong point in their own track, so anyone who joined the fight late showed up wherever they stood some seconds later. Their death circle stayed in the right place, so the icon and the circle disagreed — which is what read as "delayed".
- The replay data itself was inventing movement. arcdps only reports a position when it changes, so a gap in the data means someone stood still — but the gap was being smoothed over as if they'd walked it. While a player was dead, that turned a stationary body into a sprint across the map: in one measured fight, over 56,000 inches of travel that never happened, dragging a death circle thousands of inches off the actual spot.

Positions now hold still through those gaps and only move during the window the movement really happened in. Teleports and blinks still animate as a visible line rather than a hidden jump.

NOTE: The icon/camera half is a drawing fix, so it applies to reports you already have. The fabricated-movement half happens when a log is parsed, so it only affects logs parsed from this version onward — older reports keep the tracks they were built with unless you re-parse the logs.

## Fixes

- The follow camera tracked the same wrong point as the icons, so following a late-joining player pointed the view at empty ground. Fixed with the same correction.
