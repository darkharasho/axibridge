# Release Notes

Version v3.1.0 — August 23, 2026

## Cleanse counts now match the in-game arcdps meter

A player reported that AxiBridge showed fewer cleanses than the arcdps overlay did for the same fight, and the numbers were off by enough to matter on a support build.

The cause was in the analysis, not the display. The stats engine only counted a cleanse when the condition came off a squad player. Anything you cleansed off a pet, a minion, a clone, a spirit or a turret was counted zero times — the in-game meter folds those into their owner and credits you, so every ranger, necro, mesmer and elementalist in the squad was reading low.

Cleanses landed on a squad member's pet or minion are now credited to the player who cleansed them, which is what the arcdps meter does. Conditions cleansed off non-squad friendlies stay out of the count, matching arcdps as well.

## A scope toggle on the cleanse tables

Because "a cleanse" turns out to mean three different things depending on who is asking, the Support tables now have a scope pill:

- **arcdps** — the default, and what the in-game meter shows: squad plus self plus squad minions.
- **all** — squad plus self, the number older AxiBridge versions and dps.report reports show. Use this to compare against a published report.
- **squad** — cleanses on other people only, with self-cleanses excluded. Use this to see who is actually supporting the group rather than cleaning up their own conditions.

Cross-report rollups were also summing only the squad bucket, so a player's lifetime cleanse total was missing every self-cleanse they had ever landed. Rollups now use the same arcdps-scoped total as the per-fight tables.

NOTE: The minion figure comes from the log parser, so it is available on logs parsed by this version onward. Older logs in your history fall back to the "all" scope and the arcdps option is hidden for them until they're re-parsed.
