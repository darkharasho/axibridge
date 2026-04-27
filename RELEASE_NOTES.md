# Release Notes

Version v2.6.1 — April 26, 2026

## Clearer R2 CORS Setup

The setup guide now explains how CORS works on Cloudflare R2, why an `Object Read & Write` API token isn't enough to auto-configure it, and exactly what to do instead. If you've been hitting the "R2 PutBucketCors failed" warning even after adding the rule manually, the new guide explains why — AxiBridge needs admin scope just to *read back* the rule and confirm it's there — and shows the exact origin format the rule has to match.

The CORS warning in the upload log is now prefixed with `[WARN] (non-blocking)` so it's obvious the upload itself succeeded and the viewer will load once CORS is in place.
