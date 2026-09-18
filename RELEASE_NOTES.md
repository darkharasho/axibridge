# Release Notes

Version v3.10.4 — September 17, 2026

## Resurrect credit goes to the right player

Two revive skills were missing from the attribution list, so their revives were either landing in "unattributed" or being handed to whoever happened to have a banner or Spirit of Nature still ticking nearby.

- **Signet of Undeath** wasn't tracked at all.
- **Glyph of Renewal** never showed up because the game casts it as Renewal of Air/Earth/Fire/Water, not under the glyph's own name.

Both are now tracked, along with the alternate skill ids the game uses for Battle Standard, Spirit of Nature, Illusion of Life, Signet of Mercy and Glyph of the Stars — those used to match by name only, which was fragile.

Instant-cast revive utilities also get a tight 2-second attribution window instead of the long ground-field windows, so a Spirit of Nature planted 40 seconds ago no longer steals credit for a signet pickup.

Checked against 339 real WvW logs: unattributed revives dropped from 4.28% to 4.22%, but the bigger change is credit moving onto the player who actually did the rez. This applies to reports as you view them, so old logs get the new attribution too.

NOTE: Function Gyro still isn't tracked — it flies out before it channels, so the cast time alone isn't enough to attribute it. That one needs more work.
