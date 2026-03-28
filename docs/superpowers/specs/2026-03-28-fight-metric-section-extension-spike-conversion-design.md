# FightMetricSection Extension + SpikeDamage Conversion

**Date:** 2026-03-28
**Origin:** User request to unify chart section UIs under FightMetricSection
**Status:** Design
**Sub-project:** 1 of 3 (this: SpikeDamage, later: Boon sections, SkillUsage)

## Summary

Extend FightMetricSection with optional extension points (fight selection, drilldown, header extras, footer, summary override) and convert SpikeDamageSection to use it. SpikeDamageSection goes from a standalone ~637-line component to a thin ~100-150 line wrapper that passes specialized content through FightMetricSection's render props.

## Motivation

The new FightMetricSection (built for strip spikes) provides a clean, consistent "player list + per-fight trend chart" layout with glass-surface styling, animated line charts, and expand support. SpikeDamageSection implements the same pattern but with its own older visual style (CSS variables, grid layout, modal-pane expansion). Converting it to FightMetricSection ensures visual consistency and reduces code duplication.

## Design

### FightMetricSection Extension Points

All new props are optional. Existing strip spikes usage is unaffected.

#### Fight Selection

```typescript
selectedFightIndex?: number | null;
setSelectedFightIndex?: (index: number | null) => void;
```

When provided, clicking a chart dot selects that fight (highlighted with a ring/glow). Clicking the same dot again deselects. The main chart's `<Line>` dots get a custom renderer that shows selection state — larger dot with amber stroke when selected, default style otherwise. The `<LineChart>` gets an `onClick` handler that toggles selection.

#### Header Extras

```typescript
headerExtras?: ReactNode;
```

Additional content rendered in the header bar, between the mode pill toggles and the expand button. SpikeDamage uses this for the Peak/All Damage toggle and Damage/Down Contrib toggle.

#### Drilldown Area

```typescript
drilldownTitle?: string;
renderDrilldown?: () => ReactNode;
```

When a fight is selected (`selectedFightIndex !== null`) and `renderDrilldown` is provided, a drilldown area appears below the main chart. FightMetricSection renders:
- A header bar with `drilldownTitle` on the left and a "Clear" button on the right (calls `setSelectedFightIndex(null)`)
- The result of `renderDrilldown()` inside a container

The drilldown area animates in using CSS transitions (`max-height` + `opacity`, ~300ms ease-out). When no fight is selected, `max-height: 0; opacity: 0; overflow: hidden`. When selected, `max-height: 600px; opacity: 1`.

#### Summary Row Override

```typescript
renderSummary?: () => ReactNode;
```

When provided, replaces the default summary row (Peak / Avg per fight). SpikeDamage uses this for its 3-column grid showing Selected Player, Peak Value, and Peak Skill/Fight with timestamp.

When not provided, the existing default summary row renders (peak value, peak fight label, average per fight).

#### Footer Content

```typescript
renderFooter?: () => ReactNode;
```

When a fight is selected and `renderFooter` is provided, content is rendered below the drilldown. SpikeDamage uses this for the skill breakdown table.

### SpikeDamageSection Conversion

SpikeDamageSection.tsx is rewritten to be a wrapper around FightMetricSection.

#### Data Mapping (in StatsView.tsx memos)

The existing `SpikeDamagePlayer` and `SpikeDamageFightPoint` types remain unchanged in the computation layer. StatsView.tsx memos map them to `FightMetricPlayer` and `FightMetricPoint`:

- `SpikeDamagePlayer.peakHit/peak1s/peak5s/peak30s` → `FightMetricPlayer.value` (based on active spikeMode and damageBasis)
- `SpikeDamageFightPoint.damage` → `FightMetricPoint.value`
- `SpikeDamageFightPoint.maxDamage` → `FightMetricPoint.maxValue`

The `groupedSpikePlayers` memo is updated to produce `Array<{ profession: string; players: FightMetricPlayer[] }>` instead of the current SpikeDamagePlayer-based shape.

#### Component Structure

```tsx
// SpikeDamageSection.tsx (~100-150 lines)
export const SpikeDamageSection = (props) => {
    // Local state for drilldown markers (hoveredMarkerKey, hoveredMarkerInfo)
    // Local derived values (drilldownSeries with marker enrichment)

    return (
        <FightMetricSection
            sectionId={sectionId}
            title={title}
            titleIcon={Zap}
            titleIconClassName="text-rose-300"
            modes={modes}  // hit/1s/5s/30s (conditionally shown)
            activeMode={spikeMode}
            setActiveMode={setSpikeMode}
            // ... standard player/chart props mapped to FightMetric types ...

            selectedFightIndex={selectedSpikeFightIndex}
            setSelectedFightIndex={setSelectedSpikeFightIndex}

            headerExtras={<>
                {/* Peak vs All Damage toggle */}
                {/* Damage vs Down Contrib toggle */}
            </>}

            renderSummary={() => (
                // 3-column grid: Selected Player, Peak Value, Peak Skill/Fight
            )}

            drilldownTitle={spikeDrilldownTitle}
            renderDrilldown={() => (
                // LineChart with 5s buckets + down/death marker overlays
                // Marker hover tooltip
            )}

            renderFooter={() => (
                // Skill breakdown table (3-col grid: skill, damage, hits)
            )}
        />
    );
};
```

#### Extracted: SpikeDrilldownChart

The drilldown chart with its marker dot rendering, hover state, and tooltip is extracted into its own component or kept inline in the render prop. Since it manages local state (`hoveredMarkerKey`, `hoveredMarkerInfo`), it either:
- Lives as a nested component inside SpikeDamageSection (simpler, avoids prop drilling)
- Or the local state stays in SpikeDamageSection and is passed to the render prop closure

The marker dot factory (`makeMarkerDot`) and drilldown series enrichment (`drilldownSeries`) stay in SpikeDamageSection since they're spike-specific logic.

### Player List Sort Order

The existing SpikeDamageSection sorts players in a flat list (not grouped by profession). The FightMetricSection groups by profession. For SpikeDamage, the existing StatsView.tsx memo already produces `groupedSpikePlayers` — we keep that grouping but update the sort to match the strip spikes pattern (groups sorted by total value descending instead of alphabetically).

### What Stays the Same

- `computeSpikeDamageData.ts` — unchanged
- `computeStatsAggregation.ts` — unchanged (still returns `spikeDamage`)
- StatsView.tsx spike damage state variables — unchanged
- The StatsView.tsx memos that produce `spikeChartData`, `spikeDrilldown`, `spikeFightSkillRows` — refactored to output FightMetricSection-compatible types
- TOC entry for `spike-damage` — unchanged

### What Changes

- `FightMetricSection.tsx` — extended with 6 new optional props
- `SpikeDamageSection.tsx` — rewritten from ~637 lines to ~100-150 lines as a FightMetricSection wrapper
- `StatsView.tsx` — spike damage memos updated to produce `FightMetricPlayer[]` and `FightMetricPoint[]`; render call updated to pass new props

## Out of Scope

- Converting BoonTimelineSection, BoonUptimeSection, or SkillUsageSection (separate sub-projects)
- Adding new features to SpikeDamage beyond what it currently has
- Changing `computeSpikeDamageData.ts` or the spike damage data pipeline
