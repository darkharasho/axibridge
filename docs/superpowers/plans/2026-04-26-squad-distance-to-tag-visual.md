# Squad Distance-to-Tag Visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a circular target visualisation under the Distance-to-Tag table, plotting each player at a radius proportional to a chosen distance metric (avg / p25 / median / p75 / p95), with coloured threshold zones (green ≤600 / yellow / orange / red >1200).

**Architecture:** Extend the existing `DistanceToTagRow` with `p25` and `p75`. Lift the min-fights filter state from the table section up to `StatsView` so the new visual section can share it. Render a pure-SVG target with deterministically-positioned, profession-colored chips and a percentile toggle bar.

**Tech Stack:** TypeScript, React, vitest + @testing-library, plain SVG (no chart library needed for the target).

**Spec:** `docs/superpowers/specs/2026-04-26-squad-distance-to-tag-visual-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/renderer/stats/computeDistanceToTag.ts` | Add `p25`, `p75` to `DistanceToTagRow`; compute them in `finalizeDistanceToTag`. |
| `src/renderer/stats/__tests__/computeDistanceToTag.test.ts` | Add tests for p25/p75. |
| `src/renderer/stats/sections/SquadDistanceToTagSection.tsx` | Make `filterEnabled` / `minFights` optional controlled props. |
| `src/renderer/stats/sections/__tests__/SquadDistanceToTagSection.test.tsx` | Tests still pass after props change. |
| `src/renderer/stats/sections/SquadDistanceToTagVisualSection.tsx` | New SVG target visualisation with percentile toggle. |
| `src/renderer/stats/sections/__tests__/SquadDistanceToTagVisualSection.test.tsx` | Render tests. |
| `src/renderer/StatsView.tsx` | Hold shared filter state, pass to both sections, render visual in two locations. |
| `src/renderer/stats/hooks/useStatsNavigation.ts` | Nav entry. |
| `src/renderer/stats/sectionColors.ts` | Section color mapping. |
| `src/web/reportApp.tsx` | Web report nav entry. |

---

## Task 1: Extend computeDistanceToTag — failing tests for p25/p75

**Files:**
- Modify: `src/renderer/stats/__tests__/computeDistanceToTag.test.ts`

- [ ] **Step 1: Append new test block to the existing file**

Open `src/renderer/stats/__tests__/computeDistanceToTag.test.ts`. After the closing `});` of the `describe('finalizeDistanceToTag', ...)` block (and before the `describe('computeDistanceToTag (end-to-end)', ...)` block), insert:

```typescript
describe('finalizeDistanceToTag — p25 and p75', () => {
    it('emits p25 and p75 with nearest-rank for fightAvg-only player', () => {
        // Per-fight values [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
        // p25 nearest-rank: idx = ceil(0.25 * 10) - 1 = 2 → 30
        // median (p50): mean of values at idx 4 and 5 → (50+60)/2 = 55
        // p75 nearest-rank: idx = ceil(0.75 * 10) - 1 = 7 → 80
        // p95 nearest-rank: idx = ceil(0.95 * 10) - 1 = 9 → 100
        const out = finalizeDistanceToTag(
            [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((v, i) =>
                contrib({ fightId: `f${i}`, fightMean: v })
            )
        );
        const r = out.rows[0];
        expect(r.p25).toBe(30);
        expect(r.median).toBe(55);
        expect(r.p75).toBe(80);
        expect(r.p95).toBe(100);
    });

    it('p25 == p75 == median == avg for a single data point', () => {
        const out = finalizeDistanceToTag([contrib({ fightMean: 250 })]);
        const r = out.rows[0];
        expect(r.avg).toBe(250);
        expect(r.p25).toBe(250);
        expect(r.median).toBe(250);
        expect(r.p75).toBe(250);
        expect(r.p95).toBe(250);
    });

    it('emits p25 and p75 in pure-replay mode at sample level', () => {
        // 10 samples [10..100] in one fight
        const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        const out = finalizeDistanceToTag([
            contrib({ fightId: 'f1', source: 'replay', samples, fightMean: 55 }),
        ]);
        const r = out.rows[0];
        expect(r.source).toBe('replay');
        expect(r.p25).toBe(30);
        expect(r.p75).toBe(80);
    });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run src/renderer/stats/__tests__/computeDistanceToTag.test.ts`
