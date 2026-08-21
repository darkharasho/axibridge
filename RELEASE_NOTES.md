# Release Notes

Version v3.0.7 — August 21, 2026

## Conduit, Galeshot, and Antiquary now show up correctly

The new parser was missing three elite specs, so a Conduit showed as a plain Revenant, a Galeshot as a plain Ranger, and an Antiquary as a plain Thief. Everything else about those players — damage, boons, cleanses — was already correct; only the class label was wrong.

The reason it slipped by is that a missing spec doesn't read as "unknown", it reads as "core build", so it looked like perfectly valid data.

NOTE: This applies to logs parsed from here on. Fights already sitting in your history keep the old label until they're re-parsed.
