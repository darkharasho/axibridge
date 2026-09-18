# Release Notes

Version v3.11.0 — September 18, 2026

## Send fight reports through the AxiTools bot

You can now link a Discord channel to the AxiTools bot instead of pasting a webhook URL. Open the destination manager, hit "Link AxiTools channel", run `/bridge pair` in the channel you want reports in, and paste the code it gives you. From then on reports post as the bot.

The reason this matters: webhooks can't use a server's custom emoji, so class columns in a bridged report show real profession and elite spec icons instead of plain text. Everything else about the report is unchanged — same stats, same layout, same settings.

Webhooks still work exactly as before, and you can mix both. Bridged destinations are marked with a bolt in the dropdown so you can tell them apart at a glance.

NOTE: The bot has to already be in your server for pairing to work. If someone revokes the link on the Discord side, the destination turns amber with a "Re-link" tag and stops sending until you pair it again — it won't silently drop reports.

## Fixes

- A field with nothing in it no longer breaks a Discord post outright.
- Long rosters get budgeted against what actually gets posted, so a big fight report won't get rejected for being over Discord's character limit.
- Discord rate limits with an empty or zero retry hint are handled instead of retried immediately.
