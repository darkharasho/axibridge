# Boon Uptime Incoming Damage Heatmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an incoming damage heatmap overlay to the Boon Uptime drilldown chart, mirroring the existing Boon Timeline implementation.

**Architecture:** The existing `squadIncomingDamageBucketsByFightId`, `fallbackIncomingDamageBucketsByFightId`, and `squadIncomingDamageTotalByFightId` maps in StatsView.tsx already compute per-fight incoming damage in 5-second buckets. We augment the `boonUptimeDrilldown` useMemo to attach `incomingDamage` and `incomingIntensity` to each bucket, add a toggle state, and update BoonUptimeSection to render a ComposedChart with a conditional Bar heatmap layer.

**Tech Stack:** React, Recharts (ComposedChart, Bar, Cell), TypeScript

---

### Task 1: Augment boonUptimeDrilldown with incoming damage data

**Files:**
- Modify: `src/renderer/StatsView.tsx:3519-3557` (the `boonUptimeDrilldown` useMemo)

- [ ] **Step 1: Add state variable for the heatmap toggle**

In `src/renderer/StatsView.tsx`, after line 782 (`const [showBoonTimelineIncomingHeatmap, setShowBoonTimelineIncomingHeatmap] = useState(false);`), add:

```typescript
const [showBoonUptimeIncomingHeatmap, setShowBoonUptimeIncomingHeatmap] = useState(false);
```

- [ ] **Step 2: Widen the boonUptimeDrilldown return type and add incoming damage logic**

Replace the `boonUptimeDrilldown` useMemo (lines 3519-3557) with this version that adds incoming damage fields. The only changes from the original are: (a) the empty-state type gains `incomingDamage` and `incomingIntensity`, (b) incoming damage bucket lookup/scaling logic is appended after the `data` array is built, and (c) the dependency array gains the three incoming damage maps.

Replace:
```typescript
    const boonUptimeDrilldown = useMemo(() => {
        const selectedPoint = selectedBoonUptimeFightIndex === null
            ? null
            : boonUptimeChartData.find((entry) => entry.index === selectedBoonUptimeFightIndex) || null;
        if (!selectedPoint || !activeBoonUptime || !selectedBoonUptimePlayerKey) {
            return {
                title: 'Fight Breakdown',
                data: [] as Array<{ label: string; value: number; maxValue: number }>
            };
        }
        const selectedFight = boonUptimeFightsWithSubgroups?.[selectedPoint.index];
        if (!selectedFight) {
            return {
                title: 'Fight Breakdown',
                data: [] as Array<{ label: string; value: number; maxValue: number }>
            };
        }
        const selectedValue = selectedFight?.values?.[selectedBoonUptimePlayerKey];
        const selectedBuckets = Array.isArray(selectedValue?.buckets5s) ? selectedValue.buckets5s : [];
        const bucketCount = Math.max(
            selectedBuckets.length,
            Math.ceil(Math.max(0, Number(selectedFight?.durationMs || 0)) / 5000),
            1
        );
        const data = Array.from({ length: bucketCount }, (_, index) => {
            const maxValue = Object.entries((selectedFight?.values && typeof selectedFight.values === 'object') ? selectedFight.values : {})
                .filter(([key]) => String(key || '') !== '__all__')
                .reduce((best: number, [, value]: [string, any]) => Math.max(best, Math.max(0, Number(value?.buckets5s?.[index] || 0))), 0);
            return {
                label: `${index * 5}s-${(index + 1) * 5}s`,
                value: Math.max(0, Number(selectedBuckets[index] || 0)),
                maxValue
            };
        });
        return {
            title: `Fight Breakdown - ${selectedPoint.shortLabel || 'Fight'} (5s Stack Buckets)`,
            data
        };
    }, [selectedBoonUptimeFightIndex, boonUptimeChartData, boonUptimeFightsWithSubgroups, selectedBoonUptimePlayerKey]);
```