Expected: 3 new tests FAIL with "expected 30 to be undefined" or similar (because `p25` and `p75` are not yet in the row object).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/__tests__/computeDistanceToTag.test.ts
git commit -m "test: add failing tests for p25/p75 in finalizeDistanceToTag"
```

---

## Task 2: Implement p25 and p75 in finalizeDistanceToTag

**Files:**
- Modify: `src/renderer/stats/computeDistanceToTag.ts`

- [ ] **Step 1: Update the `DistanceToTagRow` type**

Open `src/renderer/stats/computeDistanceToTag.ts`. Replace the existing `DistanceToTagRow` type definition with:

```typescript
export type DistanceToTagRow = {
    account: string;
    profession: string;
    professionList: string[];
    fightCount: number;
    sampleCount: number;
    avg: number;
    p25: number;
    median: number;
    p75: number;
    p95: number;
    source: 'replay' | 'fightAvg' | 'mixed';
    isCommander: boolean;
};
```

- [ ] **Step 2: Add a generic nearest-rank helper and use it for all percentiles**

In the same file, REPLACE the existing `nearestRankP95` helper with a generalised version:

```typescript
const nearestRankPercentile = (sortedAsc: number[], percentile: number): number => {
    if (sortedAsc.length === 0) return 0;
    const idx = Math.max(0, Math.ceil(percentile * sortedAsc.length) - 1);
    return sortedAsc[idx];
};
```

Then in `finalizeDistanceToTag`, replace the line that pushes the row:

```typescript
        rows.push({
            account,
            profession,
            professionList,
            fightCount: fightIds.size,
            sampleCount: values.length,
            avg: Math.round(avg),
            median: Math.round(median(sorted)),
            p95: Math.round(nearestRankP95(sorted)),
            source: sourceLabel,
            isCommander,
        });
```

with:

```typescript
        rows.push({
            account,
            profession,
            professionList,
            fightCount: fightIds.size,
            sampleCount: values.length,
            avg: Math.round(avg),
            p25: Math.round(nearestRankPercentile(sorted, 0.25)),
            median: Math.round(median(sorted)),
            p75: Math.round(nearestRankPercentile(sorted, 0.75)),
            p95: Math.round(nearestRankPercentile(sorted, 0.95)),
            source: sourceLabel,
            isCommander,
        });
```

- [ ] **Step 3: Run all distance-to-tag tests**

Run: `npx vitest run src/renderer/stats/__tests__/computeDistanceToTag.test.ts`
Expected: ALL tests PASS (existing 16 + new 3 = 19).

- [ ] **Step 4: Run validate**

Run: `npm run validate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/computeDistanceToTag.ts
git commit -m "feat: add p25 and p75 to DistanceToTagRow"
```

---

## Task 3: Lift filter state from table section to controlled props

**Files:**
- Modify: `src/renderer/stats/sections/SquadDistanceToTagSection.tsx`

- [ ] **Step 1: Update Props type and accept controlled state**

Open `src/renderer/stats/sections/SquadDistanceToTagSection.tsx`. Replace the existing `Props` type:

```typescript
type Props = {
    result: DistanceToTagResult;
};
```

with:

```typescript
type Props = {
    result: DistanceToTagResult;
    filterEnabled?: boolean;
    onFilterEnabledChange?: (v: boolean) => void;
    minFights?: number;
    onMinFightsChange?: (v: number) => void;
};
```

- [ ] **Step 2: Replace the local state with a controlled-or-internal pattern**

In the same file, replace the lines:

```typescript
    const [filterEnabled, setFilterEnabled] = useState(false);
    const [minFights, setMinFights] = useState(3);
```

with:

```typescript
    const [internalFilterEnabled, setInternalFilterEnabled] = useState(false);
    const [internalMinFights, setInternalMinFights] = useState(3);
    const filterEnabled = props.filterEnabled ?? internalFilterEnabled;
    const minFights = props.minFights ?? internalMinFights;
    const setFilterEnabled = (next: boolean | ((prev: boolean) => boolean)) => {
        const value = typeof next === 'function' ? next(filterEnabled) : next;
        if (props.onFilterEnabledChange) props.onFilterEnabledChange(value);
        else setInternalFilterEnabled(value);
    };
    const setMinFights = (next: number) => {
        if (props.onMinFightsChange) props.onMinFightsChange(next);
        else setInternalMinFights(next);
    };
