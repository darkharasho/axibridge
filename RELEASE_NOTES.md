# Release Notes

Version v2.15.0 — August 6, 2026

## Forum Tags on Report Webhooks

Report webhooks flagged as a Discord forum channel can now carry tags:
- New "Forum tag IDs" field appears on the webhook card once "Forum channel" is checked — paste tag IDs comma-separated, parsing is lenient about formatting.
- The field tells you how many tags it recognized and warns if you've pasted more than Discord's 5-per-post limit (only the first 5 are used).
- NOTE: If Discord rejects a tag ID (e.g. it was deleted), the report still posts — just without tags — and you'll see a status warning telling you to check that webhook's IDs.
