# Release Notes

Version v2.10.4 — June 14, 2026

## Smoother web reports on glass themes

Web reports published with the glass look were quietly hammering the GPU while you scrolled — barely noticeable on a beefy graphics card, but enough to make low-end and integrated GPUs spike and stutter on every page. The frosted-glass panels were re-blurring everything behind them on every single frame. They now use a static translucent fill instead, so the look is the same but scrolling is far easier on your machine.

NOTE: This only applies to newly published reports. Already-published reports will pick it up the next time they're republished.
