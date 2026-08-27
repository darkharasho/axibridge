# Release Notes

Version v3.2.2 — August 27, 2026

## Elite Insights is gone

There's no parser to install, update, or babysit anymore. Axilog ships inside the app and handles everything, so the Parse Engine picker and the whole install/update card are out of Settings.

The old Elite Insights install gets deleted automatically the first time you launch this version, and Settings will tell you how much disk space that gave back. Nothing else to do on your end.

NOTE: there's no fallback engine now. If you hit a log that won't parse, it's a bug worth reporting rather than something you can work around by switching engines.

## Parser settings that actually do something

Settings used to show twelve parser options. Nine of them were Elite Insights leftovers that stopped doing anything a while ago — flipping them changed nothing. Only the three that still matter are left: combat replay, damage modifiers, and raw timeline data.

## Fixes

- Removed the **Anonymize Players** toggle from the dashboard quick settings. It had quietly stopped working when the parser changed, so it was showing you a switch that did nothing.