With:
```typescript
    const boonUptimeDrilldown = useMemo(() => {
        const selectedPoint = selectedBoonUptimeFightIndex === null
            ? null
            : boonUptimeChartData.find((entry) => entry.index === selectedBoonUptimeFightIndex) || null;
        if (!selectedPoint || !activeBoonUptime || !selectedBoonUptimePlayerKey) {
            return {
                title: 'Fight Breakdown',
                data: [] as Array<{ label: string; value: number; maxValue: number; incomingDamage: number; incomingIntensity: number }>
            };
        }
        const selectedFight = boonUptimeFightsWithSubgroups?.[selectedPoint.index];
        if (!selectedFight) {
            return {
                title: 'Fight Breakdown',
                data: [] as Array<{ label: string; value: number; maxValue: number; incomingDamage: number; incomingIntensity: number }>
            };
        }
        const selectedValue = selectedFight?.values?.[selectedBoonUptimePlayerKey];
        const selectedBuckets = Array.isArray(selectedValue?.buckets5s) ? selectedValue.buckets5s : [];
        const bucketCount = Math.max(
            selectedBuckets.length,
            Math.ceil(Math.max(0, Number(selectedFight?.durationMs || 0)) / 5000),
            1
        );
        const data = Array.from({ length: bucketCount }, (_, index) => {
            const maxValue = Object.entries((selectedFight?.values && typeof selectedFight.values === 'object') ? selectedFight.values : {})
                .filter(([key]) => String(key || '') !== '__all__')
                .reduce((best: number, [, value]: [string, any]) => Math.max(best, Math.max(0, Number(value?.buckets5s?.[index] || 0))), 0);
            return {
                label: `${index * 5}s-${(index + 1) * 5}s`,
                value: Math.max(0, Number(selectedBuckets[index] || 0)),
                maxValue
            };
        });
        const primaryIncomingByFightId = squadIncomingDamageBucketsByFightId.get(String(selectedFight?.id || ''))
            || squadIncomingDamageBucketsByFightId.get(String(selectedPoint?.fightId || ''))
            || [];
        const fallbackIncomingByFightId = fallbackIncomingDamageBucketsByFightId.get(String(selectedFight?.id || ''))
            || fallbackIncomingDamageBucketsByFightId.get(String(selectedPoint?.fightId || ''))
            || [];
        const primaryIncomingTotal = primaryIncomingByFightId.reduce((sum, value) => sum + Number(value || 0), 0);
        const fallbackIncomingTotal = fallbackIncomingByFightId.reduce((sum, value) => sum + Number(value || 0), 0);
        const incomingShape = primaryIncomingTotal > 0 ? primaryIncomingByFightId : fallbackIncomingByFightId;
        const incomingShapeTotal = primaryIncomingTotal > 0 ? primaryIncomingTotal : fallbackIncomingTotal;
        const incomingTotal = Math.max(
            0,
            Number(squadIncomingDamageTotalByFightId.get(String(selectedFight?.id || ''))
                ?? squadIncomingDamageTotalByFightId.get(String(selectedPoint?.fightId || ''))
                ?? 0)
        );
        let incomingBuckets = Array.from({ length: bucketCount }, (_, index) => Number(incomingShape[index] || 0));
        if (incomingTotal > 0 && incomingShapeTotal > 0) {
            const scale = incomingTotal / incomingShapeTotal;
            incomingBuckets = incomingBuckets.map((value) => Number(value || 0) * scale);
        }
        const incomingMax = incomingBuckets.reduce((best, value) => Math.max(best, Number(value || 0)), 0);
        const dataWithIncoming = data.map((entry, index) => {
            const incomingDamage = Number(incomingBuckets[index] || 0);
            return {
                ...entry,
                incomingDamage,
                incomingIntensity: incomingMax > 0 ? Math.max(0, Math.min(1, incomingDamage / incomingMax)) : 0
            };
        });
        return {
            title: `Fight Breakdown - ${selectedPoint.shortLabel || 'Fight'} (5s Stack Buckets)`,
            data: dataWithIncoming
        };
    }, [selectedBoonUptimeFightIndex, boonUptimeChartData, boonUptimeFightsWithSubgroups, selectedBoonUptimePlayerKey, squadIncomingDamageBucketsByFightId, fallbackIncomingDamageBucketsByFightId, squadIncomingDamageTotalByFightId]);
```

- [ ] **Step 3: Pass heatmap props to BoonUptimeSection (classic layout)**

In `src/renderer/StatsView.tsx`, find the first BoonUptimeSection render site (around line 4030-4051). After the `subgroupMembers` prop, add:

