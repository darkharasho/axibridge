# Boon Strip Comparison Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-fight diverging bar chart to the Defense group comparing squad outgoing strips / boon generation (switchable) against incoming strips, all as raw boon counts.

**Architecture:** Add three per-fight totals to `fightBreakdown` in the existing aggregation, then build a new `BoonStripComparisonSection` recharts component (mirroring `SquadDamageComparisonSection`) that reads only `fightBreakdown`, with a pure `buildBoonStripChartData` transform and a `strips | generation` mode toggle. Register the section in the Defense TOC group and both StatsView render paths.

**Tech Stack:** React, TypeScript, recharts, vitest, Tailwind, lucide-react.

## Global Constraints

- Run vitest with limited parallelism: `npx vitest run <path> --maxWorkers=2`.
- All three series are **raw boon counts** — no Disruption-Method weighting, no boon-seconds/uptime.
- Chart reads **only** `stats.fightBreakdown` — not `fightDiffMode` or `boonTimeline`.
- Section ships to both desktop renderer and web report (shared `StatsView` section); register it in **both** StatsView paths (linear render + `renderGroup('defense', [...])`).
- Missing `support` / `defenses` / `squadBuffVolumes` on a player must contribute `0`, never throw.
- Lint runs with `--max-warnings 0`; typecheck must pass (`npm run typecheck`).

---

### Task 1: Per-fight strip & boon-generation totals in `fightBreakdown`

**Files:**
- Modify: `src/renderer/stats/computeFightBreakdown.ts` (add 3 fields in the returned object of `ingestLogFightBreakdown`, near `:134-135`)
- Test: `src/renderer/stats/__tests__/computeFightBreakdown.test.ts`

**Interfaces:**
- Consumes: existing `ingestLogFightBreakdown(log, fightIndex)`.
- Produces: each `fightBreakdown` entry additionally has:
  - `totalOutgoingStrips: number` — Σ `player.support[0].boonStrips` over squad players
  - `totalIncomingStrips: number` — Σ `player.defenses[0].boonStrips` over squad players
  - `totalBoonsGenerated: number` — Σ over squad players of Σ `player.squadBuffVolumes[].buffVolumeData[].outgoing`

- [ ] **Step 1: Write the failing test**

Add to `src/renderer/stats/__tests__/computeFightBreakdown.test.ts`:

```typescript
describe('ingestLogFightBreakdown boon strips & generation', () => {
    const mkBoonLog = () => ({
        filePath: 'f1',
        details: {
            durationMS: 10000,
            players: [
                {
                    notInSquad: false, teamID: 50, dpsAll: [{ damage: 0 }], statsAll: [{}],
                    support: [{ boonStrips: 12 }],
                    defenses: [{ boonStrips: 5 }],
                    squadBuffVolumes: [
                        { id: 740, buffVolumeData: [{ outgoing: 3 }, { outgoing: 2 }] },
                        { id: 717, buffVolumeData: [{ outgoing: 4 }] },
                    ],
                },
                {
                    notInSquad: false, teamID: 50, dpsAll: [{ damage: 0 }], statsAll: [{}],
                    support: [{ boonStrips: 8 }],
                    defenses: [{ boonStrips: 1 }],
                    // no squadBuffVolumes → contributes 0 generation
                },
            ],
            targets: [],
        },
    });

    it('sums outgoing strips, incoming strips, and boons generated across the squad', () => {
        const fb = ingestLogFightBreakdown(mkBoonLog(), 0);
        expect(fb.totalOutgoingStrips).toBe(20); // 12 + 8
        expect(fb.totalIncomingStrips).toBe(6);  // 5 + 1
        expect(fb.totalBoonsGenerated).toBe(9);  // (3+2+4) + 0
    });

    it('defaults to 0 when support/defenses/squadBuffVolumes are absent', () => {
        const fb = ingestLogFightBreakdown({
            filePath: 'f2',
            details: { durationMS: 1000, players: [{ notInSquad: false, dpsAll: [{ damage: 0 }] }], targets: [] },
        }, 0);
        expect(fb.totalOutgoingStrips).toBe(0);
        expect(fb.totalIncomingStrips).toBe(0);
        expect(fb.totalBoonsGenerated).toBe(0);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/__tests__/computeFightBreakdown.test.ts --maxWorkers=2`
