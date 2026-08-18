# Release Notes

Version v3.0.0 — August 18, 2026

## AxiBridge Now Parses Your Logs Itself

Every number in the app used to come from Elite Insights — a ~90 MB external parser AxiBridge downloaded, launched as a separate process per log, and waited on. As of 3.0.0 it parses with [Axilog](https://github.com/darkharasho/axilog) instead: a native parser built for this app, running in-process.

What you'll notice is the waiting. A 49-second skirmish parses in about 70 ms and a full 5:48 zerg fight in about 400 ms, against 2.3 s and 6.8 s for Elite Insights on the same machine and the same logs — **17–32× faster, at a tenth to a sixteenth of the memory**. On a raid night with a few dozen fights, a stats set that took minutes to assemble now lands while you're still reading the previous one.

Nothing about your setup changes. dps.report uploads still happen, and your permalinks still work exactly as before — dps.report is now purely how AxiBridge *shares* a fight, not how it learns what happened in one. That also means a slow or down dps.report no longer holds up your stats.

If you'd previously picked Elite Insights in Settings, AxiBridge switches you over once and tells you it did, with the picker right there as the undo. It only does this on a launch where Axilog loaded correctly, so a half-finished install can't strand you.

## Everything Reads the Same Data Now

The visible half of that change is speed. The invisible half is that all seven families of statistics — roster and identity, fight facts, positioning, commander metrics, damage, boons, and conditions — were moved onto Axilog's own format, one at a time, with each move checked number-by-number against the old path before it shipped. Where the two disagreed, the disagreement was traced to a cause and written down rather than smoothed over with a tolerance.

A few of those traced disagreements were bugs on our side, and they're fixed here:

- **Conditions are now decided by what a buff actually is**, not by matching skill names, so conditions applied by unusually-named skills stopped going missing.
- **Closest to Tag works again.** Elite Insights v3.24 quietly stopped emitting distance data unless combat replay was enabled, which zeroed the metric for everyone.
- **Elite specializations, empty boon columns, and account names** with arcdps's leading colon all read correctly.
- **Enemies group by profession**, never by their WvW rank title.
- **Your guild is derived from the commander's most-repped guild**, and WvW NPCs no longer inflate the enemy count on web reports.

## The Replay Map Got Its Squad Back

Squad markers — the ones your commander drops on the ground — now render on the replay at the positions they were placed, with the right art. The commander tag is drawn in its actual tag colour rather than a generic marker. Both come from data no previous version could see.

The party spotlight is back too: click a **Party N** heading in the squad panel to dim everyone outside that party, and the chip at the top clears it.

## Fixes

- Large log sets no longer run the app out of memory: retained log payloads are now bounded, and details evicted from memory rehydrate from the on-disk cache instead of vanishing.
- Replay members are keyed on a stable identity, so players no longer swap trails mid-fight.
- Enemy downs and deaths pulse on the replay, and each track honours its own start time.
- Barrier columns were mislabeled; unused barrier is now surfaced.
- The Linux desktop-entry integration tests no longer run on other platforms.

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
