# Release Notes

Version v3.22.2 — October 8, 2026

## Fixes

- Fixed the long "Not Responding" freeze after launching on Windows. With a big arcdps log folder it could last up to two minutes and looked like a crash. The log folder watcher was setting up a separate OS watch for every existing log; it now uses a single watch for the whole folder.
- Publishing to GitHub: if the connection breaks mid-upload (for example an SSL "BAD_RECORD_MAC" error), requests that are safe to repeat are now retried once automatically. If it still fails, the error now says the cause is on your computer or network and points at the usual suspects: antivirus HTTPS/web scanning, a VPN or proxy, or an unstable connection.
- `main.log` now records a startup timeline and any freeze over 300ms, which makes slow launches easier to diagnose.

Version v3.22.1 — October 6, 2026

## Fixes

- If access is revoked and AxiBridge can't save that to disk, it now restarts straight into the block screen, so nothing keeps running behind it. Before, the block screen covered an app that was still running.

Version v3.22.0 — October 5, 2026

## Access check

AxiBridge now checks a public access list when it starts and every few hours. Access to the Axi apps can be revoked for accounts, guilds or Discord servers that violate the terms of use, and a revoked install shows a block screen instead of the app.

The list is downloaded from `config.axi.link` and holds only one-way hashes. AxiBridge checks the Discord servers your webhooks post to and the account and guild that recorded each log against it on your device and never sends them anywhere. To find a webhook's server, it sends an unauthenticated request to the webhook URL on discord.com.

If the list can't be reached, AxiBridge keeps working as before. The README has a new **Access** section that spells out exactly what is checked and how to appeal.

Version v3.21.1 — October 5, 2026

## QoL Improvements
- The squad and enemy summary tiles on the expanded log card have more room now, so numbers aren't cramped.
- The publish button in the stats header just says "Publish". The target repo is still in the tooltip.
