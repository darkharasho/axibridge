# Release Notes

Version v3.17.0 — September 22, 2026

## Publishing to the web is much faster

A publish that took over two minutes now takes about 45 seconds, and the busiest
sites were closer to five minutes before. The reason it was slow had nothing to
do with your logs: GitHub re-deploys your entire report site on every publish, so
as the site grew, every future publish paid for it. Three things changed — old
reports get packed down as you go, leftover viewer files from previous versions
get swept up, and a GitHub build step your site never needed is now switched off.

The clean-up is spread across publishes rather than done all at once, so a site
with hundreds of old reports gets faster with each one you publish until it has
caught up. Nothing is lost — old reports stay readable the whole time.

NOTE: Reports published by very old versions get repacked into a format that
needs AxiBridge 3.10 or newer to open. If someone opens one with an older
version, the title tells them so instead of showing a broken page.

## Fixes

- Clicking Upload to Web no longer freezes the app for half a minute on a big
  night's worth of logs. It was copying the whole stats set twice on its way to
  the uploader; now it doesn't.
