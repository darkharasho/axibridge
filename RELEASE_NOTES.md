# Release Notes

Version v2.5.16 — April 23, 2026

## Fixes

**Fight charts showing data in the wrong order.** The Spike Damage, Incoming Strike Damage, and All Damage charts were showing the right fight labels (F1, F2, etc.) but with values belonging to a different fight at each position. Charts now correctly match each fight's data to its label.

**Stab Performance fight breakdown was empty.** Clicking into a fight on the Stab Performance section showed a blank chart. The selected player's stab generation line is now drawn correctly.

**Upload overlay wasn't blurring the sidebar.** When the web upload modal was open, the left sidebar would render on top of the overlay instead of behind it. Fixed by rendering the overlay at the document root level.
