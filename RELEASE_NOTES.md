# Release Notes

Version v1.42.0 — March 21, 2026

## Details Cache

Log details (the full EI JSON for each fight) are no longer held directly in React state. They now live in a two-tier cache — an in-memory LRU (up to 100 entries) backed by IndexedDB for persistence. Stats computation, the stats worker, and the log card detail view all read from the cache transparently.

This drops 10–60 MB per log from renderer memory, which makes a real difference when you have 20+ logs loaded.

NOTE: The cache is populated automatically as logs are uploaded. Single uploads pre-warm the cache immediately so the stats view loads without delay. During bulk uploads, IndexedDB writes are deferred to avoid blocking the main thread.

## Bulk Upload Performance

- Uploading 20–30+ logs no longer risks running the app out of memory. The buff/source iteration in stats aggregation was optimized to skip irrelevant buffs upfront, cutting memory usage by ~40–50%.
- Aggregation results are now cached (LRU, 5 entries). Re-visiting the stats tab with the same logs is near-instant instead of re-computing everything.
- Stats recalculation is 60–70% faster — redundant per-second/per-minute metric passes were consolidated into a single computation.
- Post-bulk details loading now fetches 3 logs in parallel (was 1), so the stats view populates roughly 3x faster after a bulk upload finishes.

## QoL Improvements

- The UI stays responsive during bulk uploads: animations are bypassed, scroll handling is throttled, and log card updates are batched more aggressively.
- Details are no longer pre-warmed via IPC during bulk upload, eliminating a source of main-thread stalls.

## Fixes

- Fixed conditions consistency audit comparing unrelated metrics (received vs outgoing conditions).
