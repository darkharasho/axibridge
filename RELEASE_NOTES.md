# Release Notes

Version v2.13.0 — June 27, 2026

## New

- **Per-raid attendance history for the roster's Retention radar.** Published reports now include a new `reports/attendance.json` artifact — a per-raid log of who attended, with combat and squad time per player. This is what powers AxiRoster's new **Retention** view, which ranks members by churn risk from real attendance trends. The first publish after updating reconstructs the **full** history from your locally stored reports, so the radar has data to work with immediately rather than accruing one raid at a time. The file is published in the same push as `rollup.json` and is pruned automatically when reports are deleted.
