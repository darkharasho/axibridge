# Release Notes

Version v3.0.6 — August 21, 2026

## Fixes

- Battle Standard accuracy improved: now counts connectedHits when Elite Insights provides them, and falls back to the per-hit entries when they aren’t available. This removes the previous false zero and makes Battle Standard totals reflect actual hits more reliably.

- Offense rate denominator handling corrected: critical rate and related rate weights compute correctly across backends that report denominators differently. For the axilog backend (where per-target denominators aren’t provided), the whole-fight denominator from statsAll[0] is used to calculate rates. For Elite Insights (where per-target denominators exist), sums are preserved per target instead of being substituted. This fixes cases where Critical Rate could incorrectly render as zero and keeps real per-target zero values intact.
