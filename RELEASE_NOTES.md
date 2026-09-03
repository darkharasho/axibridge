# Release Notes

Version v3.5.0 — September 2, 2026

## Replay HUD Redesign
The replay transport bar has been rebuilt around a single instrument instead of a scattered set of controls. There's now a server tick readout with a live sparkline, a speed ladder that goes all the way down to 0.25x for frame-by-frame review, and a CC/strip lanes overlay right on the scrubber so you can see crowd control and boon strips line up with the fight timeline as you scrub. The map legend now collapses out of the way when you don't need it, and the old fight picker bar has been replaced with a floating fight identity pill.

## Commander Tab: Pin Pressure
Added a new Pin Pressure section to the Commander tab, showing pin attempts against your commander — including the ones the tag survived, not just the ones that landed. This gives a fuller picture of how much pressure a tag is actually under during a fight.

## Enemy Attention
Added an Enemy Attention section built from axilog's enemy cast census, surfacing which players are drawing the most enemy focus.

## CC/Strip Timelines
CC and Strip timelines are now dressed up as full sections with readable fight labels, making it easier to tell which fight you're looking at without cross-referencing elsewhere.

## Fixes
- Repaired the replay E2E specs that had drifted out of sync with the HUD redesign.

NOTE: Pin Pressure and Enemy Attention require logs parsed with the latest axilog (pinned to 1.12.0 in this release); older cached parses won't have this data until re-parsed.
