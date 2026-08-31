# Release Notes

Version v3.4.3 — August 31, 2026

## Fixes

- Fixed Boon Output "Total" reading way too low, and shrinking the more fights you loaded. It was dividing by a running player-fight count instead of the number of fights, so the column understated output more and more as your log set grew.
- Fixed boon uptime being calculated a few percentage points low across the board (roughly 3-7.5%). Uptime was only sampled once at the start of each bucket, which always caught the fight-opening zero state. It's now measured continuously across the whole bucket, and matches axilog's own uptime numbers exactly.
- Fixed Overall Boon Uptime scoring players who missed a fight as if they had 0% uptime for it. It was dividing by every fight in the report instead of just the fights each player actually attended, which could shuffle the leaderboard, not just nudge the numbers.
- Fixed Might's stack-count column showing one number while sorting by a different one — both now use the same true average stack count.

NOTE: These fixes only change how existing log data is displayed - no need to re-upload anything.
