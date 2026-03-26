# Release Notes

Version v1.43.0 — March 22, 2026

## Squad Stats

Three new sections under a dedicated Squad Stats nav group:

- **Damage Comparison** — A diverging bar chart showing your squad's total damage vs. the enemy's across each fight. Win/loss fights are color-coded, and the tooltip shows exact numbers.
- **Kill Pressure (KDR)** — Per-fight kill/death ratio on a diverging log-scale chart centered at 1.0. Makes it easy to spot which fights your squad dominated and which ones went sideways.
- **Tag Distance Deaths** — A scatter chart plotting how far from the commander each death occurred and when it happened. Commander death times are shown as dimmed gold vertical lines. Distances are capped at 1,200 with a linear scale so outliers don't crush the rest of the data.

## Healing Breakdown

A new section that shows per-player healing and barrier output broken down by skill. Select a player to see which skills are doing the heavy lifting, with a metric mode toggle to switch between totals, per-second, and per-hit views. Barrier and healing are shown side by side.

## Boon Uptime: Subgroup Members

Hovering over a subgroup in the Boon Uptime section now shows a tooltip listing the players in that subgroup. Also added a class-split option for boon table generation.

## Fixes

- Players who swapped classes mid-session were showing up as separate entries in skill breakdowns, boon tables, and healing breakdown. Player keying is now account-based by default, with an explicit class-split toggle when you actually want per-profession rows.
- Aggregation cache now accounts for details count, so switching between summary and detailed views doesn't serve stale results.
- Removed a conditional max-width on the app content area that was clipping the layout at certain window sizes.
