# Release Notes

Version v2.5.0 — April 17, 2026

## WvW Map Replay

The biggest thing in this release: a full interactive map replay for every WvW fight. Open any analysed session, go to the Map tab, and you can watch the fight play back on the actual WvW map tile.

- Player icons move in real time, coloured by profession, with HP bars, boon stacks, and active skill casts visible in the squad panel on the right
- Zoom in from 1× to 50× with cursor-centred wheel zoom, and pan freely — even while following a specific player
- Squad overlays: centroid + spread ring, commander tag range rings (600 / 1200 units), per-party convex hulls, and a health strip across the top of the map
- Event overlays: damage pulses, rally rings, and target-focus lines
- Heatmaps for deaths, time spent, and damage taken — rendered as topographic colour bands so the density actually reads clearly

## Fight Phase Timeline

When you enable "Fight phases on timeline" in the layers panel, the scrubber is now colour-coded by what the squad was doing: opening (blue), push (green), retreat (red, whenever deaths are happening), cleanup (purple). Hover any phase chip to see what it means, or open the layers panel for the full legend.

## Location-Aware Fight Names

Log cards now show the nearest WvW landmark instead of just the raw map name — so "Blue BL: Camp Resolve (8:14)" instead of "Blue Alpine Borderland". This also applies across the dashboard: commander stats, fight breakdown, kill pressure, boon timelines, and stab performance all use the same landmark-aware naming.

NOTE: Existing logs saved before this update won't show the landmark until they're re-uploaded.

## Rounded Window Corners

On Windows and Linux the app window now uses a transparent background so the OS can apply its own rounded corner treatment. No functional change, just looks cleaner.

## Discord Notifications on Release

AxiBridge can now post a Discord notification when a new version is released. Configure the webhook in Settings if you want it.

## Fixes

- Discord notifications now correctly use the webhook identity (name/avatar) instead of falling back to the default bot appearance
- Fight timeline order in the defense tab was reversed — fixed
- Navbar scroll wheel was propagating to the page — fixed
