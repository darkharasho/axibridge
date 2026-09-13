# Release Notes

Version v3.10.0 — September 12, 2026

## Web uploads work on slower connections

If your web upload kept failing with "401 Bad credentials" even after reconnecting GitHub, that was never a login problem. GitHub throws that error when a single file takes longer than about a minute to upload, and report.json was one big file. Reports are now compressed and uploaded in small pieces (4 MB max), so publishing works even on slow upload links. Pages-hosted replays get the same treatment.

If an upload still stalls, AxiBridge retries it once and then tells you GitHub timed out receiving the file, instead of blaming your credentials.

Thanks to Shacod on Discord for reporting this one.

NOTE: reports published from 3.10 need the 3.10 web viewer. If someone in your guild publishes from an older AxiBridge to the same report repo, it puts the old viewer back, and 3.10 reports will just show "open with AxiBridge 3.10 or newer to view" until someone publishes again from 3.10. Get everyone updated.

NOTE: viewing reports on iPhone/iPad now needs iOS 16.4 or newer. Existing reports keep loading like before.

## Fixes

- Clicking a sub-section in the web report right after switching groups no longer yanks you back to the top of the page.
- Very large reports are now trimmed a bit earlier (35 MB instead of 50 MB), since GitHub's real per-file limit turned out to be around 38 MB.