Expected: FAIL — `expected undefined to be 20` (fields don't exist yet).

- [ ] **Step 3: Add the three fields**

In `src/renderer/stats/computeFightBreakdown.ts`, inside the object returned by `ingestLogFightBreakdown`, add these properties right after `totalIncomingDamage: totalIncoming,` (line 135):

```typescript
        totalOutgoingStrips: squadPlayers.reduce((sum: number, p: any) => sum + (p.support?.[0]?.boonStrips || 0), 0),
        totalIncomingStrips: squadPlayers.reduce((sum: number, p: any) => sum + (p.defenses?.[0]?.boonStrips || 0), 0),
        totalBoonsGenerated: squadPlayers.reduce((sum: number, p: any) => {
            const volumes = Array.isArray(p.squadBuffVolumes) ? p.squadBuffVolumes : [];
            let playerTotal = 0;
            volumes.forEach((vol: any) => {
                const data = Array.isArray(vol?.buffVolumeData) ? vol.buffVolumeData : [];
                data.forEach((entry: any) => {
                    playerTotal += Number(entry?.outgoing || 0);
                });
            });
            return sum + playerTotal;
        }, 0),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/__tests__/computeFightBreakdown.test.ts --maxWorkers=2`
Expected: PASS (all tests, including the pre-existing team-color tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/computeFightBreakdown.ts src/renderer/stats/__tests__/computeFightBreakdown.test.ts
git commit -m "feat(stats): add per-fight boon strip & generation totals to fightBreakdown"
```

---

### Task 2: `buildBoonStripChartData` pure transform

**Files:**
- Create: `src/renderer/stats/sections/BoonStripComparisonSection.tsx` (transform + types only in this task)
- Test: `src/renderer/stats/sections/__tests__/buildBoonStripChartData.test.ts`

**Interfaces:**
- Consumes: `fightBreakdown` entries with `totalOutgoingStrips`, `totalIncomingStrips`, `totalBoonsGenerated`, plus existing `id`, `mapName`, `label`, `duration`, `isWin`.
- Produces:
  - `type BoonStripMode = 'strips' | 'generation'`
  - `type BoonStripPoint = { index: number; fightId: string; shortLabel: string; fullLabel: string; isWin: boolean | null; outgoing: number; incoming: number }`
  - `buildBoonStripChartData(fights: any[], mode: BoonStripMode): BoonStripPoint[]` — `outgoing` is `totalOutgoingStrips` (strips) or `totalBoonsGenerated` (generation); `incoming` is `-Math.abs(totalIncomingStrips)`; order preserved (chronological).

- [ ] **Step 1: Write the failing test**

Create `src/renderer/stats/sections/__tests__/buildBoonStripChartData.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildBoonStripChartData } from '../BoonStripComparisonSection';

const fights = [
    { id: 'a', mapName: 'EBG', label: 'F1', duration: '01:00', isWin: true, totalOutgoingStrips: 20, totalIncomingStrips: 6, totalBoonsGenerated: 9 },
    { id: 'b', mapName: 'Hills', label: 'F2', duration: '02:00', isWin: false, totalOutgoingStrips: 4, totalIncomingStrips: 10, totalBoonsGenerated: 30 },
];

describe('buildBoonStripChartData', () => {
    it('uses outgoing strips for the up series in strips mode', () => {
        const data = buildBoonStripChartData(fights, 'strips');
        expect(data.map((d) => d.outgoing)).toEqual([20, 4]);
    });

    it('uses boons generated for the up series in generation mode', () => {
        const data = buildBoonStripChartData(fights, 'generation');
        expect(data.map((d) => d.outgoing)).toEqual([9, 30]);
    });

    it('always reports incoming strips as a negative value', () => {
        const data = buildBoonStripChartData(fights, 'generation');
        expect(data.map((d) => d.incoming)).toEqual([-6, -10]);
    });

    it('preserves fight order and labels', () => {
        const data = buildBoonStripChartData(fights, 'strips');
        expect(data.map((d) => d.shortLabel)).toEqual(['F1', 'F2']);
        expect(data[0].fightId).toBe('a');
        expect(data[1].isWin).toBe(false);
    });

    it('handles an empty fightBreakdown', () => {
        expect(buildBoonStripChartData([], 'strips')).toEqual([]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/sections/__tests__/buildBoonStripChartData.test.ts --maxWorkers=2`
Expected: FAIL — cannot resolve `buildBoonStripChartData` (file/export does not exist).

- [ ] **Step 3: Create the file with the transform**

Create `src/renderer/stats/sections/BoonStripComparisonSection.tsx`:

```typescript
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { Eraser, Maximize2, X } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';

export type BoonStripMode = 'strips' | 'generation';

export type BoonStripPoint = {
    index: number;
    fightId: string;
    shortLabel: string;
    fullLabel: string;
    isWin: boolean | null;
    outgoing: number;
    incoming: number;
};

export const buildBoonStripChartData = (fights: any[], mode: BoonStripMode): BoonStripPoint[] => {
    const list = Array.isArray(fights) ? fights : [];
    return list.map((fight: any, idx: number) => {
        const outgoing = mode === 'generation'
            ? Number(fight?.totalBoonsGenerated || 0)
            : Number(fight?.totalOutgoingStrips || 0);
        return {
            index: idx,
            fightId: fight?.id || `fight-${idx}`,
            shortLabel: `F${idx + 1}`,
            fullLabel: `${fight?.mapName || fight?.label || 'Unknown'} • ${fight?.duration || '--:--'}`,
            isWin: typeof fight?.isWin === 'boolean' ? fight.isWin : null,
            outgoing,
            incoming: -Math.abs(Number(fight?.totalIncomingStrips || 0)),
        };
    });
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/sections/__tests__/buildBoonStripChartData.test.ts --maxWorkers=2`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/sections/BoonStripComparisonSection.tsx src/renderer/stats/sections/__tests__/buildBoonStripChartData.test.ts
git commit -m "feat(stats): add buildBoonStripChartData transform for boon strip chart"
```

---

### Task 3: `BoonStripComparisonSection` chart component

**Files:**
- Modify: `src/renderer/stats/sections/BoonStripComparisonSection.tsx` (append the React component)

**Interfaces:**
- Consumes: `buildBoonStripChartData`, `useStatsSharedContext()` (`stats`, `formatWithCommas`, `expandedSection`, `expandedSectionClosing`, `openExpandedSection`, `closeExpandedSection`).
- Produces: `export const BoonStripComparisonSection: () => JSX.Element` with `sectionId = 'boon-strip-comparison'`.

- [ ] **Step 1: Append the component**

Add to the end of `src/renderer/stats/sections/BoonStripComparisonSection.tsx`:

```typescript
const MODE_OPTIONS: Array<{ value: BoonStripMode; label: string }> = [
    { value: 'strips', label: 'Outgoing Strips' },
    { value: 'generation', label: 'Boon Generation' },
];

export const BoonStripComparisonSection = () => {
    const {
        stats,
        formatWithCommas,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
    } = useStatsSharedContext();
    const sectionId = 'boon-strip-comparison';
    const isExpanded = expandedSection === sectionId;
    const [mode, setMode] = useState<BoonStripMode>('strips');

    const fights = Array.isArray(stats?.fightBreakdown) ? stats.fightBreakdown : [];
    const chartData = useMemo(() => buildBoonStripChartData(fights, mode), [fights, mode]);
    const yMax = useMemo(() => {
        if (chartData.length === 0) return 1;
        return Math.max(1, ...chartData.map((d) => Math.max(Math.abs(d.outgoing), Math.abs(d.incoming))));
    }, [chartData]);

    const outgoingLabel = mode === 'generation' ? 'Boons Generated' : 'Outgoing Strips';

    return (
        <div
            className={`${isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}`}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Eraser className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Boon Strips</h3>
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className="ml-auto flex items-center justify-center w-[26px] h-[26px]"
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Boon Strips' : 'Expand Boon Strips'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>

            {chartData.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">No fight data available</div>
            ) : (
                <div className="rounded-[var(--radius-md)] p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--text-secondary)]">{outgoingLabel} vs Incoming Strips</div>
                            <div className="text-[11px] text-[color:var(--text-secondary)] mt-1">
                                Green bars (up) are squad {outgoingLabel.toLowerCase()}. Red bars (down) are boons stripped off the squad.
                            </div>
                        </div>
                        <PillToggleGroup
                            value={mode}
                            onChange={setMode}
                            options={MODE_OPTIONS}
                            activeClassName="bg-[var(--accent-bg-strong)] text-[color:var(--brand-primary)] border border-[color:var(--accent-border)]"
                            inactiveClassName="border border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                        />
                    </div>
                    <div className={isExpanded ? 'h-[400px]' : 'h-[300px]'}>
                        <ChartContainer width="100%" height="100%">
                            <BarChart data={chartData} stackOffset="sign">
                                <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                <XAxis dataKey="shortLabel" tick={{ fill: '#e2e8f0', fontSize: 10 }} />
                                <YAxis
                                    tick={{ fill: '#e2e8f0', fontSize: 10 }}
                                    domain={[-yMax, yMax]}
                                    tickFormatter={(value: number) => formatWithCommas(Math.abs(value), 0)}
                                />
                                <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                    content={({ payload }: any) => {
                                        const point = payload?.[0]?.payload as BoonStripPoint | undefined;
                                        if (!point) return null;
                                        return (
                                            <div style={{ backgroundColor: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.5rem', padding: '10px 12px', fontSize: '12px' }}>
                                                <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                                                    {point.fullLabel}{' '}
                                                    {point.isWin === true && <span style={{ color: 'var(--status-success)', fontWeight: 700 }}>W</span>}
                                                    {point.isWin === false && <span style={{ color: 'var(--status-error)', fontWeight: 700 }}>L</span>}
                                                </p>
                                                <p style={{ margin: '4px 0 0', color: 'var(--text-primary)' }}>
                                                    <span style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: 'var(--status-success)', borderRadius: 2, marginRight: 6 }} />
                                                    {outgoingLabel} : {formatWithCommas(Math.abs(point.outgoing), 0)}
                                                </p>
                                                <p style={{ margin: '2px 0 0', color: 'var(--text-primary)' }}>
                                                    <span style={{ display: 'inline-block', width: 8, height: 8, backgroundColor: 'var(--status-error)', borderRadius: 2, marginRight: 6 }} />
                                                    Incoming Strips : {formatWithCommas(Math.abs(point.incoming), 0)}
                                                </p>
                                            </div>
                                        );
                                    }}
                                />
                                <Bar dataKey="outgoing" name={outgoingLabel} stackId="stack">
                                    {chartData.map((entry) => (<Cell key={entry.fightId} fill="#22c55e" />))}
                                </Bar>
                                <Bar dataKey="incoming" name="Incoming Strips" stackId="stack">
                                    {chartData.map((entry) => (<Cell key={entry.fightId} fill="#ef4444" />))}
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    </div>
                    <div className="flex justify-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-green-500" />
                            <span className="text-[9px] text-[color:var(--text-secondary)]">{outgoingLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
                            <span className="text-[9px] text-[color:var(--text-secondary)]">Incoming Strips</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
```

- [ ] **Step 2: Verify typecheck and lint pass**

Run: `npm run typecheck`
Expected: no errors.

Run: `npx eslint src/renderer/stats/sections/BoonStripComparisonSection.tsx --max-warnings 0`
Expected: exit 0, no output.

> If `PillToggleGroup`'s `value`/`onChange`/`options` generic does not accept `BoonStripMode`, check its prop types in `src/renderer/stats/ui/PillToggleGroup.tsx` and match the existing `ConditionsSection` usage exactly (string union is what it already takes for `'outgoing' | 'incoming'`).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/sections/BoonStripComparisonSection.tsx
git commit -m "feat(stats): add BoonStripComparisonSection diverging chart"
```

---

### Task 4: Register the section in the Defense group

**Files:**
- Modify: `src/renderer/stats/hooks/useStatsNavigation.ts:112-128` (Defense group `sectionIds` + `items`)
- Modify: `src/renderer/stats/sectionColors.ts` (add accent entry near `:54`)
- Modify: `src/renderer/StatsView.tsx` (import; linear render near `:4469`; `renderGroup('defense', [...])` list near `:4905`)

**Interfaces:**
- Consumes: `BoonStripComparisonSection` from Task 3, section id `'boon-strip-comparison'`.
- Produces: the section rendered in both StatsView paths and listed in the Defense TOC.

- [ ] **Step 1: Add to the Defense TOC group**

In `src/renderer/stats/hooks/useStatsNavigation.ts`, in the `defense` group:

Add `'boon-strip-comparison'` to `sectionIds` immediately after `'defense-mitigation'`:

```typescript
        sectionIds: ['defense-detailed', 'incoming-damage-modifiers', 'incoming-strike-damage', 'defense-mitigation', 'boon-strip-comparison', 'boon-output', 'all-boons', 'boon-timeline', 'boon-uptime', 'stab-performance', 'support-detailed', 'healing-stats', 'healing-breakdown'],
```

Add the TOC item immediately after the `defense-mitigation` item (`Eraser` is already imported in this file):

```typescript
            { id: 'boon-strip-comparison', label: 'Boon Strips', icon: Eraser },
```

- [ ] **Step 2: Add the section accent color**

In `src/renderer/stats/sectionColors.ts`, add after the `'defense-mitigation'` entry:

```typescript
    'boon-strip-comparison': 'var(--section-defense)',
```

- [ ] **Step 3: Import and render in StatsView (both paths)**

In `src/renderer/StatsView.tsx`:

Add the import next to the other section imports (near `:40`):

```typescript
import { BoonStripComparisonSection } from './stats/sections/BoonStripComparisonSection';
```

In the **linear render path**, add immediately after the `DefenseSection` `renderSectionWrap(...)` block (after line 4469):

```typescript
                            {renderSectionWrap(<BoonStripComparisonSection />)}
```

In the **`renderGroup('defense', [...])` list**, add immediately after the `defense-detailed` entry (after line 4905):

```typescript
                            { id: 'boon-strip-comparison', element: <BoonStripComparisonSection /> },
```

- [ ] **Step 4: Verify typecheck, lint, and tests**

Run: `npm run typecheck`
Expected: no errors.

Run: `npx eslint src/renderer/StatsView.tsx src/renderer/stats/hooks/useStatsNavigation.ts src/renderer/stats/sectionColors.ts --max-warnings 0`
Expected: exit 0.

Run: `npx vitest run src/renderer/stats/__tests__/computeFightBreakdown.test.ts src/renderer/stats/sections/__tests__/buildBoonStripChartData.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/hooks/useStatsNavigation.ts src/renderer/stats/sectionColors.ts src/renderer/StatsView.tsx
git commit -m "feat(stats): register Boon Strips section in Defense group"
```

---

### Task 5: Manual verification in the running app

**Files:** none (verification only).

- [ ] **Step 1: Run the app and load a multi-fight dataset**

Run: `npm run dev`
Open the stats view with a report that has several fights and combat replay / detailed WvW data.

- [ ] **Step 2: Confirm the chart**

- The Defense TOC shows "Boon Strips"; clicking scrolls to the chart.
- One bar-pair per fight; green up = Outgoing Strips, red down = Incoming Strips.
- Toggling to **Boon Generation** swaps only the up bars (now boon counts); down bars stay Incoming Strips. If `squadBuffVolumes` is absent, Boon Generation bars are 0 (no crash).
- Tooltip shows fight label, W/L, the active up-metric, and Incoming Strips.
- Expand/collapse works.

- [ ] **Step 3: Confirm web-report parity (optional but recommended)**

Run: `npm run build:web` then `npm run dev:web` and confirm the section renders in the web report from a `report.json` that includes the new `fightBreakdown` fields.

---

## Self-Review

**Spec coverage:**
- Per-fight diverging chart, X axis = fights → Task 3 (BarChart, `shortLabel` axis).
- Up toggle strips/generation, down always incoming → Tasks 2 (transform) + 3 (PillToggle).
- Raw counts (incl. generation via `squadBuffVolumes.outgoing`) → Task 1.
- Single source `fightBreakdown` → Task 1 fields; Task 2/3 read only `stats.fightBreakdown`.
- Graceful 0 when data absent → Task 1 (`|| 0`, array guards) + Task 1 test 2.
- Defense-group registration, desktop + web → Task 4 (both StatsView paths).
- Tests for aggregation + transform → Tasks 1 and 2.
- `squadBuffVolumes` availability verification → Task 5 step 2 (Boon Generation may be 0; no crash).

**Placeholder scan:** none — every code step shows full code; commands have expected output.

**Type consistency:** `BoonStripMode` / `BoonStripPoint` / `buildBoonStripChartData` defined in Task 2 and used unchanged in Task 3; field names `totalOutgoingStrips` / `totalIncomingStrips` / `totalBoonsGenerated` consistent across Tasks 1–3; section id `'boon-strip-comparison'` consistent across Tasks 3–4.
