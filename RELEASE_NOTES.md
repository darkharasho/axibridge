# Release Notes

Version v3.6.0 — September 4, 2026

## Separate player damage from siege in Top Incoming Skills

Incoming damage in WvW lumps together two very different things: what enemy
players did to you, and what arrow carts, guards and NPCs did. The table only
ever showed the combined total, so any fight inside siege range read as a wall
of arrow cart hits with the actual player threats shoved off the bottom.

There's now an All/Players toggle on the table. "Players" narrows it to damage
from players and their minions — the same way the arcdps in-game filters count
it. On one of the test fights the top six skills by raw damage were all siege;
switching to Players surfaces the Barrages and Meteor Showers that were actually
killing people.

NOTE: This reads a field added in the log parser, so it only applies to logs
parsed from this version on. If a report contains even one older log, the toggle
hides itself and the table behaves exactly as it does today — better no answer
than a player number that quietly reads low.

## Replay map: no more ghost enemies

Enemies who hadn't spawned yet were sliding back and forth between their first
two recorded positions about three times a second, for the entire replay. They
now simply don't appear until their track actually starts.

Players who disconnect or leave the instance are hidden while they're gone,
which is different from being dead — a corpse is still on the field and still
rezzable, so it stays.

## Replay map: hide the dead

Dead players are now hidden by default, with a small tally in the corner
counting how many icons got dropped. Click it to bring them back. Trails stop
at the point someone died instead of drawing a straight line across the map when
they get rezzed somewhere else.

## Fixes

- The downed marker now shows on enemies too, and it's sized to the icon it sits
  on so it stops overhanging the smaller enemy art.