```tsx
                                showIncomingHeatmap={showBoonUptimeIncomingHeatmap}
                                setShowIncomingHeatmap={setShowBoonUptimeIncomingHeatmap}
```

- [ ] **Step 4: Pass heatmap props to BoonUptimeSection (modern layout)**

In `src/renderer/StatsView.tsx`, find the second BoonUptimeSection render site (around line 4607-4628). After the `subgroupMembers` prop, add the same two props:

```tsx
                                showIncomingHeatmap={showBoonUptimeIncomingHeatmap}
                                setShowIncomingHeatmap={setShowBoonUptimeIncomingHeatmap}
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: Type errors in BoonUptimeSection because it doesn't accept the new props yet. StatsView.tsx itself should have no other new errors.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/StatsView.tsx
git commit -m "feat: augment boon uptime drilldown with incoming damage data and heatmap state"
```

---

### Task 2: Update BoonUptimeSection to render the heatmap

**Files:**
- Modify: `src/renderer/stats/sections/BoonUptimeSection.tsx`

- [ ] **Step 1: Update imports**

In `src/renderer/stats/sections/BoonUptimeSection.tsx`, replace the recharts import on line 3:

Replace:
```typescript
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
```

With:
```typescript
import { Bar, CartesianGrid, Cell, ComposedChart, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
```

- [ ] **Step 2: Update props type**

In the `BoonUptimeSectionProps` type, widen the `drilldownData` type and add the two new props. Replace lines 64-68:

Replace:
```typescript
    drilldownData: Array<{ label: string; value: number; maxValue?: number }>;
    overallUptimePercent: number | null;
    showStackCapLine?: boolean;
    subgroupMembers?: Map<number, Array<{ account: string; profession: string; professionList: string[]; fightCount: number }>>;
};
```

With:
```typescript
    drilldownData: Array<{ label: string; value: number; maxValue?: number; incomingDamage?: number; incomingIntensity?: number }>;
    overallUptimePercent: number | null;
    showStackCapLine?: boolean;
    subgroupMembers?: Map<number, Array<{ account: string; profession: string; professionList: string[]; fightCount: number }>>;
    showIncomingHeatmap: boolean;
    setShowIncomingHeatmap: (value: boolean) => void;
};
```

- [ ] **Step 3: Destructure the new props**

Find the component destructure. It currently ends with `subgroupMembers` (look for the destructure block that matches BoonUptimeSectionProps). Add the two new props to the destructure. The destructure currently ends around:

```typescript
    subgroupMembers
}: BoonUptimeSectionProps) => {
```

Replace with:
```typescript
    subgroupMembers,
    showIncomingHeatmap,
    setShowIncomingHeatmap
}: BoonUptimeSectionProps) => {
```

- [ ] **Step 4: Add computed values for heatmap data**

After the existing `const infoFight = selectedFight || topFight;` line, add:

```typescript
    const hasIncomingHeatData = drilldownData.some((entry) => Number(entry?.incomingDamage || 0) > 0);
    const drilldownHeatData = drilldownData.map((entry) => ({
        ...entry,
        incomingHeatBand: 1
    }));
```

- [ ] **Step 5: Update drilldown header to add the toggle button**

Replace the drilldown header (the `div` with `flex items-center justify-between mb-2`):

Replace:
```tsx
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">{drilldownTitle}</div>
                        <button
                            type="button"
                            onClick={() => setSelectedFightIndex(null)}
                            className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                        >
                            Clear
                        </button>
                    </div>
```

With:
```tsx
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] uppercase tracking-[0.35em] text-[color:var(--text-secondary)]">{drilldownTitle}</div>
                        <div className="flex items-center gap-3">
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
                            <button
                                type="button"
                                onClick={() => setSelectedFightIndex(null)}
                                className="text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
```

- [ ] **Step 6: Replace drilldown LineChart with ComposedChart and add heatmap Bar**

Replace the drilldown chart block (from `<ChartContainer>` to `</ChartContainer>` inside the drilldown panel):

