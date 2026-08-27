# Release Notes

Version v3.2.3 — August 27, 2026

## Special Buffs and Sigil/Relic Uptime work again

Both sections were rendering completely empty on the native parser. The filter that decides "is this a boon or something else" was only reading a field the old Elite Insights parser wrote, and defaulted everything else to "boon" — so every buff got classified as a boon and the special-buff sections had nothing left to show. They now ask the parser's own buff catalog first. Same fix restores non-damaging condition uptime and the commander boon scope.

## Skills stop showing up as "Skill 80224"

A `.zevtc` always records a skill's id, but only records its *name* if your client happened to have that skill loaded when it fired. So the same skill reads "Rend" in one log and "Skill 80224" in the next — same night, same build.

AxiBridge now remembers names across your whole log history. The first log that names a skill teaches every log that doesn't. This applies retroactively too: names learned today get filled in on old logs the next time you open them, with no re-parse needed.

NOTE: A small tail of ids — NPC, environment and gathering skills — have no name in any log or in ArenaNet's API, and will still show as placeholders.

## Missing skill icons

Skills with no artwork available were rendering as blank squares instead of the generic placeholder icon, which affected named skills like Rend too. They're back to showing the same placeholder Elite Insights used.

NOTE: Icons are filled in at parse time, so this only affects new logs. Re-parse your history to backfill older ones.
