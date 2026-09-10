# Release Notes

Version v3.8.0 — September 10, 2026

## Revives

There's a new Revives section under Defense. It counts the times someone actually got picked up, not just the times someone started channeling on them. Each stand-up gets credited to a hand res, a resurrect utility (Battle Standard, Spirit of Nature, Illusion of Life, and so on), or a self-res. Anything it can't pin on one of those shows up as "unattributed" instead of being hidden.

- A per-player table puts attempts next to completed revives, so you can see Resurrect Time, Hand Revives, Success Rate, Utility Casts, Utility Revives and Revives per Cast in one place.
- A per-utility table shows how many casts each resurrect skill got and how many people it picked up. Expand a row to see who cast it.
- An Illusion of Life card shows how many people it saved stayed up and how many went down again, with a histogram of how long they lasted.

NOTE: Utility credit is based on timing. A utility gets credit for any stand-up inside its window, however far away it happened, so the utility numbers are a bit generous. Logs without replay data leave revives blank instead of showing everyone at 0.

## "Resurrects" Is Now "Resurrect Attempts"

The old Resurrects stat counted channel starts. If you channeled six times on someone who died anyway, that was six. It's now called Resurrect Attempts everywhere, and Support Detailed has a note pointing you to the Revives section for real pickups.

## Revives in Discord, Leaderboards and MVP

- The Revives column in Discord embeds and on the log cards now shows completed revives instead of attempts.
- Revives is available as a top-stats card alongside Resurrect Attempts.
- The Revives MVP weight now scores completed revives. If a log has no revive data, that stat is skipped for the log instead of being counted as zero.

## Fixes

- The resurrect utility filter options in the Healing Breakdown were always empty. They now list the resurrect utilities from your logs.
- A player with duplicate entries in a log (relogs, build swaps) no longer gets their revives counted twice.
