# Release Notes

Version v2.0.5 — March 28, 2026

## Strip Spikes

New stats section that tracks boon strip spikes per player across fights. Shows peak strip counts and down contribution, with the same per-fight chart and player drilldown as spike damage. Profession groups are sorted by total value so the biggest strippers float to the top.

## Boon Uptime Incoming Damage Heatmap

The boon uptime drilldown now has an incoming damage heatmap overlay. When you expand a player's fight breakdown, you can toggle the heatmap to see where incoming damage was heaviest relative to boon uptime — useful for spotting whether boons dropped right when they were needed most.

## Player Breakdown: Min/Avg/Max Hit

The player breakdown detail pane now shows Min Hit, Avg Hit, and Max Hit rows per skill. These aggregate correctly across multiple logs, taking the true minimum and maximum across all fights rather than averaging them.

## Boon Selector Moved to Header

The boon selector dropdown moved out of the boon section body and into the section header, right-aligned. Saves vertical space and makes it easier to switch boons without scrolling.

## Stats Sections Refactored to FightMetricSection

Boon Uptime, Boon Timeline, and Spike Damage sections now use a shared FightMetricSection component under the hood. This doesn't change how they look or behave, but it means future metric sections (like Strip Spikes) can be added with much less code.

## Skill Usage Visual Refresh

Skill Usage section got a flat design pass — cleaner layout, less visual noise.

## Crash Diagnostics

Added diagnostic logging for a reported issue where the app black screens and loses recent activity on Windows. The app now logs memory stats every 5 minutes and captures detailed crash information (reason, exit code, heap state) when the renderer process dies. All of this shows up in the in-app terminal and the log file on disk, so next time it happens there'll be something to go on.
