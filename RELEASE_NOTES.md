# Release Notes

Version v2.5.6 — April 17, 2026

## Fixes

**R2 replay not loading on web reports** — the CORS rule was being set with the full GitHub Pages URL path (e.g. `https://user.github.io/repo`) instead of just the origin (`https://user.github.io`). Browsers check origin only, so the rule never matched and all R2 replay fetches were blocked.

If your R2 API token doesn't have bucket admin permissions, the automatic CORS update will now show a visible warning during upload with instructions to set it manually in the Cloudflare R2 dashboard. Previously this failure was silent.
