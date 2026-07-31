# Release Notes

Version v2.14.0 — July 31, 2026

## Guild tags on reports

Published reports now show your squad's guild as a `[TAG]` chip on the report page itself, on the web report listing, and in the in-app History view. In the listing and History view, click the chip to instantly search for everything from that guild. AxiBridge detects the session's dominant guild from who repped in the logs, then resolves the name and tag from the official GW2 API — just once per guild, cached permanently after that.

NOTE: only the squad's overall guild is published; individual players' guild affiliations never leave your machine. This also only applies going forward — logs parsed before this update don't have the data needed to tag their reports.

## Discord report webhooks

You can now point one or more Discord webhooks — forum channels included — at your published reports. Add them in Settings, and every "Upload to Web" publish sends a message with the report link plus a quick fight/W-L/KDR summary. Title templates support `{date}` (zero-padded `MM/DD/YY`, e.g. `07/31/26` — locale-independent, so it looks the same for everyone), `{day_of_week}`, `{commander}`, and `{commanders}`, with a live preview in Settings as you type. This is a separate list from the existing per-fight Discord webhooks, which are unchanged.
