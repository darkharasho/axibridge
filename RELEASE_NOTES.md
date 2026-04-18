# Release Notes

Version v2.5.2 — April 17, 2026

## Cloudflare R2 replay storage

You can now connect a Cloudflare R2 bucket in Settings to store replay data separately from your GitHub Pages report. The motivation: GitHub's API has a file size limit, and large sessions were hitting it. With R2, the full replay data (player movement, health, damage-taken, skill casts) is uploaded to your own R2 bucket and streamed on demand — so your reports stay under GitHub's limits no matter how long the session is.

To set it up, go to Settings → R2 Storage and enter your Cloudflare account ID, R2 API token, bucket name, and public URL. All five fields are required.

NOTE: This only affects new uploads. Existing reports aren't changed.

## Replay map now works in the history tab

The replay section was blank when viewing a fight from the history tab. Fixed — it renders correctly now regardless of whether you're in the main view or the embedded history view.

## Precise replay positions (R2)

When R2 is configured, there's a new "Precise replay positions" toggle in Settings. Normally positions get rounded to integers to keep file sizes down. Enable this if you want full floating-point precision — slightly smoother movement on the map, slightly larger R2 payloads.

NOTE: This only affects future uploads.
