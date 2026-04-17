# Release Notes

Version v2.5.1 — April 17, 2026

## GitHub Uploads Fixed

Web report uploads were failing with a "blob too large" error for any session that included map replay data. The replay section was generating reports over 90 MB, which GitHub's API rejects once base64-encoded. Uploads now succeed.

NOTE: This only affects future uploads. Reports already on GitHub Pages are unaffected.

## Smaller Web Reports

Report size dropped from ~90 MB to ~31 MB. A few things contribute to that:

- Player and enemy positions are now stored as integers instead of floats — sub-pixel precision doesn't matter for map visualization
- Icon URLs (~84 chars each) are stored once in a lookup table instead of repeated throughout the report — the same GW2 CDN URLs were appearing hundreds of times across skill tables, boon tables, and breakdowns
- Boon and skill icon dictionaries are shared across all replay fights instead of duplicated per fight
- Target focus samples use compact per-fight player indices instead of repeating full account name strings

## Fixes

- If a report is still too large to upload after the above, replay data is now dropped first instead of last — previously, skill usage tables, boon timelines, and condition data would all be stripped before replay was even touched
