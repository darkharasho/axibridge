# Release Notes

Version v2.9.1 — June 10, 2026

## Bulk Imports No Longer Freeze the App

Adding a big batch of logs used to grind the whole app to a halt — every status update was quietly re-sending every log's combat data to the stats engine, which could block the UI for seconds at a time, over and over. The stats engine now remembers what it already has and only receives what actually changed, and it recalculates a couple of times per bulk instead of constantly. Importing a full raid night should feel dramatically smoother.

## "All Reports" Loads Instantly

The All Reports page used to download and crunch every single report in your browser before showing anything — easily 20+ seconds (and hundreds of MB) once you had a few weeks of reports. The app now publishes a small pre-computed summary alongside your reports, so the page loads in under a second no matter how many reports you have.

NOTE: This kicks in after your next web report upload, which also backfills your existing reports automatically.

## Smaller, Faster Web Reports

Combat replay data (often two-thirds of a report's size) is now always kept out of the main report file and loaded only when you open the replay tab — including for setups without R2 storage. This also fixes replay data silently going missing if an R2 upload failed mid-publish.

## QoL Improvements

- Uploads no longer stall the app while the upload cache does housekeeping — the cleanup sweep now runs occasionally instead of on every single log.