Replace:
```tsx
                            <ChartContainer width="100%" height="100%">
                                <LineChart data={drilldownData}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                    <XAxis dataKey="label" tick={{ fill: '#e2e8f0', fontSize: 10 }} />
                                    <YAxis tick={{ fill: '#e2e8f0', fontSize: 10 }} domain={[0, drilldownChartMaxY]} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                        formatter={(value: any, name: any) => [formatWithCommas(Number(value || 0), 0), String(name || '')]}
                                        labelFormatter={(value: any) => String(value || '')}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        name="Selected"
                                        stroke={selectedLineColor}
                                        strokeWidth={2.5}
                                        dot={{ r: 2 }}
                                        activeDot={{ r: 4 }}
                                    />
                                    {showStackCapLine && (
                                        <ReferenceLine
                                            y={25}
                                            stroke="rgba(251,191,36,0.9)"
                                            strokeDasharray="6 4"
                                            ifOverflow="extendDomain"
                                            label={{ value: '25', position: 'right', fill: '#fbbf24', fontSize: 10 }}
                                        />
                                    )}
                                </LineChart>
                            </ChartContainer>
```

With:
```tsx
                            <ChartContainer width="100%" height="100%">
                                <ComposedChart data={drilldownHeatData}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                    <XAxis dataKey="label" tick={{ fill: '#e2e8f0', fontSize: 10 }} />
                                    <YAxis tick={{ fill: '#e2e8f0', fontSize: 10 }} domain={[0, drilldownChartMaxY]} />
                                    <YAxis yAxisId="incomingHeat" hide domain={[0, 1]} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#161c24', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '0.5rem' }}
                                        formatter={(value: any, name: any, item: any) => {
                                            const point = item?.payload || {};
                                            if (String(name || '') === 'Incoming Damage Heat') {
                                                return [formatWithCommas(Number(point?.incomingDamage || 0), 0), 'Squad Incoming Damage'];
                                            }
                                            return [formatWithCommas(Number(value || 0), 0), String(name || '')];
                                        }}
                                        labelFormatter={(value: any) => String(value || '')}
                                    />
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
                                    <Line
                                        type="monotone"
                                        dataKey="value"
                                        name="Selected"
                                        stroke={selectedLineColor}
                                        strokeWidth={2.5}
                                        dot={{ r: 2 }}
                                        activeDot={{ r: 4 }}
                                    />
                                    {showStackCapLine && (
                                        <ReferenceLine
                                            y={25}
                                            stroke="rgba(251,191,36,0.9)"
                                            strokeDasharray="6 4"
                                            ifOverflow="extendDomain"
                                            label={{ value: '25', position: 'right', fill: '#fbbf24', fontSize: 10 }}
                                        />
                                    )}
                                </ComposedChart>
                            </ChartContainer>
```

- [ ] **Step 7: Run typecheck and lint**

Run: `npm run validate`
Expected: PASS — no type errors, no lint warnings.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/stats/sections/BoonUptimeSection.tsx
git commit -m "feat: add incoming damage heatmap overlay to boon uptime drilldown"
```

---

### Task 3: Manual verification

- [ ] **Step 1: Start dev environment**

Run: `npm run dev`

- [ ] **Step 2: Verify Boon Uptime heatmap**

1. Load a dataset with multiple fights
2. Navigate to the Boon Uptime section
3. Select a boon (e.g., Might) and a player/subgroup
4. Click a fight dot to open the drilldown
5. Verify the "Squad Damage Heatmap" toggle button appears between the title and "Clear"
6. Click the toggle — verify red bars appear behind the stack line with varying intensity
7. Hover a bar — verify tooltip shows "Squad Incoming Damage" with a formatted number
8. Toggle off — verify bars disappear
9. With a stacking boon selected, verify the stack cap reference line (yellow dashed at 25) still renders correctly alongside the heatmap

- [ ] **Step 3: Verify Boon Timeline heatmap still works**

1. Navigate to the Boon Timeline section
2. Select a boon and player, click a fight
3. Toggle the "Squad Damage Heatmap" — verify it still works independently
4. Verify toggling one section's heatmap does not affect the other

- [ ] **Step 4: Verify expanded/fullscreen mode**

1. In the modern layout, expand the Boon Uptime section to fullscreen
2. Repeat the drilldown + heatmap toggle test
3. Verify the toggle and bars render correctly in the expanded view
