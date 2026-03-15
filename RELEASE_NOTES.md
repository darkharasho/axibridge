# Release Notes

Version v1.40.15 — March 14, 2026

## Boon Generation Metrics

- Boon Output tables now show Total, Average, and Uptime per player and boon, giving a clearer read on how boon generation plays out across fights.
- A new Generation Milliseconds (Raw Accumulation) view tracks the raw time spent generating boons, which feeds the Total/Average/Uptime displays.
- These metrics rely on detailed buff data from EI; if the data isn’t present, some values may be unavailable.

NOTE: The new metrics are based on the buff data EI provides and may not appear for older uploads lacking those details.

## Down Contribution Fix for Aggregate Targets

- Down contribution is now computed from totalDamageDist when EI uses an aggregate target (like Enemy Players), instead of relying on the zeroed aggregate target path.
- This fixes some cases where down contributions would look incorrect in WvW-style data.

## Icon Refactor / UI cleanup

- Refactored class icon handling and removed a large set of unused SVG icons (e.g., Amalgam.svg, Antiquary.svg, Berserker.svg, etc.).
- UI may show fewer icons for some classes now. NOTE: If you relied on specific icons, you might notice gaps.

## Docs / Metrics Spec Updates

- Updated docs/metrics-spec.md to explain the aggregate-target down-contribution behavior and to add the new boon-generation metrics section with how Total/Average/Uptime are calculated and displayed.
- These changes make the boon data easier to read and compare across fights and players.

## QoL Improvements

- General doc clarifications around boon metrics and down-contribution calculations; no user-facing UI behavior changes beyond the sections above.
