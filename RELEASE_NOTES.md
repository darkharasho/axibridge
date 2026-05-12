# Release Notes

Version v2.7.0 — May 11, 2026

## New Commander tab

A new tab between Stats and History that gives you a per-fight diagnostic view of the most recent fight. It's deliberately not framed as "did we win" — you already know that — but as "where did this fight go sideways."

The page is built around two insight columns: **What went right** and **Could've gone better**. Each finding shows its evidence, the threshold rule that fired it, and a tiny inline visualization (sparkline, threshold bar, donut, tag bubble, mini timeline, etc.). Below that, seven metric sections with 35 individual cards cover the matchup, survival, burst exposure, cohesion, sustain race, engage readiness, and outcome ledger. Every card has a one-line description so you don't have to remember what each metric means.

A small session rollup strip at the top shows tonight's K/D, average squad alive %, outnumbered count, and a trend sparkline of squad-alive % across the night.

Other Commander niceties:
- A fight selector dropdown so you can jump back to earlier fights from the same session.
- Fight title uses the same map-aware label as the map replay — so instead of "Green Borderlands" you get "Green Borderlands: Stonemist Castle" when there's enough position data.
- An enemy comp chip strip showing the profession breakdown (sorted by count, color-coded by class), with overflow collapsed into a +N chip.
- An enemy team split bar on the Sq/Ally/Enemy card so you can tell whether you were fighting one server or both.
- A loading banner with the same particle spinner the Stats dashboard uses, so a freshly-uploaded log shows feedback instead of a blank "no log found."

All of the firing thresholds (what counts as "outnumbered", what counts as "winning the cleanse race", how long before a first death is "too early", etc.) are configurable in Settings → Commander.

## Marketing site rebuild

The marketing site has been rebuilt from scratch with a Field Console aesthetic — sticky glass nav, real-app screenshots in the hero and gallery, a how-it-works section, a feature grid, an FAQ accordion, a live changelog wired to the GitHub Releases API, a footer, and reduced-motion handling for mobile. Lucide icons throughout. Each gallery thumbnail has its own description, and clicking a changelog card now opens the release notes in a modal. The site is linked from the README.

## QoL Improvements

- App windows are draggable again on Windows.
