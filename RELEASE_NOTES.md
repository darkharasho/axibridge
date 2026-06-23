# Release Notes

Version v2.12.0 — June 23, 2026

## No Ego Mode

New toggle in Settings (under Dashboard - Top Stats & MVP). Flip it on and the stats stop being about who topped the charts and start being about where the squad can improve.

With it on:
- The MVP podium, leaderboards, "top skills," player comparison, and all the #1/#2/#3 ranking goes away.
- Every metric shows the squad **average**, how spread out everyone is (σ deviation), and a dot-plot of where people landed.
- The only people called out by name are the ones with the **most room to improve** — and it respects each metric's direction, so it's low cleanses or high deaths that get flagged, never "look who did the most damage." Top performers are never highlighted.

This applies in the app and in published web reports.

NOTE: it's a display mode, not a data change. Everything is still calculated under the hood, and toggling it back off restores the full ranked view instantly. It also doesn't hide the numbers from someone reading a public web report's data directly.

## Role-Aware Comparisons

No Ego mode compares people against others doing the same job. Healers are judged against the other support players, damage against damage — so a healer no longer gets flagged for low down contribution just because the DPS pile up more. If a role group is too small to compare fairly, it falls back to the whole squad.

## Reworked Offense / Defense / Support Layout

In No Ego mode these sections keep the metric list on the left and show one large distribution card for whatever metric you pick, with the full per-player table tucked behind a "Per-player detail" button. The Total / Stat/1s / Stat/60s toggle is right there too.

## Web Reports & Rollups

Published reports remember whether No Ego mode was on when you built them. The cross-report rollup ("top commanders / top players" across many raids) follows the same treatment — it still crunches every number, it just shows the distribution view instead of a leaderboard.

Version v2.11.4 — June 23, 2026

## Release automation
- Releases now publish atomically: installers and release notes are attached to a hidden draft, which is then flipped to public in a single step. This stops update announcements from briefly showing up with no notes ("No content."). No functional changes to the app itself.

Version v2.11.3 — June 21, 2026

## New app icon
AxiBridge has a new duotone **share** mark, part of a suite-wide icon refresh. Updated installer/taskbar icon and in-app logo. No functional changes in this release.

Version v2.11.2 — June 20, 2026

## Fixes

- Fixed the "N partial" warning icon missing next to the Healing and Healing Breakdown headers in Chrome. The little amber triangle was getting collapsed away by Chrome (the text stayed, the icon vanished); it now shows up properly.
