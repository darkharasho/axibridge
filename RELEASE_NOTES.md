# Release Notes

Version v2.13.10 — July 29, 2026

## Fixed: inflated squad and pug counts

Elite Insights writes a new player entry every time someone relogs, swaps builds, or changes subgroup mid-fight, and counts were treating each of those as a separate person. A 43-person squad could show up as "51 (+4)."

Every player count in the app is now deduplicated by person:
- Discord embeds
- Log cards (headline number and class bars)
- Stats timeline, fight breakdown, and average squad size
- Commander view (squad/allies/on-tag %/outnumbered flag) and commander average squad size
- Attendance and participation leaderboards — a build-swapper no longer racks up extra "logs joined" credit from a single fight

Damage, deaths, and support totals are unchanged — those still sum every entry, since each one is real time played. Enemy counts are also unchanged; there's no way to dedupe anonymous players.

NOTE: Already-published web reports keep their old numbers until you re-upload them.
