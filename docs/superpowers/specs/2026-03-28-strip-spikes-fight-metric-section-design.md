# Strip Spikes via FightMetricSection

**Date:** 2026-03-28
**Origin:** Discord thread "add strips?" (thread 1487256366149140650)
**Status:** Design

## Summary

Add a "Strip Spikes" section to the stats dashboard showing per-player boon strip performance across fights. Build this on a new generic `FightMetricSection` component that handles the common "player list + per-fight trend chart" layout pattern, reusable for future metrics.

## Motivation

Users want to see boon strip contribution visualized the same way spike damage is — a ranked player list alongside a per-fight trend chart. The EI JSON only provides aggregate strip data per fight (`support[0].boonStrips`, `boonStripsTime`, `boonStripDownContribution`), so intra-fight time-series drilldowns are not possible. The cross-fight trend view is the right fit for this data.

## Data Investigation

The EI JSON was investigated for per-second strip data:
- **No `boonStrip1S` field exists** — unlike damage which has `damage1S`, strips have no time-series equivalent.
- **Target `buffs[].statesPerSource`** — tracks conditions applied TO enemies (not boons stripped FROM them). Some targets have rich data, many have empty arrays.
- **Target `boonsStates`** — mostly empty `[0, 0]` entries for WvW targets.
- **`support[0].boonStrips`** — aggregate count per fight, per player. This is the reliable data source.

Conclusion: per-fight aggregates are the only viable data source. The design uses these aggregates for a cross-fight trend chart.

## Design

### New File: `src/renderer/stats/sections/FightMetricSection.tsx`

A generic section component for displaying any per-player, per-fight metric.

#### Props

```typescript
type FightMetricPlayer = {
    key: string;
    account: string;
    displayName: string;
    characterName: string;
    profession: string;
    professionList: string[];
    logs: number;
    value: number;            // metric value for active mode
    peakFightLabel: string;
};

type FightMetricPoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    value: number;
    maxValue: number;
};

type FightMetricSectionProps = {
    sectionId: string;
    title: string;
    titleIcon?: StatsTocIcon;
    titleIconClassName?: string;
    listTitle?: string;
    searchPlaceholder?: string;

    // Mode toggles
    modes: Array<{ id: string; label: string }>;
    activeMode: string;
    setActiveMode: (value: string) => void;

    // Player list
    playerFilter: string;
    setPlayerFilter: (value: string) => void;
    groupedPlayers: Array<{ profession: string; players: FightMetricPlayer[] }>;
    selectedPlayerKey: string | null;
    setSelectedPlayerKey: (value: string | null) => void;
    selectedPlayer: FightMetricPlayer | null;

    // Chart
    chartData: FightMetricPoint[];
    chartMaxY: number;

    // Formatting
    formatValue: (n: number) => string;
    valueSuffix?: string;

    // Optional drilldown
    selectedFightIndex?: number | null;
    setSelectedFightIndex?: (value: number | null) => void;
    drilldownTitle?: string;
    drilldownData?: Array<{ label: string; value: number }>;
};
```

#### Rendering

Same layout as SpikeDamageSection:
- **Header:** Title with icon, mode pill toggles, expand button
- **Left panel:** Searchable player list grouped by profession, sorted by active mode's value descending. Profession icon + display name + value.
- **Right panel:** Recharts `LineChart` showing per-fight values for the selected player (solid line) and fight max (dashed reference line). Interactive dots for fight selection.
- **Summary row:** Selected player's peak value, which fight it occurred in, and average per fight.
- **Expanded view:** Full-screen version via the existing `expandedSection` mechanism in `useStatsSharedContext`.
- **Drilldown:** Only rendered when `drilldownData` is provided and a fight is selected. For strip spikes, no drilldown is provided (no intra-fight data).

### New File: `src/renderer/stats/computeStripSpikesData.ts`

Extracts per-player, per-fight strip metrics from EI JSON.

#### Input

```typescript
function computeStripSpikesData(validLogs: any[], splitPlayersByClass?: boolean)
```

#### Output

