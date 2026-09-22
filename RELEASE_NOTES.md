# Release Notes

Version v3.16.1 — September 21, 2026

## Fixes

- Discord report cards (the little preview images attached to fight posts) were prone to timing out and killing the whole post. They're now rendered offscreen on a single reused window instead of spawning and tearing down a window per card, which was quietly poisoning later renders after the first one.
- Posting a fight report to Discord no longer blocks the upload modal — uploads keep moving while the report posts in the background.
- Fixed top-list rows in Discord embeds wrapping onto extra lines. The name column is now sized from the names actually in the list instead of always assuming the longest possible name, and the row cap is a bit tighter to keep things readable.
