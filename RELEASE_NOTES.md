# Release Notes

Version v3.19.1 — October 1, 2026

## The replay starts with everyone on it

Open a fight in the replay and the whole squad is there on the first frame. Before,
you'd get a near-empty map — on one real fight, 1 player out of 82 — that filled in
a moment later. The playhead was starting a fraction of a second too early, before
most people's position data begins.

## No more flickering map

The replay map no longer flashes on and off while it follows the tag. The tile detail
level was being recalculated as the view moved, and sitting right on the edge it would
flip back and forth every frame, throwing away the map image each time. It now picks
one detail level and stays there.

This was most obvious on Red Borderlands, but anyone on a high-DPI display could hit
it on any map.

## Commanders and squadmates who had no stats

Sometimes arcdps writes the same player into a log twice, and we were treating the two
halves as two different people. Everything — damage, boons, healing, the replay track —
landed on the half with no name attached, so the real squad member showed up with
zeroes across the board and no dot on the replay. A commander this happened to had no
tag on the map at all.

Checked against 400 real logs: 6 were affected, 11 squad members total.

NOTE: this applies to logs parsed from now on. Re-parse older logs from History if you
want their numbers fixed.

## Fixes

- The update check no longer claims it failed when it was just slow. A check that took
  56 seconds was being reported as an error at 30, and the error banner stayed up even
  after the check came back fine.
