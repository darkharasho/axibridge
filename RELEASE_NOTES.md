# Release Notes

Version v2.13.5 — July 8, 2026

## Fixes

- Fixed the "409" error when picking a brand-new, empty GitHub repo for web reports. If the repo has no commits yet, AxiBridge now seeds it with a first commit so GitHub Pages can actually turn on. Flipping the repo between private and public was never the problem — an empty repo was.
