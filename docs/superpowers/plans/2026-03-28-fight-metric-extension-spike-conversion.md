# FightMetricSection Extension + SpikeDamage Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend FightMetricSection with optional extension points (fight selection, drilldown, header extras, summary override, footer) and convert SpikeDamageSection to use it, eliminating ~500 lines of duplicated layout code.

**Architecture:** FightMetricSection gains 6 optional props for fight selection, header extras, drilldown, summary override, and footer. SpikeDamageSection is rewritten as a thin wrapper (~150 lines) that passes its specialized content (drilldown chart with markers, skill table, extra toggles) through these extension points. StatsView.tsx spike damage memos are updated to produce FightMetricPlayer/FightMetricPoint types. All 4 render sites (2 layouts x outgoing spike + incoming strike) are updated.

**Tech Stack:** React, Recharts, TypeScript, Lucide icons

---

### Task 1: Extend FightMetricSection with optional props

**Files:**
- Modify: `src/renderer/stats/sections/FightMetricSection.tsx`

- [ ] **Step 1: Add ReactNode import and new props to the type**

In `src/renderer/stats/sections/FightMetricSection.tsx`, add `ReactNode` to the React import and add the new optional props to `FightMetricSectionProps`:

At line 1, change:
```typescript
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
```
To:
```typescript
import { type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
```

In the `FightMetricSectionProps` type (after `valueSuffix?: string;`), add:

```typescript
    // Fight selection
    selectedFightIndex?: number | null;
    setSelectedFightIndex?: (index: number | null) => void;

    // Header extras (rendered between mode toggles and expand button)
    headerExtras?: ReactNode;

    // Drilldown (shown when fight is selected and renderDrilldown is provided)
    drilldownTitle?: string;
    renderDrilldown?: () => ReactNode;

    // Summary row override (replaces default Peak/Avg row)
    renderSummary?: () => ReactNode;

    // Footer (shown when fight is selected and renderFooter is provided)
    renderFooter?: () => ReactNode;
```

- [ ] **Step 2: Destructure new props in the component**

In the component destructuring (after `valueSuffix = '',`), add:

```typescript
    selectedFightIndex = null,
    setSelectedFightIndex,
    headerExtras,
    drilldownTitle = 'Fight Breakdown',
    renderDrilldown,
    renderSummary,
    renderFooter,
```

- [ ] **Step 3: Add fight selection to the main chart**

Replace the `<LineChart data={chartData}>` opening tag with:

```typescript
<LineChart
    data={chartData}
    onClick={setSelectedFightIndex ? (state: any) => {
        const idx = Number(state?.activeTooltipIndex);
        if (!Number.isFinite(idx)) return;
        setSelectedFightIndex(selectedFightIndex === idx ? null : idx);
    } : undefined}
    style={setSelectedFightIndex ? { cursor: 'pointer' } : undefined}
>
```

Replace the value `<Line>` (the one with `dataKey="value"`) with:

```typescript
<Line
    dataKey="value"
    name={selectedPlayer?.displayName || 'Player'}
    stroke={playerColor}
    strokeWidth={2.5}
    dot={setSelectedFightIndex ? (props: any) => {
        const idx = Number(props?.payload?.index);
        if (!Number.isFinite(idx)) return null;
        const isSelectedFight = selectedFightIndex === idx;
        return (
            <g style={{ cursor: 'pointer', pointerEvents: 'all' }}
                onClick={(e) => { e.stopPropagation(); setSelectedFightIndex!(isSelectedFight ? null : idx); }}>
                <circle cx={props.cx} cy={props.cy} r={10} fill="transparent" style={{ pointerEvents: 'all' }} />
                <circle cx={props.cx} cy={props.cy} r={isSelectedFight ? 5 : 3}
                    fill={playerColor}
                    stroke={isSelectedFight ? 'rgba(251,191,36,0.95)' : playerColor}
                    strokeWidth={isSelectedFight ? 2.5 : 1} />
            </g>
        );
    } : { r: 3, fill: playerColor, stroke: playerColor }}
    activeDot={{ r: 5, fill: playerColor, stroke: '#fff', strokeWidth: 2 }}
    isAnimationActive
    animationDuration={800}
    animationEasing="ease-out"
/>
```

