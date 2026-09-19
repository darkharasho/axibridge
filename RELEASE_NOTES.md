# Release Notes

Version v3.12.0 — September 18, 2026

## Settings, reorganized

Settings is now five categories — General, Discord, Web Report, Logs, About —
with a nested rail on the left instead of one long flat list. One category is
open at a time, so you see where you are instead of scrolling past sixteen
headings looking for the one you wanted.

Search now looks across every category, not just the open one, and each
category shows how many of its settings match what you typed.

Sections are named after what they do rather than how they're built. The
Discord settings that used to be called "embed" something are just Discord
settings now. Your existing settings carry over untouched — only the labels
and their placement changed.

## Send fight reports to more than one place

You can now turn on as many Discord destinations as you want, and every fight
report goes to all of them. Each destination has its own on/off switch, and
the header picker reads the channel name when one is on, "N destinations" when
several are.

Destinations also live in Settings now, under Discord, with the same controls
the modal had — you no longer have to open the webhook dialog just to see
where reports are going.

If one destination fails, the others still go out, and the failure is reported
against that row rather than the whole send.

NOTE: a revoked bridge link is now called out by name. The old warning claimed
reports were stopped entirely even when a healthy channel was still receiving
them.

## A map of where the fight happened

Fight report embeds now carry a thin horizontal slice of the WvW map along the
bottom, with the squad's path drawn on it and a beacon marking where the fight
took place. It's on by default and can be turned off under Discord settings.

This only applies to new fight reports.

## Log folder from Settings

The arcdps log folder is now shown and changeable from Settings, under Logs.
It used to be reachable only through first-time setup.

## Fixes

- The header destination picker stays open while you flip several destinations
  on, instead of closing after each one.
- Turning everything off with "Disabled" now actually clears every destination.
  It used to leave one still receiving.
- The map slice keeps the beacon and squad markers inside the frame, and drops
  the long walk out from spawn so the trail shows the fight, not the commute.
