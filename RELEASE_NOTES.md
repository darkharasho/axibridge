# Release Notes

Version v3.9.0 — September 12, 2026

## Warrior burst skills now split by adrenaline tier

Eviscerate, Arc Divider, and the rest of Warrior's adrenaline-based bursts now show up as separate rows per tier — e.g. "Eviscerate (Adrenaline 1)" vs "Eviscerate (Adrenaline 2)" — instead of getting lumped together. Jade sphere skills now split by attunement variant the same way.

NOTE: this needs logs parsed with the newer @axiapps/axilog parser. Older logs won't have the tier/variant labels, so their tiers will stay combined until you re-parse them.

## Skill rows merge cleanly across cast and hit

A skill's cast and hit are two separate ids under the hood, which used to show up as duplicate-looking rows. Those are now merged into a single row wherever skills are listed — Skill Usage, Skill Totals, player damage/healing/barrier/incoming breakdowns, and the All Damage drilldown.

Thanks to BreakN on Discord for flagging this one.
