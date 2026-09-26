# Release Notes

Version v3.17.5 — September 25, 2026

## Fixes
- Fixed a memory issue where the app could hold onto its largest stats payload size forever after just a few dozen logs, eventually running the renderer out of memory instead of trimming back down.
- If the app crashes and reloads, your log list no longer disappears — it's restored from an in-memory snapshot and you'll see a banner letting you know recovery happened.
- Settings' "Check history" re-parse scan works again. It had been silently broken and doing nothing since log persistence changed.
