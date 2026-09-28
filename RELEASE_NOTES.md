# Release Notes

Version v3.18.0 — September 27, 2026

## Rotation: see what everyone actually pressed

There's a new Rotation section under Players. Pick a fight and a player and you get
their whole cast sequence as a wrapping timeline — one box per cast, with the skill
icon, laid out against the fight clock. Interrupted casts are outlined in red, and a
cast that started before the log did gets a dashed border so you can tell "they
opened with this" from "they were already mid-cast when arcdps started recording".

Rows come in 10s, 15s, 30s and 60s widths. 15s is the default: wide enough that a
typical cast is a real, clickable box, narrow enough that a 2-3 minute fight still
fits without its own scrollbar. Go to 60s when you want to read the shape of a long
fight instead of individual skills.

## Click a cast for the details

Clicking any cast opens a panel under the track with its exact cast time, how long it
took, whether it completed or got interrupted, the gap since the previous cast, and
what that previous cast was. Underneath is a strip showing every other time they
pressed that same skill in the fight, so you can eyeball their recast rhythm at a
glance.

Gaps can come out negative — that just means the casts overlapped, which really
happens, so it's shown as-is rather than rounded up to zero.

## Works on a phone now

Below roughly 640px wide the player list collapses into a scrolling row of chips
across the top, handing the full screen width to the timeline. The track also picked
up start-time labels on each row, because once it's the full width of a phone there's
nothing else to tell you where you are in the fight.

## QoL Improvements

- Cast boxes are proper buttons now: you can tab to them, hit Enter to open the
  details, and they show a focus ring while you do.
- When a box is too narrow for the skill name, it shows just the centred icon instead
  of three clipped letters.
- Share links are tinted with the map the fight happened on, so an Eternal
  Battlegrounds link doesn't look identical to a Desert one in Discord.

NOTE: Rotation is built from cast data your logs already carry, so your existing
history shows up here without re-parsing — except for logs from before the switch to
the built-in parser, which have no cast data at all and need a re-parse. For published
web reports, the per-fight data format changed in this version: reports published
before v3.18.0 need a re-publish before their fight drill-down works in the new
viewer.
