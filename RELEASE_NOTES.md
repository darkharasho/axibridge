# Release Notes

Version v2.14.2 — August 1, 2026

## Zone Colours on the Replay Map

The map replay now outlines every sector in the colour of the team that owns it, using the real sector boundaries from the game. Each objective's zone gets its own complete outline, so shared borders show both teams' colours side by side — and objective dots and names are coloured by their owner too.

It's fully automatic: your match is detected from your squad's guilds, so there's nothing to set up. Any log from the current match week gets colours; last week's logs stay neutral instead of guessing. A "Zone borders" toggle in the replay Layers panel turns the outlines off if you want a clean map.

NOTE: ownership is snapshotted around when the log is processed, so a sector that flips later in the night keeps the colour it had at snapshot time.

## Fixes

- Replay controls (fight picker, play/speed buttons, squad member cards) were grey-on-grey on glass themes — readable again.
