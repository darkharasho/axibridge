# Release Notes

Version v2.5.3 — April 17, 2026

## More replays showing up in large sessions

When you had a lot of fights in one session, only some of them would show up in the replay map — usually the first 8 or so, even though all of them uploaded fine. Fixed.

The root cause: the EI JSON fetches from dps.report are sequential, so when a large bulk upload finished, the aggregation worker would run before all the fight data was ready. The fights that hadn't been fetched yet simply had no replay data to work with. After that first run, the app never went back to rebuild the replays for the fights that came in later — it considered the work done.

Now, each time fight data arrives it marks the fight as ready and schedules a fresh aggregation pass. The passes are debounced, so the worker re-runs once after everything settles rather than restarting 18 times.

NOTE: This only affects newly viewed sessions. If a previous upload to R2 captured fewer replays than expected, re-uploading the web report will pick up the full set.
