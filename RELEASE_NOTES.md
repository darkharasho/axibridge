# Release Notes

Version v2.5.7 — April 17, 2026

## Fight picker overlay

The fight thumbnail selector is now a full overlay instead of a horizontal strip that cuts off. Click "Show all fights" and all fights tile across multiple rows. Clicking a fight closes the overlay automatically.

## Overlay strokes scale with zoom

Hull outlines, centroid rings, and tag range rings now stay at a consistent 1px on screen when you zoom in. Previously they grew thicker as you zoomed.

## Fixes

**R2 replay not loading on web reports** — the CORS rule was being set with the full GitHub Pages URL path (e.g. `https://user.github.io/repo`) instead of just the origin (`https://user.github.io`). Browsers check origin only, so the rule never matched and all R2 replay fetches were blocked.

If your R2 API token doesn't have bucket admin permissions, the automatic CORS update will now show a visible warning during upload with instructions to set it manually in the Cloudflare R2 dashboard. Previously this failure was silent.
