# Release Notes

Version v2.12.2 — June 24, 2026

## Fixed: "Closest to Tag" Broken on Commander-less Fights

Elite Insights v3.24 changed how it reports distance when there's no commander in the squad — it now emits `-1` instead of the old string `"Infinity"`. AxiBridge was treating that `-1` as a real distance value, so "Closest to Tag" would show broken (near-zero) stats on fights without a commander tag.

Both sentinels are now handled correctly. Commander-less fights fall back to stack distance as intended, and fights with a real commander tag continue to work as before.