```

Then change the function signature line from:

```typescript
export const SquadDistanceToTagSection = ({ result }: Props) => {
```

to:

```typescript
export const SquadDistanceToTagSection = (props: Props) => {
    const { result } = props;
```

- [ ] **Step 3: Run section tests + validate**

Run: `npx vitest run src/renderer/stats/sections/__tests__/SquadDistanceToTagSection.test.tsx && npm run validate`
Expected: 2/2 tests PASS, validate clean.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/sections/SquadDistanceToTagSection.tsx
git commit -m "refactor: make distance-to-tag table filter state optionally controlled"
```

---

## Task 4: Failing render tests for the visual section

**Files:**
- Create: `src/renderer/stats/sections/__tests__/SquadDistanceToTagVisualSection.test.tsx`

- [ ] **Step 1: Create the test file**

Create `src/renderer/stats/sections/__tests__/SquadDistanceToTagVisualSection.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SquadDistanceToTagVisualSection } from '../SquadDistanceToTagVisualSection';
import type { DistanceToTagResult, DistanceToTagRow } from '../../computeDistanceToTag';

vi.mock('../../StatsViewContext', () => ({
    useStatsSharedContext: () => ({
        formatWithCommas: (n: number, d: number) => Number(n).toFixed(d),
        expandedSection: null,
        expandedSectionClosing: false,
        openExpandedSection: () => {},
        closeExpandedSection: () => {},
    }),
}));

const row = (overrides: Partial<DistanceToTagRow> = {}): DistanceToTagRow => ({
    account: 'Player.1',
    profession: 'Guardian',
    professionList: ['Guardian'],
    fightCount: 5,
    sampleCount: 5,
    avg: 250,
    p25: 200,
    median: 240,
    p75: 280,
    p95: 600,
    source: 'fightAvg',
    isCommander: false,
    ...overrides,
});

const result = (rows: DistanceToTagRow[]): DistanceToTagResult => ({ rows, commanderCount: 0 });

describe('SquadDistanceToTagVisualSection', () => {
    it('renders empty state when no rows', () => {
        render(<SquadDistanceToTagVisualSection result={result([])} />);
        expect(screen.getByText(/no distance data/i)).toBeInTheDocument();
    });

    it('renders one chip per player', () => {
        render(<SquadDistanceToTagVisualSection result={result([
            row({ account: 'A.1' }),
            row({ account: 'B.2' }),
            row({ account: 'C.3' }),
        ])} />);
        const chips = document.querySelectorAll('[data-chip-account]');
        expect(chips).toHaveLength(3);
    });

    it('starts on Avg metric and switches when toggle clicked', () => {
        render(<SquadDistanceToTagVisualSection result={result([row({ account: 'A.1' })])} />);
        const avgBtn = screen.getByRole('button', { name: /avg/i });
        const p95Btn = screen.getByRole('button', { name: /p95/i });
        expect(avgBtn).toHaveAttribute('aria-pressed', 'true');
        expect(p95Btn).toHaveAttribute('aria-pressed', 'false');
        fireEvent.click(p95Btn);
        expect(avgBtn).toHaveAttribute('aria-pressed', 'false');
        expect(p95Btn).toHaveAttribute('aria-pressed', 'true');
    });

    it('places a player with avg=300 inside the green zone radius', () => {
        // outerRadius=190, scale 1500 → r = 300/1500 * 190 = 38. Green zone runs 0..76 (600/1500*190).
        render(<SquadDistanceToTagVisualSection result={result([row({ account: 'A.1', avg: 300 })])} />);
        const chip = document.querySelector('[data-chip-account="A.1"]') as SVGGElement | null;
        expect(chip).not.toBeNull();
        const r = Number(chip!.getAttribute('data-chip-radius'));
        expect(r).toBeGreaterThan(0);
        expect(r).toBeLessThanOrEqual(76);
    });

    it('clamps a player with very high distance to outer radius', () => {
        render(<SquadDistanceToTagVisualSection result={result([row({ account: 'A.1', avg: 9999 })])} />);
        const chip = document.querySelector('[data-chip-account="A.1"]') as SVGGElement | null;
        expect(chip).not.toBeNull();
        const r = Number(chip!.getAttribute('data-chip-radius'));
        expect(r).toBeCloseTo(190, 0);
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/renderer/stats/sections/__tests__/SquadDistanceToTagVisualSection.test.tsx`
Expected: FAIL with "Cannot find module '../SquadDistanceToTagVisualSection'".

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/sections/__tests__/SquadDistanceToTagVisualSection.test.tsx
git commit -m "test: add failing render tests for SquadDistanceToTagVisualSection"
```

---

## Task 5: Implement SquadDistanceToTagVisualSection

**Files:**
- Create: `src/renderer/stats/sections/SquadDistanceToTagVisualSection.tsx`

- [ ] **Step 1: Create the component file**

Create `src/renderer/stats/sections/SquadDistanceToTagVisualSection.tsx`:

```typescript
import { useMemo, useState } from 'react';
import { Maximize2, X, Crosshair } from 'lucide-react';
import { useStatsSharedContext } from '../StatsViewContext';
import { getProfessionColor } from '../../../shared/professionUtils';
import type { DistanceToTagResult, DistanceToTagRow } from '../computeDistanceToTag';

type MetricKey = 'avg' | 'p25' | 'median' | 'p75' | 'p95';

type Props = {
    result: DistanceToTagResult;
    filterEnabled?: boolean;
    minFights?: number;
};

const METRIC_OPTIONS: { key: MetricKey; label: string }[] = [
    { key: 'avg', label: 'Avg' },
    { key: 'p25', label: 'p25' },
    { key: 'median', label: 'Median' },
    { key: 'p75', label: 'p75' },
    { key: 'p95', label: 'p95' },
];

const VIEW_RADIUS = 200;
const OUTER_RADIUS = 190;
const SCALE_MAX = 1500;
const CHIP_RADIUS = 7;
const CHIP_RADIUS_EXPANDED = 10;

const ZONES: Array<{ inner: number; outer: number; fill: string }> = [
    { inner: 0, outer: 600, fill: 'rgba(34, 197, 94, 0.15)' },
    { inner: 600, outer: 800, fill: 'rgba(234, 179, 8, 0.18)' },
    { inner: 800, outer: 1200, fill: 'rgba(249, 115, 22, 0.18)' },
    { inner: 1200, outer: SCALE_MAX, fill: 'rgba(239, 68, 68, 0.20)' },
];

const RING_LABELS = [600, 800, 1200];

const distToRadius = (distance: number): number => {
    const clamped = Math.max(0, Math.min(distance, SCALE_MAX));
    return (clamped / SCALE_MAX) * OUTER_RADIUS;
};

// Stable string hash → angle in [0, 2π).
const accountAngle = (account: string): number => {
    let h = 0;
    for (let i = 0; i < account.length; i++) {
        h = (h * 31 + account.charCodeAt(i)) | 0;
    }
    const u = ((h >>> 0) % 1000) / 1000;
    return u * Math.PI * 2;
};

type ChipPosition = { row: DistanceToTagRow; r: number; angle: number; x: number; y: number };

const computeChipPositions = (
    rows: DistanceToTagRow[],
    metric: MetricKey,
    chipRadius: number
): ChipPosition[] => {
    const initial: ChipPosition[] = rows.map(row => {
        const r = distToRadius(row[metric]);
        const angle = accountAngle(row.account);
        return { row, r, angle, x: r * Math.cos(angle), y: r * Math.sin(angle) };
    });
    // Simple collision avoidance: nudge angles apart for chips within 2*chipRadius on the same band.
    const minSeparation = chipRadius * 2 + 1;
    for (let pass = 0; pass < 3; pass++) {
        let moved = false;
        for (let i = 0; i < initial.length; i++) {
            for (let j = i + 1; j < initial.length; j++) {
                const a = initial[i];
                const b = initial[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.hypot(dx, dy);
                if (dist < minSeparation && dist > 0) {
                    const push = (minSeparation - dist) / 2;
                    // Nudge both chips' angles in opposite directions.
                    const r = Math.max(a.r, 1);
                    const dAngle = push / r;
                    a.angle += dAngle;
                    b.angle -= dAngle;
                    a.x = a.r * Math.cos(a.angle);
                    a.y = a.r * Math.sin(a.angle);
                    b.x = b.r * Math.cos(b.angle);
                    b.y = b.r * Math.sin(b.angle);
                    moved = true;
                }
            }
        }
        if (!moved) break;
    }
    return initial;
};

export const SquadDistanceToTagVisualSection = (props: Props) => {
    const { result } = props;
    const {
        formatWithCommas,
        expandedSection,
        expandedSectionClosing,
        openExpandedSection,
        closeExpandedSection,
    } = useStatsSharedContext();
    const sectionId = 'squad-distance-to-tag-visual';
    const isExpanded = expandedSection === sectionId;
    const [metric, setMetric] = useState<MetricKey>('avg');
    const [hoverAccount, setHoverAccount] = useState<string | null>(null);

    const rows = useMemo(() => {
        const all = result?.rows ?? [];
        if (props.filterEnabled && typeof props.minFights === 'number') {
            return all.filter(r => r.fightCount >= props.minFights!);
        }
        return all;
    }, [result, props.filterEnabled, props.minFights]);

    const chipRadius = isExpanded ? CHIP_RADIUS_EXPANDED : CHIP_RADIUS;
    const chips = useMemo(() => computeChipPositions(rows, metric, chipRadius), [rows, metric, chipRadius]);
    const hovered = hoverAccount ? chips.find(c => c.row.account === hoverAccount) : null;

    const viewboxSize = VIEW_RADIUS * 2;
    const containerSize = isExpanded ? 560 : 380;

    return (
        <div
            className={isExpanded ? `fixed inset-0 z-50 overflow-y-auto h-screen modal-pane flex flex-col pb-10 ${expandedSectionClosing ? 'modal-pane-exit' : 'modal-pane-enter'}` : ''}
            style={isExpanded ? { background: 'var(--bg-elevated)', boxShadow: 'var(--shadow-card)' } : undefined}
        >
            <div className="flex flex-wrap items-center gap-2 mb-3.5">
                <Crosshair className="w-4 h-4 shrink-0" style={{ color: 'var(--brand-primary)' }} />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: 'var(--text-primary)' }}>Distance to Tag — Visual</h3>
                {rows.length > 0 && (
                    <div className="ml-auto flex flex-nowrap items-center gap-1 text-[11px] whitespace-nowrap" role="group" aria-label="Metric">
                        {METRIC_OPTIONS.map(opt => {
                            const active = metric === opt.key;
                            return (
                                <button
                                    key={opt.key}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() => setMetric(opt.key)}
                                    className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wider transition-colors"
                                    style={{
                                        background: active ? 'var(--brand-primary)' : 'var(--bg-card-inner)',
                                        color: active ? 'var(--bg-elevated)' : 'var(--text-secondary)',
                                        border: '1px solid var(--border-subtle)',
                                        fontWeight: active ? 700 : 500,
                                    }}
                                >{opt.label}</button>
                            );
                        })}
                    </div>
                )}
                <button
                    type="button"
                    onClick={() => (isExpanded ? closeExpandedSection() : openExpandedSection(sectionId))}
                    className={`${rows.length > 0 ? '' : 'ml-auto '}flex items-center justify-center w-[26px] h-[26px]`}
                    style={{ background: 'transparent', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)' }}
                    aria-label={isExpanded ? 'Close Distance to Tag Visual' : 'Expand Distance to Tag Visual'}
                    title={isExpanded ? 'Close' : 'Expand'}
                >
                    {isExpanded ? <X className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} /> : <Maximize2 className="w-3 h-3" style={{ color: 'var(--text-secondary)' }} />}
                </button>
            </div>

            {rows.length === 0 ? (
                <div className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--border-hover)] px-4 py-6 text-center text-xs text-[color:var(--text-secondary)]">
                    No distance data for the loaded fights.
                </div>
            ) : (
                <div className="flex justify-center">
                    <div style={{ position: 'relative', width: containerSize, height: containerSize }}>
                        <svg
                            viewBox={`-${VIEW_RADIUS} -${VIEW_RADIUS} ${viewboxSize} ${viewboxSize}`}
                            width={containerSize}
                            height={containerSize}
                            style={{ display: 'block' }}
                        >
                            {/* Zone fills, outer-first so inner overlays */}
                            {[...ZONES].reverse().map((z) => (
                                <circle
                                    key={`zone-${z.inner}-${z.outer}`}
                                    cx={0}
                                    cy={0}
                                    r={distToRadius(z.outer)}
                                    fill={z.fill}
                                    stroke="none"
                                />
                            ))}
                            {/* Boundary rings */}
                            {RING_LABELS.map((d) => (
                                <g key={`ring-${d}`}>
                                    <circle
                                        cx={0}
                                        cy={0}
                                        r={distToRadius(d)}
                                        fill="none"
                                        stroke="rgba(255,255,255,0.25)"
                                        strokeDasharray="3 3"
                                    />
                                    <text
                                        x={distToRadius(d) + 2}
                                        y={-2}
                                        fontSize={9}
                                        fill="var(--text-muted)"
                                    >{d}</text>
                                </g>
                            ))}
                            {/* Centre tag */}
                            <circle cx={0} cy={0} r={8} fill="var(--status-warning)" stroke="#fff" strokeWidth={1.5} />
                            <text x={0} y={20} fontSize={9} fill="var(--text-secondary)" textAnchor="middle">TAG</text>
                            {/* Chips */}
                            {chips.map(chip => (
                                <g
                                    key={chip.row.account}
                                    data-chip-account={chip.row.account}
                                    data-chip-radius={chip.r}
                                    transform={`translate(${chip.x} ${chip.y})`}
                                    onMouseEnter={() => setHoverAccount(chip.row.account)}
                                    onMouseLeave={() => setHoverAccount(null)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <circle
                                        r={chipRadius}
                                        fill={getProfessionColor(chip.row.profession)}
                                        stroke={chip.row.account === hoverAccount ? '#fff' : 'rgba(0,0,0,0.45)'}
                                        strokeWidth={chip.row.account === hoverAccount ? 2 : 1}
                                    />
                                    {chip.row.isCommander && (
                                        <text x={0} y={3} fontSize={9} textAnchor="middle" fill="#fff">★</text>
                                    )}
                                </g>
                            ))}
                        </svg>
                        {hovered && (
                            <div
                                style={{
                                    position: 'absolute',
                                    left: '50%',
                                    bottom: 0,
                                    transform: 'translate(-50%, calc(100% + 6px))',
                                    background: 'var(--bg-card)',
                                    border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '0.5rem',
                                    padding: '8px 10px',
                                    fontSize: 11,
                                    color: 'var(--text-primary)',
                                    minWidth: 180,
                                    pointerEvents: 'none',
                                    zIndex: 5,
                                }}
                            >
                                <div style={{ fontWeight: 700 }}>{hovered.row.account}</div>
                                <div style={{ color: 'var(--text-secondary)' }}>{hovered.row.profession} · {hovered.row.fightCount} fights</div>
                                <div style={{ marginTop: 4, fontFamily: 'monospace', fontSize: 10 }}>
                                    avg {formatWithCommas(hovered.row.avg, 0)} · p25 {formatWithCommas(hovered.row.p25, 0)} · med {formatWithCommas(hovered.row.median, 0)} · p75 {formatWithCommas(hovered.row.p75, 0)} · p95 {formatWithCommas(hovered.row.p95, 0)}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
```

- [ ] **Step 2: Run the section tests**

Run: `npx vitest run src/renderer/stats/sections/__tests__/SquadDistanceToTagVisualSection.test.tsx`
Expected: 5/5 PASS.

- [ ] **Step 3: Run validate**

Run: `npm run validate`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/sections/SquadDistanceToTagVisualSection.tsx
git commit -m "feat: add SquadDistanceToTagVisualSection target visualisation"
```

---

## Task 6: Wire shared filter state and the new section into StatsView

**Files:**
- Modify: `src/renderer/StatsView.tsx`

- [ ] **Step 1: Add the import**

Open `src/renderer/StatsView.tsx`. Find the import line:

```typescript
import { SquadDistanceToTagSection } from './stats/sections/SquadDistanceToTagSection';
```

Directly AFTER it, add:

```typescript
import { SquadDistanceToTagVisualSection } from './stats/sections/SquadDistanceToTagVisualSection';
```

- [ ] **Step 2: Add shared filter state**

Find the `useMemo` block that defines `distanceToTagResult` (around line 715). Directly AFTER its closing `}, [safeStats]);`, add:

```typescript
    const [distanceToTagFilterEnabled, setDistanceToTagFilterEnabled] = useState(false);
    const [distanceToTagMinFights, setDistanceToTagMinFights] = useState(3);
```

(`useState` is already imported in this file.)

- [ ] **Step 3: Pass shared state to the table render in the legacy block**

Find:

```typescript
                            {renderSectionWrap(<SquadDistanceToTagSection
                                result={distanceToTagResult}
                            />)}
```

Replace with:

```typescript
                            {renderSectionWrap(<SquadDistanceToTagSection
                                result={distanceToTagResult}
                                filterEnabled={distanceToTagFilterEnabled}
                                onFilterEnabledChange={setDistanceToTagFilterEnabled}
                                minFights={distanceToTagMinFights}
                                onMinFightsChange={setDistanceToTagMinFights}
                            />)}

                            {renderSectionWrap(<SquadDistanceToTagVisualSection
                                result={distanceToTagResult}
                                filterEnabled={distanceToTagFilterEnabled}
                                minFights={distanceToTagMinFights}
                            />)}
```

- [ ] **Step 4: Pass shared state to the table render in the grouped block**

Find:

```typescript
                            { id: 'squad-distance-to-tag', element: <SquadDistanceToTagSection
                                result={distanceToTagResult}
                            /> },
```

Replace with:

```typescript
                            { id: 'squad-distance-to-tag', element: <SquadDistanceToTagSection
                                result={distanceToTagResult}
                                filterEnabled={distanceToTagFilterEnabled}
                                onFilterEnabledChange={setDistanceToTagFilterEnabled}
                                minFights={distanceToTagMinFights}
                                onMinFightsChange={setDistanceToTagMinFights}
                            /> },
                            { id: 'squad-distance-to-tag-visual', element: <SquadDistanceToTagVisualSection
                                result={distanceToTagResult}
                                filterEnabled={distanceToTagFilterEnabled}
                                minFights={distanceToTagMinFights}
                            /> },
```

- [ ] **Step 5: Add the new section ID to the section-order list**

Find the section-ID list that contains `'squad-distance-to-tag',` (around line 128). Directly AFTER it, add:

```typescript
    'squad-distance-to-tag-visual',
```

- [ ] **Step 6: Run validate + unit tests**

Run: `npm run validate && npm run test:unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/StatsView.tsx
git commit -m "feat: render SquadDistanceToTagVisualSection with shared filter state"
```

---

## Task 7: Register the new section in nav / colors / web report

**Files:**
- Modify: `src/renderer/stats/hooks/useStatsNavigation.ts`
- Modify: `src/renderer/stats/sectionColors.ts`
- Modify: `src/web/reportApp.tsx`

- [ ] **Step 1: Add nav entry in the renderer**

Open `src/renderer/stats/hooks/useStatsNavigation.ts`. Find:

```typescript
        sectionIds: ['squad-damage-comparison', 'squad-kill-pressure', 'heal-effectiveness', 'squad-tag-distance-deaths', 'squad-distance-to-tag'],
        items: [
            { id: 'squad-damage-comparison', label: 'Damage Comparison', icon: ArrowUpDown },
            { id: 'squad-kill-pressure', label: 'Kill Pressure', icon: Target },
            { id: 'heal-effectiveness', label: 'Heal Effectiveness', icon: Waves },
            { id: 'squad-tag-distance-deaths', label: 'Tag Distance Deaths', icon: Crosshair },
            { id: 'squad-distance-to-tag', label: 'Distance to Tag', icon: Crosshair },
        ]
```

Replace with:

```typescript
        sectionIds: ['squad-damage-comparison', 'squad-kill-pressure', 'heal-effectiveness', 'squad-tag-distance-deaths', 'squad-distance-to-tag', 'squad-distance-to-tag-visual'],
        items: [
            { id: 'squad-damage-comparison', label: 'Damage Comparison', icon: ArrowUpDown },
            { id: 'squad-kill-pressure', label: 'Kill Pressure', icon: Target },
            { id: 'heal-effectiveness', label: 'Heal Effectiveness', icon: Waves },
            { id: 'squad-tag-distance-deaths', label: 'Tag Distance Deaths', icon: Crosshair },
            { id: 'squad-distance-to-tag', label: 'Distance to Tag', icon: Crosshair },
            { id: 'squad-distance-to-tag-visual', label: 'Distance to Tag Visual', icon: Crosshair },
        ]
```

- [ ] **Step 2: Add the same nav entry in the web report**

Open `src/web/reportApp.tsx`. Find:

```typescript
            sectionIds: ['squad-damage-comparison', 'squad-kill-pressure', 'heal-effectiveness', 'squad-tag-distance-deaths', 'squad-distance-to-tag'],
            items: [
                { id: 'squad-damage-comparison', label: 'Damage Comparison', icon: ArrowUpDown },
                { id: 'squad-kill-pressure', label: 'Kill Pressure', icon: Target },
                { id: 'heal-effectiveness', label: 'Heal Effectiveness', icon: Waves },
                { id: 'squad-tag-distance-deaths', label: 'Tag Distance Deaths', icon: Crosshair },
                { id: 'squad-distance-to-tag', label: 'Distance to Tag', icon: Crosshair }
            ]
```

Replace with:

```typescript
            sectionIds: ['squad-damage-comparison', 'squad-kill-pressure', 'heal-effectiveness', 'squad-tag-distance-deaths', 'squad-distance-to-tag', 'squad-distance-to-tag-visual'],
            items: [
                { id: 'squad-damage-comparison', label: 'Damage Comparison', icon: ArrowUpDown },
                { id: 'squad-kill-pressure', label: 'Kill Pressure', icon: Target },
                { id: 'heal-effectiveness', label: 'Heal Effectiveness', icon: Waves },
                { id: 'squad-tag-distance-deaths', label: 'Tag Distance Deaths', icon: Crosshair },
                { id: 'squad-distance-to-tag', label: 'Distance to Tag', icon: Crosshair },
                { id: 'squad-distance-to-tag-visual', label: 'Distance to Tag Visual', icon: Crosshair }
            ]
```

- [ ] **Step 3: Add the section color**

Open `src/renderer/stats/sectionColors.ts`. Find:

```typescript
    'squad-distance-to-tag': 'var(--section-defense)',
```

Directly AFTER it, add:

```typescript
    'squad-distance-to-tag-visual': 'var(--section-defense)',
```

- [ ] **Step 4: Run validate**

Run: `npm run validate`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/hooks/useStatsNavigation.ts src/renderer/stats/sectionColors.ts src/web/reportApp.tsx
git commit -m "feat: register squad-distance-to-tag-visual in nav, colors, web report"
```

---

## Task 8: Manual smoke + final verification

- [ ] **Step 1: Manual smoke**

Run: `npm run dev`

Load a dataset with replay-data fights. Navigate to Squad Stats → "Distance to Tag Visual".

Verify:
- Target renders with green/yellow/orange/red zones and dashed boundary rings labelled 600/800/1200.
- Centre gold tag dot with "TAG" label below.
- One profession-colored chip per non-commander player, positioned at radius proportional to the chosen metric.
- Toggle bar `Avg | p25 | Median | p75 | p95` works; clicking a different metric repositions chips inward/outward but keeps angles roughly stable per account.
- Hover on a chip shows tooltip with all 5 metrics + fight count.
- The min-fights toggle on the table also filters the visual.
- Expand button enlarges the SVG.
- Empty state shows when there are no rows.

If the UI cannot be tested in this environment, state that explicitly.

- [ ] **Step 2: Run full unit + validate suite**

Run: `npm run test:unit && npm run validate`
Expected: PASS.

- [ ] **Step 3: Final commit (if cleanup needed)**

If smoke testing surfaced any small fix, commit it with a descriptive message. Otherwise, no further commit required.
