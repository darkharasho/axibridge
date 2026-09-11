# Release Notes

Version v3.8.1 — September 10, 2026

## Died Under Illusion of Life

The Illusion of Life card has a third outcome: **Died under IoL**, shown in purple. It counts players who got picked up by IoL and then skipped the downed state and died outright, which is what happens when the buff runs out or someone gets killed through it.

- Before, those deaths were counted as "Re-downed" with a fake 1–8s time to go down again, which dragged the histogram and the median down. They're kept out of both now.
- Only IoL cast by your squad is tracked. IoL from mesmers outside the squad isn't counted.

NOTE: This only shows up in new reports. Reports published before this version keep the old survived/re-downed split, and fight slicing is turned off on them until they're republished.
