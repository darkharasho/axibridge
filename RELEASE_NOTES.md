# Release Notes

Version v3.0.5 — August 20, 2026

## Distance to Tag stopped reading 0 for everyone

Discord embeds — and the distance list on each log card in the app — were showing
0 for the whole squad. The new log parser stores distance in a different place than
the old one did, and those two spots hadn't been wired up, so there was simply
nothing to read. Both now pull from the same source the stats dashboard already used,
which is why the numbers looked right there but nowhere else.

NOTE: this applies to embeds you post from here on out; embeds already sitting in
Discord won't change.

## Fixes

- The fight composition roster is readable again on the glass theme — names and
  subgroup labels were washing out against the background.
