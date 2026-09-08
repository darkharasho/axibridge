# Release Notes

Version v3.7.1 — September 8, 2026

## Pick How Your Web Reports Look in Discord

Every report webhook now has a **Post style** dropdown with three options:

- **Text** (the default, and what you have today) — session stats and all nine leaderboards as embed fields.
- **Banner + stats** — a generated banner image up top, leaderboards as text below it.
- **Full graphic** — one generated image carrying the whole session, no text tables.

The graphic is drawn locally and attached to the post, so it works the same whether you're on a normal channel or a forum. Set it per webhook, so your guild channel and your public channel can look different.

NOTE: this only affects the message posted after you publish a **web report**. Your per-fight log embeds are untouched.

## Report Cards Got a Real Design

The generated card no longer looks like a plain dark box. Layered colour across the background, a big fight-count hero with the win/loss record split out, coloured stat tiles, a map bar, a per-fight timeline, and session leader cards tinted with each player's class colour and icon.

## Text Posts Read Properly on Narrow Screens

If you read reports in a forum channel's post sidebar, on a phone, or in a docked window, leaderboard rows used to wrap in the middle of account names — `Quantumized.58` on one line, `73` on the next. Every stat block is now a monospace table with names truncated to a fixed width and numbers in their own aligned column, so a narrow view clips cleanly instead of scrambling.

## Fixes

- The post style dropdown was see-through and nearly unreadable when opened. It now matches the rest of the settings controls.
- If Discord rejects the card image for any reason, the post now retries without it rather than failing outright — a broken card never costs you your report link.
