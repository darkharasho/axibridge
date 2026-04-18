# Release Notes

Version v2.5.4 — April 17, 2026

## Fight location names in activity log

Fight titles in the activity log (e.g. "Green BL: Garrison") were showing just the map name with no landmark. Fixed.

The fight location is determined by looking at player positions in the EI JSON from dps.report. dps.report doesn't always include position data for squad members, but it does include it for enemy targets — so we now fall back to enemy positions when squad positions aren't available. Close enough to identify which WvW objective the fight was near.
