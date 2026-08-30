# Release Notes

Version v3.3.0 — August 30, 2026

## CC and Strip Timelines

Two new sections: **CC Timeline** under Offense and **Strip Timeline** under Boons & Strips. Instead of one flat number for the whole fight, you get crowd control and boon strips laid out second by second, per player, so you can see when the squad actually landed its bombs and who was pressing at the time. Each section has its own fight picker, and the grids stay readable at full 50v50 scale.

## Incoming CC next to your stab performance

Stab Performance now has a strips-taken overlay, and the boon drilldowns have incoming-CC and incoming-strips heatmaps. Line up "we lost stability here" with "this is the second the CC landed" without switching pages. Each overlay has its own toggle, so you can show only the one you care about.

NOTE: incoming data comes from per-entity timeline lanes, which need **Include Timeline Arrays** enabled. Logs you've already got cached get re-parsed automatically; reports published before this version won't fill in retroactively.

## Replay is now map-first

The replay view was rebuilt around the map. The map is full-bleed and the rest of the UI floats on top of it: a collapsible Layers rail on one side, the squad panel on the other, a fight identity pill instead of the old picker bar, and a transport bar at the bottom. Collapse anything you're not using and the map takes the space.

Also new on the map: a legend explaining what every mark means, a world-units scale bar, and colour-coded layer chips so twenty toggles fit where a list used to.

## Incoming CC and strips on the replay timeline

The synced timeline has four sub-lanes now — CC and strips the squad applied, and CC and strips landed on the squad — so you can scrub straight to the moment a push turned. Each lane is scaled to its own peak, so heights aren't comparable across the zero line.

## CC-taken marks, coloured by what the CC did

Players who took crowd control get ringed on the map for the second it landed in, and the ring colour tells you what happened: cyan for displacement (knockback, pull, launch), pink for fear, amber for lockdown (stun, daze, knockdown). Ring weight grows with how much CC hit them. Same data as the CC taken lane, kept attributed instead of summed.

NOTE: fights parsed before this version fall back to amber — those rows were counted without being classified.

## Squad panel

Party groups collapse, conditions show alongside boons on each member card, the current cast is named on every card, and clicking a member spotlights them on the map with a crosshair. Cards no longer resize and shove the list around every time someone gains or loses a boon.

## Fixes

- Fullscreen replay no longer flashes the whole HUD when you drag the map, and panning no longer re-renders panels that didn't change.
- The stats view no longer clips the bottom of the window.
- Collapsed side rails stopped shearing the bottom of their vertical labels.
- Drilldown chart toggles moved back into the drilldown row where they belong.
