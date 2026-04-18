# Release Notes

Version v2.5.5 — April 17, 2026

## Fight picker overlay

The fight thumbnail selector is now a full overlay instead of a horizontal strip that cuts off. Click "Show all fights" and all fights tile across multiple rows. Clicking a fight closes the overlay automatically.

## Overlay strokes scale with zoom

Hull outlines, centroid rings, and tag range rings now stay at a consistent 1px on screen when you zoom in. Previously they grew thicker as you zoomed.

## Fixes

Fixed "Failed to load replay data" on web reports — the R2 CORS rule was being set with the full GitHub Pages URL path instead of just the origin, so browser requests were rejected. Your next upload will correct the CORS rule and the existing broken report will start working too.