- [ ] **Step 4: Add headerExtras to the header**

In the header `<div>` (the one containing the mode toggles and expand button), add `{headerExtras}` between the mode toggle and the expand button:

Find:
```typescript
                    {modes.length > 1 && (
                        <PillToggleGroup
```

The header extras should be inserted after the PillToggleGroup closing `)}` and before the expand button. Add:

```typescript
                    {headerExtras}
```

- [ ] **Step 5: Add renderSummary support**

Replace the existing summary row block (the `<div className="flex items-center gap-3 px-4 py-2 ...">` block) with:

```typescript
{/* Summary row */}
{renderSummary ? renderSummary() : (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-white/5 text-xs text-slate-400">
        {renderProfessionIcon(selectedPlayer.profession, selectedPlayer.professionList, 'w-4 h-4')}
        <span className="text-slate-200 font-medium">{selectedPlayer.displayName}</span>
        <span className="text-slate-500">|</span>
        <span>Peak: <strong className="text-indigo-300">{formatValue(selectedPlayer.value)}</strong>{valueSuffix ? ` ${valueSuffix}` : ''}</span>
        {selectedPlayer.peakFightLabel && (
            <span className="text-slate-500">in {sanitizeWvwLabel(selectedPlayer.peakFightLabel)}</span>
        )}
        <span className="text-slate-500">|</span>
        <span>Avg: <strong className="text-slate-200">{formatWithCommas(avgValue, 1)}</strong> per fight</span>
    </div>
)}
```

- [ ] **Step 6: Add drilldown and footer areas after the body**

After the body `</div>` (the one with the `flex` layout containing player list and chart area) and before the closing `</div>` of `renderContent`, add:

```typescript
            {/* ── Drilldown ──────────────────────────────────── */}
            <div
                className="transition-all duration-300 ease-out overflow-hidden"
                style={{
                    maxHeight: selectedFightIndex !== null && renderDrilldown ? 600 : 0,
                    opacity: selectedFightIndex !== null && renderDrilldown ? 1 : 0,
                }}
            >
                {selectedFightIndex !== null && renderDrilldown && (
                    <div className="px-4 py-3 border-t border-white/5">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500">{drilldownTitle}</span>
                            <button
                                onClick={() => setSelectedFightIndex?.(null)}
                                className="text-[10px] uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                        {renderDrilldown()}
                    </div>
                )}
            </div>

            {/* ── Footer ─────────────────────────────────────── */}
            {selectedFightIndex !== null && renderFooter && (
                <div className="px-4 py-3 border-t border-white/5">
                    {renderFooter()}
                </div>
            )}
```

- [ ] **Step 7: Verify it compiles**

Run: `npm run typecheck`

Expected: No errors. Existing strip spikes usage doesn't pass any of the new optional props, so nothing breaks.

- [ ] **Step 8: Verify lint passes**

Run: `npm run lint`

Expected: No warnings.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/stats/sections/FightMetricSection.tsx
git commit -m "feat: extend FightMetricSection with fight selection, drilldown, header extras, summary, footer"
```

---

### Task 2: Rewrite SpikeDamageSection as a FightMetricSection wrapper

**Files:**
- Modify: `src/renderer/stats/sections/SpikeDamageSection.tsx`

- [ ] **Step 1: Rewrite the entire file**

Replace the entire contents of `src/renderer/stats/sections/SpikeDamageSection.tsx` with the new wrapper implementation. The new component:
- Keeps the same exported name and props interface (no changes needed in StatsView.tsx render calls yet)
- Delegates layout to FightMetricSection
- Provides spike-specific content through render props

Read the existing file first, then replace it entirely with:

```typescript
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { Zap } from 'lucide-react';
import { getProfessionColor } from '../../../shared/professionUtils';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { useStatsSharedContext } from '../StatsViewContext';
import { FightMetricSection } from './FightMetricSection';
import type { FightMetricPlayer, FightMetricPoint } from './FightMetricSection';
import type { StatsTocIcon } from '../hooks/useStatsNavigation';

type SpikeDamagePlayer = {
    key: string;
    account: string;
    displayName: string;
    characterName: string;
    profession: string;
    professionList: string[];
    logs: number;
    peakHit: number;
    peak1s: number;
    peak5s: number;
    peak30s: number;
    peakHitDown: number;
    peak1sDown: number;
    peak5sDown: number;
    peak30sDown: number;
    totalDamage?: number;
    peakFightLabel: string;
    peakSkillName: string;
};

type SpikeDamageFightPoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    damage: number;
    maxDamage: number;
    skillName: string;
};
type SpikeDrilldownPoint = {
    label: string;
    value: number;
};
type SpikeSkillRow = {
    skillName: string;
    damage: number;
    downContribution?: number;
    hits: number;
    icon?: string;
};

type SpikeDamageSectionProps = {
    sectionId?: string;
    title?: string;
    subtitle?: string;
    listTitle?: string;
    searchPlaceholder?: string;
    titleIcon?: StatsTocIcon;
    titleIconClassName?: string;
    spikePlayerFilter: string;
    setSpikePlayerFilter: (value: string) => void;
    groupedSpikePlayers: Array<{ profession: string; players: SpikeDamagePlayer[] }>;
    spikeMode: 'hit' | '1s' | '5s' | '30s';
    setSpikeMode: (value: 'hit' | '1s' | '5s' | '30s') => void;
    showTotalDamageToggle?: boolean;
    useTotalDamage?: boolean;
    setUseTotalDamage?: (value: boolean) => void;
    damageBasis?: 'all' | 'downContribution';
    setDamageBasis?: (value: 'all' | 'downContribution') => void;
    showDamageBasisToggle?: boolean;
    selectedSpikePlayerKey: string | null;
    setSelectedSpikePlayerKey: (value: string | null) => void;
    selectedSpikePlayer: SpikeDamagePlayer | null;
    spikeChartData: SpikeDamageFightPoint[];
    spikeChartMaxY: number;
    selectedSpikeFightIndex: number | null;
    setSelectedSpikeFightIndex: (value: number | null) => void;
    spikeDrilldownTitle: string;
    spikeDrilldownData: SpikeDrilldownPoint[];
    spikeDrilldownDownIndices: number[];
    spikeDrilldownDeathIndices: number[];
    spikeFightSkillRows?: SpikeSkillRow[];
    spikeFightSkillTitle?: string;
};

