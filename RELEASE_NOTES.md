# Release Notes

Version v3.0.3 — August 19, 2026

## Upload to Web no longer dies on big replays

If a session produced a large map replay, the whole web upload could fail at the very
end with a GitHub error about the input being too large — you'd lose the entire report
over one oversized file. Now the report publishes anyway and just leaves the map replay
out, with a warning telling you what happened and that Cloudflare R2 will keep replays
on sessions that big.

## R2 tells you when it isn't actually on

R2 only kicks in when all five fields are filled out, and until now a blank or
mistyped one just silently sent your replay data to GitHub Pages instead. The upload
now warns you mid-flight and names the field that's missing.

## Fixes

- Credentials pasted from the Cloudflare dashboard no longer break R2 uploads when they
  pick up a stray space or newline — they're trimmed on the way in and on the way out.
- The size limit that decides what can go to GitHub Pages was set too high, so files
  between 50 and 90 MB sailed past the check and then failed on upload. It now matches
  what GitHub actually accepts.
