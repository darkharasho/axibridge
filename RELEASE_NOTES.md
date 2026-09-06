# Release Notes

Version v3.6.1 — September 6, 2026

## Fixes
- Fixed the "Down Contrib" toggle on Strip Spikes showing 0 for every player on every fight. The underlying data was missing the "strips" side of the contribution numbers, so only damage was ever counted.

NOTE: this only affects logs parsed from here on out. Existing saved logs and already-published web reports won't pick up the fix unless they're re-parsed and re-published.
