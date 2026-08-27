# Release Notes

Version v3.2.0 — August 26, 2026

## Arcdps cleanse data path
- If your log includes axilog arcdps counters, you’ll see cleanses counted the arcdps way (condiCleanseArcdps plus condiCleanseArcdpsOnMinion). This uses the arcdps methodology rather than the old minion-sum approach.
- The old “from npcs” bucket isn’t added to the arcdps total, to avoid double-counting and reflect how arcdps reports data.
- NOTE: This applies to new uploads with arcdps counters. Logs without those counters keep using the legacy numbers.

## Totals and display behavior
- cleanse totals now prefer the arcdps methodology when present, and fall back to the legacy approximation otherwise.
- The total calculation for arcdps is gated by presence of arcdps data; if not present, you’ll still see EI-based numbers.
- The resolveCleanseTotal path explicitly prioritizes arcdps counters for the arcdps scope, but leaves other scopes unchanged.

## Data model updates
- Added explicit arcdps-related fields to the data model: condiCleanseArcdps, condiCleanseArcdpsByMinion, condiCleanseArcdpsOnMinion, boonStripsArcdps, boonStripsArcdpsByMinion, boonStripsArcdpsOnMinion, plus notes describing how they relate to arcdps counting.

## Ingestion and aggregation
- The ingester now accumulates arcdps counters into new totals (e.g., condiCleanseArcdpsLogs) and mirrors values across the related arcdps fields. This keeps the arcdps data separate yet compatible with existing metrics.

## QoL Improvements
- The system now distinguishes arcdps data from legacy data more clearly, reducing confusion when a log includes arcdps counters.

## Fixes
- Reduces risk of double-counting by using a dedicated arcdps counters path when available, while preserving legacy data for older uploads.

NOTE: If you haven’t uploaded logs with arcdps counters yet, you won’t see the new arcdps-specific numbers. This is a forward-facing change that activates with future uploads that include the arcdps data.
