# Boon Uptime Incoming Damage Heatmap

**Date:** 2026-03-27
**Origin:** Discord thread "incoming damage buckets in boon uptime" (thread 1486038697190096946)
**Status:** Design

## Summary

Add an incoming damage heatmap overlay to the Boon Uptime drilldown chart, mirroring the existing implementation in the Boon Timeline section. When a user clicks into a specific fight's drilldown in Boon Uptime, they can toggle a "Squad Damage Heatmap" button to overlay semi-transparent red bars representing incoming squad damage intensity behind the boon stack/uptime line.

## Motivation

The Boon Timeline section already supports overlaying incoming damage as time-based buckets on the per-fight drilldown chart. This lets users correlate boon generation with damage pressure. The same capability is equally valuable in the Boon Uptime section, where users want to see how boon stacks/uptime holds up under damage pressure. There are no technical barriers — both sections use 5-second bucket data and share the same incoming damage source maps.

## Design

### Data Layer (StatsView.tsx)

Modify the `boonUptimeDrilldown` useMemo to augment drilldown data with incoming damage fields:

1. Look up the selected fight's incoming damage buckets from the existing `squadIncomingDamageBucketsByFightId` map (with `fallbackIncomingDamageBucketsByFightId` as fallback), using the same primary/fallback selection logic as `boonTimelineDrilldown`.
2. Scale the bucket values to match the total from `squadIncomingDamageTotalByFightId`.
3. Compute `incomingMax` (the highest bucket value).
4. Augment each data point with:
   - `incomingDamage: number` — the raw scaled damage value for that bucket
   - `incomingIntensity: number` — normalized 0-1 value (`incomingDamage / incomingMax`)
5. Add `squadIncomingDamageBucketsByFightId`, `fallbackIncomingDamageBucketsByFightId`, and `squadIncomingDamageTotalByFightId` to the useMemo dependency array.
6. Widen the return type to include `incomingDamage` and `incomingIntensity` in the data array type.

### State (StatsView.tsx)

- Add `const [showBoonUptimeIncomingHeatmap, setShowBoonUptimeIncomingHeatmap] = useState(false);` alongside the existing `showBoonTimelineIncomingHeatmap` state.
- Pass `showIncomingHeatmap={showBoonUptimeIncomingHeatmap}` and `setShowIncomingHeatmap={setShowBoonUptimeIncomingHeatmap}` to both BoonUptimeSection render sites (classic and modern layouts).

### UI (BoonUptimeSection.tsx)

#### Props

Add to `BoonUptimeSectionProps`:
- `showIncomingHeatmap: boolean`
- `setShowIncomingHeatmap: (value: boolean) => void`

Widen `drilldownData` type from `Array<{ label: string; value: number; maxValue?: number }>` to `Array<{ label: string; value: number; maxValue?: number; incomingDamage?: number; incomingIntensity?: number }>`.

#### Imports

Add `ComposedChart`, `Bar`, `Cell` from recharts. Keep `LineChart` — it is still used by the per-fight overview chart above the drilldown.

#### Computed values

Add (mirroring BoonTimelineSection):
```typescript
const hasIncomingHeatData = drilldownData.some((entry) => Number(entry?.incomingDamage || 0) > 0);
const drilldownHeatData = drilldownData.map((entry) => ({
    ...entry,
    incomingHeatBand: 1
}));
```

#### Drilldown header

Add the "Squad Damage Heatmap" toggle button in the drilldown header, between the title and "Clear" button, with identical styling to BoonTimelineSection:
```tsx
<button
    type="button"
    onClick={() => setShowIncomingHeatmap(!showIncomingHeatmap)}
    className={`text-[10px] uppercase tracking-[0.16em] transition-colors ${
        showIncomingHeatmap
            ? 'text-red-200 hover:text-red-100'
            : 'text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]'
    }`}
    title="Toggle squad incoming damage intensity heatmap overlay"
>
    Squad Damage Heatmap
</button>
```

#### Drilldown chart

Replace `<LineChart data={drilldownData}>` with `<ComposedChart data={drilldownHeatData}>`.

Add hidden YAxis for heatmap: `<YAxis yAxisId="incomingHeat" hide domain={[0, 1]} />`

Add conditional Bar (before the Line, so it renders behind):
```tsx
{showIncomingHeatmap && hasIncomingHeatData && (
    <Bar
        yAxisId="incomingHeat"
        dataKey="incomingHeatBand"
        name="Incoming Damage Heat"
        barSize={24}
        fill="rgba(239,68,68,0.35)"
        stroke="none"
        isAnimationActive={false}
    >
        {drilldownData.map((entry, index) => {
            const intensity = Math.max(0, Math.min(1, Number(entry?.incomingIntensity || 0)));
            const alpha = 0.06 + (0.52 * intensity);
            return <Cell key={`incoming-heat-${index}`} fill={`rgba(239, 68, 68, ${alpha.toFixed(3)})`} />;
        })}
    </Bar>
)}
```

Keep existing `<Line>` and `<ReferenceLine>` (stack cap) unchanged.

Update Tooltip formatter to handle the heatmap series name:
```tsx
formatter={(value: any, name: any, item: any) => {
    const point = item?.payload || {};
    if (String(name || '') === 'Incoming Damage Heat') {
        return [formatWithCommas(Number(point?.incomingDamage || 0), 0), 'Squad Incoming Damage'];
    }
    return [formatWithCommas(Number(value || 0), 0), String(name || '')];
}}
```

## Files Modified

| File | Change |
|------|--------|
| `src/renderer/StatsView.tsx` | Add `showBoonUptimeIncomingHeatmap` state; augment `boonUptimeDrilldown` useMemo with incoming damage data; pass new props to BoonUptimeSection (both render sites) |
| `src/renderer/stats/sections/BoonUptimeSection.tsx` | Add heatmap props; swap LineChart for ComposedChart in drilldown; add Bar/Cell heatmap layer; add toggle button; update Tooltip |

## Files Not Modified

- `computeBoonUptimeTimeline.ts` — no changes to uptime computation
- `computeIncomingStrikeDamageData.ts` — no changes to damage computation
- `computeBoonTimeline.ts` — unrelated
- No new files created

## Testing

- Verify the heatmap toggle appears in the Boon Uptime drilldown when a fight is selected
- Verify red bars render with correct intensity scaling
- Verify tooltip shows "Squad Incoming Damage" with formatted value on heatmap bar hover
- Verify stack cap reference line still renders correctly on stacking boons (Might, Stability)
- Verify the Boon Timeline heatmap continues to work independently
- Run `npm run validate` (typecheck + lint)
