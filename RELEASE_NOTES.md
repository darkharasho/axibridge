# Release Notes

Version v2.14.3 — August 1, 2026

## Webhook Titles: Account & Guild Tokens

Report webhook title templates support three new tokens:
- `{account}` — the primary commander's GW2 account name (e.g. `Axi.1234`)
- `{guild}` — the squad's dominant guild name, resolved automatically via the GW2 API
- `{guild_tag}` — just the tag, no brackets, so you can format it yourself (e.g. `[{guild_tag}]`)

Like `{commander}`, these fall back to "Unknown" when nothing resolves. The Settings card preview and placeholder hint under the webhook title field now list all available tokens.
