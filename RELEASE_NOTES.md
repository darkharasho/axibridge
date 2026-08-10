# Release Notes

Version v2.19.2 — August 10, 2026

## dps.report Links Are Back on Discord Embeds

Fight embeds posted to Discord had stopped linking to the dps.report page — the title wasn't clickable, and in image mode the "dps.report" link came through broken. Logs you'd uploaded before still linked correctly, which made it look intermittent, but every freshly parsed log was affected.

The cause: since local parsing was introduced, the app kicks off the dps.report upload in parallel with the parse to save time, and the embed was being sent before that upload had handed back its link. It now waits for the link before posting. Because the upload starts first and usually finishes during the parse, this costs no noticeable delay, and if dps.report is slow or down the embed still goes out — just without the link, rather than not at all.

Version v2.19.1 — August 9, 2026

## MVP Cards Now Explain Themselves Honestly

The Top Players MVP cards were picking their headline reason and stat chips by how close a player was to the squad's best in each stat — completely ignoring your MVP weights. So if you weighted Down Contribution at 1.00 and Condition Damage at 0.05, the winner's card could still headline "Condition Damage" and make it look like your weights weren't applied. They were — the ranking was always weighted correctly — but now the card leads with the stats that actually drove the score.

## Fixes

- Linux: the AppImage no longer trusts a stale inherited `$APPIMAGE` path, so the desktop entry stays pointed at the real install location.
- Web reports on phones: the action bar now stacks so all four buttons fit at narrow widths.
