# Release Notes

Version v3.16.0 — September 21, 2026

## Axi Design

There's a new look in Settings → Application called **Axi Design**. It's flat and outlined — hard-edged blocks with a solid offset shadow instead of glass and glow, and a left rail for navigating Stats. It's off by default, so nothing changes unless you turn it on.

It covers the whole app, not just the main window: tables, bars, wells, checkboxes, switches, dropdowns, the colour picker, the search palette, and the published web report. Turning it on and browsing around shouldn't turn up a surface that missed the memo.

## No more freezing while logs parse

Parsing a log used to lock up the entire window — you couldn't scroll, click, or even watch the spinner move. Parsing now happens off the main thread, so the app stays responsive while it chews through a folder.

Dropping in a big batch is also much faster to start. Add Logs no longer builds a card for every single file up front, and the button responds the moment you press it instead of after the work is done.

## Stats header

Search now gets its own line in the header rather than competing for space with everything else, and clicking it opens the palette with the cursor already in the field.

## Share reports

Single-fight share links have a proper header. Instead of "Unknown Commander" over a two-minute date range, you get the fight itself: where it happened, how it ended, how the two sides were matched, and what it cost. Published reports also carry the current app mark and a back link that's actually readable.

NOTE: Existing published reports keep the viewer they were published with. Publish again to pick this up.

## Fixes

- The overview scoreboard no longer runs off the side of a phone screen — the tally moves to its own row and the two sides stack beneath it.
- Fixed page titles being crammed against their subtitles.
- Fixed the step spinner freezing mid-spin when the main thread was busy.
- Fixed the glass toggles looking active under Axi Design when they weren't, and a handful of stray glows and mismatched hairlines.