```typescript
{
    fights: Array<{
        id: string;
        shortLabel: string;
        fullLabel: string;
        timestamp: number;
        values: Record<string, {
            strips: number;
            stripTime: number;
            stripDownContrib: number;
        }>;
        maxStrips: number;
        maxStripTime: number;
        maxStripDownContrib: number;
    }>;
    players: Array<{
        key: string;
        account: string;
        displayName: string;
        characterName: string;
        profession: string;
        professionList: string[];
        logs: number;
        totalStrips: number;
        totalStripTime: number;
        totalStripDownContrib: number;
        peakStrips: number;
        peakStripTime: number;
        peakStripDownContrib: number;
        peakFightLabel: string;
    }>;
}
```

#### Logic

1. Iterate `validLogs`. For each log, extract fight metadata (id, label, timestamp) using the same pattern as `computeSpikeDamageData`.
2. For each player in the log, read `player.support[0].boonStrips`, `player.support[0].boonStripsTime`, `player.support[0].boonStripDownContribution`.
3. Key players by account (or `account::profession` when `splitPlayersByClass` is true), same logic as spike damage.
4. Track per-fight max values across all players.
5. Aggregate per-player totals and peaks across all fights.

### Integration: `src/renderer/stats/computeStatsAggregation.ts`

- Import `computeStripSpikesData`.
- Call it alongside `computeSpikeDamageData`: `const stripSpikes = computeStripSpikesData(validLogs, splitPlayersByClass);`
- Include `stripSpikes` in the returned stats object.

### Integration: `src/renderer/StatsView.tsx`

#### State

```typescript
const [stripPlayerFilter, setStripPlayerFilter] = useState('');
const [selectedStripPlayerKey, setSelectedStripPlayerKey] = useState<string | null>(null);
const [selectedStripFightIndex, setSelectedStripFightIndex] = useState<number | null>(null);
const [stripMode, setStripMode] = useState<string>('strips');
```

#### Derived State (useMemo)

- `groupedStripPlayers` — filter by `stripPlayerFilter`, group by profession, sort by active mode value descending. Map strip data players to `FightMetricPlayer` shape.
- `selectedStripPlayer` — resolve from key.
- `stripChartData` — map strip fights to `FightMetricPoint[]` for the selected player and active mode.
- `stripChartMaxY` — max of player peak and fight max across chart data.

#### Render

```tsx
<FightMetricSection
    sectionId="strip-spikes"
    title="Strip Spikes"
    titleIcon={Eraser}
    titleIconClassName="text-amber-300"
    modes={[
        { id: 'strips', label: 'Strips' },
        { id: 'stripTime', label: 'Strip Time' },
        { id: 'stripDownContrib', label: 'Down Contrib' },
    ]}
    activeMode={stripMode}
    setActiveMode={setStripMode}
    playerFilter={stripPlayerFilter}
    setPlayerFilter={setStripPlayerFilter}
    groupedPlayers={groupedStripPlayers}
    selectedPlayerKey={selectedStripPlayerKey}
    setSelectedPlayerKey={setSelectedStripPlayerKey}
    selectedPlayer={selectedStripPlayer}
    chartData={stripChartData}
    chartMaxY={stripChartMaxY}
    formatValue={stripMode === 'stripTime' ? formatTime : formatWithCommas}
    valueSuffix={stripMode === 'strips' ? 'strips' : stripMode === 'stripTime' ? 's' : ''}
/>
```

### Stats Navigation (TOC)

Add a "Strip Spikes" entry to the stats table of contents, placed near the existing support/spike damage sections. Uses the same TOC registration pattern as other sections.

## Out of Scope

- **Intra-fight drilldown:** No per-second strip data exists in the EI JSON. If EI adds `boonStrip1S` in the future, a drilldown can be added.
- **Refactoring SpikeDamageSection to use FightMetricSection:** SpikeDamageSection has complex features (mode toggles for hit/1s/5s/30s, damage basis, skill rows, down/death markers) that don't generalize cleanly. It stays as-is.
- **Per-target strip breakdown:** While target buff data exists in the EI JSON, deriving which strips came from which player against which target is not reliably supported.