export const SpikeDamageSection = ({
    sectionId = 'spike-damage',
    title = 'Spike Damage',
    listTitle = 'Squad Players',
    searchPlaceholder = 'Search player or account',
    titleIcon = Zap,
    titleIconClassName = 'text-rose-300',
    spikePlayerFilter,
    setSpikePlayerFilter,
    groupedSpikePlayers,
    spikeMode,
    setSpikeMode,
    showTotalDamageToggle = false,
    useTotalDamage = false,
    setUseTotalDamage,
    damageBasis = 'all',
    setDamageBasis,
    showDamageBasisToggle = false,
    selectedSpikePlayerKey,
    setSelectedSpikePlayerKey,
    selectedSpikePlayer,
    spikeChartData,
    spikeChartMaxY,
    selectedSpikeFightIndex,
    setSelectedSpikeFightIndex,
    spikeDrilldownTitle,
    spikeDrilldownData,
    spikeDrilldownDownIndices,
    spikeDrilldownDeathIndices,
    spikeFightSkillRows = [],
    spikeFightSkillTitle = 'Skill Damage (Selected Fight)',
}: SpikeDamageSectionProps) => {
    const { formatWithCommas, renderProfessionIcon } = useStatsSharedContext();
    const [hoveredMarkerKey, setHoveredMarkerKey] = useState<string | null>(null);
    const [hoveredMarkerInfo, setHoveredMarkerInfo] = useState<null | {
        x: number; y: number; kind: 'down' | 'death'; label: string;
    }>(null);

    const isDownContributionMode = damageBasis === 'downContribution';

    const peakValueForPlayer = (player: SpikeDamagePlayer) => (
        useTotalDamage
            ? Number(player.totalDamage || 0)
            : spikeMode === 'hit'
                ? (isDownContributionMode ? player.peakHitDown : player.peakHit)
                : spikeMode === '1s'
                    ? (isDownContributionMode ? player.peak1sDown : player.peak1s)
                    : spikeMode === '5s'
                        ? (isDownContributionMode ? player.peak5sDown : player.peak5s)
                        : (isDownContributionMode ? player.peak30sDown : player.peak30s)
    );

    // Map SpikeDamagePlayer[] → FightMetricPlayer[]
    const mappedGroups = groupedSpikePlayers.map((group) => ({
        profession: group.profession,
        players: group.players.map((p): FightMetricPlayer => ({
            key: p.key, account: p.account, displayName: p.displayName,
            characterName: p.characterName, profession: p.profession,
            professionList: p.professionList, logs: p.logs,
            value: peakValueForPlayer(p),
            peakFightLabel: p.peakFightLabel,
        })),
    }));

    // Map SpikeDamageFightPoint[] → FightMetricPoint[]
    const mappedChartData: FightMetricPoint[] = spikeChartData.map((p) => ({
        index: p.index, fightId: p.fightId, shortLabel: p.shortLabel,
        fullLabel: p.fullLabel, timestamp: p.timestamp,
        value: p.damage, maxValue: p.maxDamage,
    }));

    const mappedPlayer: FightMetricPlayer | null = selectedSpikePlayer ? {
        key: selectedSpikePlayer.key, account: selectedSpikePlayer.account,
        displayName: selectedSpikePlayer.displayName,
        characterName: selectedSpikePlayer.characterName,
        profession: selectedSpikePlayer.profession,
        professionList: selectedSpikePlayer.professionList,
        logs: selectedSpikePlayer.logs,
        value: peakValueForPlayer(selectedSpikePlayer),
        peakFightLabel: selectedSpikePlayer.peakFightLabel,
    } : null;

    const selectedLineColor = selectedSpikePlayer
        ? (getProfessionColor(selectedSpikePlayer.profession) || '#fda4af')
        : '#fda4af';

    // Drilldown marker logic
    const drilldownMax = spikeDrilldownData.reduce((max, point) => Math.max(max, Number(point.value || 0)), 0);
    const markerBaseline = Math.max(1, drilldownMax);
    const downIndexSet = new Set(spikeDrilldownDownIndices);
    const deathIndexSet = new Set(spikeDrilldownDeathIndices);
    const drilldownSeries = spikeDrilldownData.map((point, index) => ({
        ...point,
        downMarker: downIndexSet.has(index) ? Math.max(Number(point.value || 0), markerBaseline * 0.88) : null,
        deathMarker: deathIndexSet.has(index) ? Math.max(Number(point.value || 0), markerBaseline * 0.96) : null,
    }));

    const makeMarkerDot = (kind: 'down' | 'death') => (props: any) => {
        const cx = Number(props?.cx);
        const cy = Number(props?.cy);
        const index = Number(props?.index);
        if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(index)) return null;
        const point = props?.payload || {};
        const markerValue = kind === 'down' ? point?.downMarker : point?.deathMarker;
        if (!Number.isFinite(Number(markerValue))) return null;
        const key = `${kind}-${index}`;
        const hovered = hoveredMarkerKey === key;
        const fill = kind === 'down' ? '#facc15' : '#ef4444';
        const glow = kind === 'down' ? '#fde047' : '#f87171';
        return (
            <g style={{ cursor: 'pointer', pointerEvents: 'all' }}
                onMouseEnter={() => { setHoveredMarkerKey(key); setHoveredMarkerInfo({ x: cx, y: cy, kind, label: String(point?.label || '') }); }}
                onMouseLeave={() => { setHoveredMarkerKey((c) => (c === key ? null : c)); setHoveredMarkerInfo((c) => (c?.kind === kind && c?.label === String(point?.label || '') ? null : c)); }}>
                <circle cx={cx} cy={cy} r={hovered ? 10 : 7} fill={glow} opacity={hovered ? 0.35 : 0.18} />
                <circle cx={cx} cy={cy} r={hovered ? 7 : 5.5} fill={fill} stroke="#0f172a" strokeWidth={hovered ? 2.25 : 1.75} />
            </g>
        );
    };

    const modes = useTotalDamage ? [] : [
        { id: 'hit', label: 'Highest Damage' },
        { id: '1s', label: '1s' },
        { id: '5s', label: '5s' },
        { id: '30s', label: '30s' },
    ];

    return (
        <FightMetricSection
            sectionId={sectionId}
            title={title}
            titleIcon={titleIcon}
            titleIconClassName={titleIconClassName}
            listTitle={listTitle}
            searchPlaceholder={searchPlaceholder}
            modes={modes}
            activeMode={spikeMode}
            setActiveMode={(v) => setSpikeMode(v as 'hit' | '1s' | '5s' | '30s')}
            playerFilter={spikePlayerFilter}
            setPlayerFilter={setSpikePlayerFilter}
            groupedPlayers={mappedGroups}
            selectedPlayerKey={selectedSpikePlayerKey}
            setSelectedPlayerKey={setSelectedSpikePlayerKey}
            selectedPlayer={mappedPlayer}
            chartData={mappedChartData}
            chartMaxY={spikeChartMaxY}
            formatValue={(v) => formatWithCommas(v, 0)}
            selectedFightIndex={selectedSpikeFightIndex}
            setSelectedFightIndex={setSelectedSpikeFightIndex}
            headerExtras={<>
                {showTotalDamageToggle && setUseTotalDamage && (
                    <PillToggleGroup
                        value={useTotalDamage ? 'allDamage' : 'peak'}
                        onChange={(value) => setUseTotalDamage(value === 'allDamage')}
                        options={[{ value: 'peak', label: 'Peak' }, { value: 'allDamage', label: 'All Damage' }]}
                        activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                        inactiveClassName="text-[color:var(--text-secondary)]"
                    />
                )}
                {showDamageBasisToggle && setDamageBasis && (
                    <PillToggleGroup
                        value={damageBasis}
                        onChange={(value) => setDamageBasis(value as 'all' | 'downContribution')}
                        options={[{ value: 'all', label: 'Damage' }, { value: 'downContribution', label: 'Down Contrib' }]}
                        activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                        inactiveClassName="text-[color:var(--text-secondary)]"
                    />
                )}
            </>}
            drilldownTitle={spikeDrilldownTitle}
            renderDrilldown={() => (
                <div className="h-[220px] relative">
                    {spikeDrilldownData.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-xs text-slate-500">
                            No detailed data available for this fight.
                        </div>
                    ) : (
                        <>
                            <ChartContainer width="100%" height="100%">
                                <LineChart data={drilldownSeries}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={{ stroke: 'rgba(255,255,255,0.08)' }} tickLine={false}
                                        tickFormatter={(value: number) => formatWithCommas(value, 0)} width={50} />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (!active || !payload?.length) return null;
                                            const d = payload[0]?.payload;
                                            if (!d) return null;
                                            return (
                                                <div className="bg-slate-900/95 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
                                                    <div className="text-slate-200 font-medium mb-1">{d.label}</div>
                                                    <div className="text-indigo-300">Damage: <strong>{formatWithCommas(Number(d.value || 0), 0)}</strong></div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Line type="monotone" dataKey="value" name="Damage" stroke={selectedLineColor} strokeWidth={2.5}
                                        dot={spikeMode === 'hit' ? { r: 2 } : false} activeDot={{ r: 4 }}
                                        isAnimationActive animationDuration={600} animationEasing="ease-out" />
                                    <Line type="linear" dataKey="downMarker" name="Down" stroke="transparent" connectNulls={false}
                                        isAnimationActive={false} activeDot={false} dot={makeMarkerDot('down')} />
                                    <Line type="linear" dataKey="deathMarker" name="Death" stroke="transparent" connectNulls={false}
                                        isAnimationActive={false} activeDot={false} dot={makeMarkerDot('death')} />
                                </LineChart>
                            </ChartContainer>
                            {hoveredMarkerInfo && (
                                <div className="pointer-events-none absolute z-20 rounded-md border border-white/10 bg-slate-900/95 px-2 py-1 text-xs shadow-xl"
                                    style={{ left: `${Math.max(8, hoveredMarkerInfo.x)}px`, top: `${Math.max(8, hoveredMarkerInfo.y - 38)}px`, transform: 'translate(-50%, -100%)' }}>
                                    <div className={`${hoveredMarkerInfo.kind === 'down' ? 'text-yellow-300' : 'text-red-300'} font-semibold`}>
                                        {hoveredMarkerInfo.kind === 'down' ? 'Down' : 'Death'}
                                    </div>
                                    <div className="text-slate-500">{hoveredMarkerInfo.label}</div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
            renderFooter={spikeFightSkillRows.length > 0 ? () => {
                const metricValue = (row: SpikeSkillRow) => isDownContributionMode
                    ? Number(row.downContribution || 0) : Number(row.damage || 0);
                const displayRows = [...spikeFightSkillRows]
                    .filter((row) => metricValue(row) > 0)
                    .sort((a, b) => metricValue(b) - metricValue(a) || Number(b.hits || 0) - Number(a.hits || 0))
                    .slice(0, 30);
                if (displayRows.length === 0) return null;
                return (
                    <>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] uppercase tracking-wider text-slate-500">{spikeFightSkillTitle}</span>
                            <span className="text-[10px] text-slate-500">{displayRows.length} {displayRows.length === 1 ? 'skill' : 'skills'}</span>
                        </div>
                        <div className="rounded-lg overflow-hidden border border-white/5">
                            <div className="grid grid-cols-[2fr_0.8fr_0.8fr] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 border-b border-white/5">
                                <div>Skill</div>
                                <div className="text-right">{isDownContributionMode ? 'Down Contrib' : 'Damage'}</div>
                                <div className="text-right">Hits</div>
                            </div>
                            <div className="max-h-[260px] overflow-y-auto">
                                {displayRows.map((row, idx) => (
                                    <div key={`${row.skillName}-${idx}`}
                                        className="grid grid-cols-[2fr_0.8fr_0.8fr] gap-2 px-3 py-2.5 text-sm text-slate-300 border-b border-white/5 hover:bg-white/[0.03] last:border-b-0">
                                        <div className="min-w-0 flex items-center gap-2">
                                            {row.icon ? (
                                                <img src={row.icon} alt="" loading="lazy"
                                                    className="w-4 h-4 rounded-sm border border-white/10 bg-white/5 flex-shrink-0" />
                                            ) : (
                                                <div className="w-4 h-4 rounded-sm border border-white/10 bg-white/5 flex-shrink-0" />
                                            )}
                                            <div className="truncate" title={row.skillName}>{row.skillName}</div>
                                        </div>
                                        <div className="text-right font-mono text-indigo-300">{formatWithCommas(metricValue(row), 0)}</div>
                                        <div className="text-right font-mono text-slate-500">{formatWithCommas(Number(row.hits || 0), 0)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                );
            } : undefined}
        />
    );
};
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`

Expected: No errors. The props interface is unchanged so all render sites in StatsView.tsx still work.

- [ ] **Step 3: Verify lint passes**

Run: `npm run lint`

Expected: No warnings.

- [ ] **Step 4: Run all unit tests**

Run: `npm run test:unit`

Expected: All tests pass. No regressions.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/sections/SpikeDamageSection.tsx
git commit -m "refactor: rewrite SpikeDamageSection as FightMetricSection wrapper"
```

---

### Task 3: Verify full validation and visual check

**Files:**
- None — verification only

- [ ] **Step 1: Run full validate**

Run: `npm run validate`

Expected: Typecheck and lint both pass.

- [ ] **Step 2: Run all unit tests**

Run: `npm run test:unit`

Expected: All tests pass.

- [ ] **Step 3: Visual verification**

Run: `npm run dev`

Verify in the app:
1. **Outgoing Spike Damage** section renders with the new glass-surface FightMetricSection style
2. Player list shows grouped by profession with values
3. Clicking a player shows the per-fight trend chart with animated lines
4. Mode toggles (Highest Damage / 1s / 5s / 30s) work
5. Damage basis toggle (Damage / Down Contrib) works in the header
6. Clicking a chart dot selects a fight — dot gets amber ring
7. Drilldown chart appears with animation below the main chart
8. Down (yellow) and death (red) markers appear on the drilldown
9. Hovering markers shows tooltip
10. Clear button dismisses the drilldown
11. Skill table appears below drilldown with correct data
12. Expand button works (full-screen mode)
13. **Incoming Strike Damage** section also renders correctly with the same new style
14. Total Damage toggle works on the incoming strike section
15. **Strip Spikes** section is unaffected (still works as before)

- [ ] **Step 4: Commit any visual fixes if needed**

```bash
git add -A
git commit -m "fix: visual adjustments for SpikeDamageSection FightMetricSection conversion"
```

(Skip if no fixes needed.)
