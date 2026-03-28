# Strip Spikes via FightMetricSection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Strip Spikes" section to the stats dashboard showing per-player boon strip performance across fights, built on a new generic `FightMetricSection` component.

**Architecture:** A new `computeStripSpikesData.ts` extracts per-player, per-fight strip metrics from aggregate EI JSON `support[0]` fields. A new generic `FightMetricSection.tsx` component handles the "player list + per-fight trend chart" layout. StatsView.tsx wires the data through memoized derivations into the generic section. The TOC gets a new entry under Offensive Stats.

**Tech Stack:** React, Recharts (LineChart, Line, CartesianGrid, Tooltip, XAxis, YAxis), TypeScript, Lucide (Eraser icon)

---

### Task 1: Create computeStripSpikesData.ts

**Files:**
- Create: `src/renderer/stats/computeStripSpikesData.ts`

- [ ] **Step 1: Create the data computation file**

Create `src/renderer/stats/computeStripSpikesData.ts`:

```typescript
import { sanitizeWvwLabel, buildFightLabel, resolveMapName } from './utils/labelUtils';
import { resolveFightTimestamp } from './utils/timestampUtils';

type StripFightValue = {
    strips: number;
    stripTime: number;
    stripDownContrib: number;
};

type StripFight = {
    id: string;
    shortLabel: string;
    fullLabel: string;
    timestamp: number;
    values: Record<string, StripFightValue>;
    maxStrips: number;
    maxStripTime: number;
    maxStripDownContrib: number;
};

type StripPlayer = {
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
};

export type StripSpikesData = {
    fights: StripFight[];
    players: StripPlayer[];
};

export function computeStripSpikesData(validLogs: any[], splitPlayersByClass = false): StripSpikesData {
    const fights: StripFight[] = [];
    const playerMap = new Map<string, StripPlayer>();

    validLogs
        .map((log) => ({ log, ts: resolveFightTimestamp(log?.details, log) }))
        .sort((a, b) => a.ts - b.ts)
        .forEach(({ log }, index) => {
            const details = log?.details;
            if (!details) return;

            const fightName = sanitizeWvwLabel(details.fightName || log.fightName || `Fight ${index + 1}`);
            const mapName = resolveMapName(details, log);
            const fullLabel = buildFightLabel(fightName, String(mapName || ''));
            const fightId = log.filePath || log.id || `fight-${index + 1}`;
            const shortLabel = `F${index + 1}`;
            const timestamp = resolveFightTimestamp(details, log);

            const values: Record<string, StripFightValue> = {};
            let maxStrips = 0;
            let maxStripTime = 0;
            let maxStripDownContrib = 0;

            const players = Array.isArray(details.players) ? details.players : [];
            players.forEach((player: any) => {
                if (player?.notInSquad) return;
                const account = String(player?.account || player?.name || 'Unknown');
                const characterName = String(player?.character_name || player?.display_name || player?.name || '');
                const profession = String(player?.profession || 'Unknown');
                const key = splitPlayersByClass && profession !== 'Unknown' ? `${account}::${profession}` : account;

                const support = Array.isArray(player?.support) ? player.support[0] : player?.support;
                const strips = Number(support?.boonStrips || 0);
                const stripTime = Number(support?.boonStripsTime || 0);
                const stripDownContrib = Number(support?.boonStripDownContribution || 0);

                values[key] = { strips, stripTime, stripDownContrib };

                if (strips > maxStrips) maxStrips = strips;
                if (stripTime > maxStripTime) maxStripTime = stripTime;
                if (stripDownContrib > maxStripDownContrib) maxStripDownContrib = stripDownContrib;

                const existing = playerMap.get(key);
                if (existing) {
                    existing.logs += 1;
                    existing.totalStrips += strips;
                    existing.totalStripTime += stripTime;
                    existing.totalStripDownContrib += stripDownContrib;
                    if (!existing.professionList.includes(profession)) {
                        existing.professionList.push(profession);
                    }
                    if (strips > existing.peakStrips) {
                        existing.peakStrips = strips;
                        existing.peakFightLabel = fullLabel;
                    }
                    if (stripTime > existing.peakStripTime) existing.peakStripTime = stripTime;
                    if (stripDownContrib > existing.peakStripDownContrib) existing.peakStripDownContrib = stripDownContrib;
                } else {
                    playerMap.set(key, {
                        key,
                        account,
                        displayName: account,
                        characterName,
                        profession,
                        professionList: [profession],
                        logs: 1,
                        totalStrips: strips,
                        totalStripTime: stripTime,
                        totalStripDownContrib: stripDownContrib,
                        peakStrips: strips,
                        peakStripTime: stripTime,
                        peakStripDownContrib: stripDownContrib,
                        peakFightLabel: fullLabel,
                    });
                }
            });

            fights.push({
                id: fightId,
                shortLabel,
                fullLabel,
                timestamp,
                values,
                maxStrips,
                maxStripTime,
                maxStripDownContrib,
            });
        });

    const players = Array.from(playerMap.values())
        .sort((a, b) => b.totalStrips - a.totalStrips || a.displayName.localeCompare(b.displayName));

    return { fights, players };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/renderer/stats/computeStripSpikesData.ts`

Expected: No errors (or run full typecheck: `npm run typecheck`)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/computeStripSpikesData.ts
git commit -m "feat: add computeStripSpikesData for strip spikes extraction"
```

---

### Task 2: Write unit test for computeStripSpikesData

**Files:**
- Create: `src/renderer/__tests__/computeStripSpikesData.test.ts`

- [ ] **Step 1: Write the test file**

Create `src/renderer/__tests__/computeStripSpikesData.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { computeStripSpikesData } from '../stats/computeStripSpikesData';

const makeLog = (filePath: string, players: any[], fightName = 'Eternal Coliseum') => ({
    status: 'success',
    filePath,
    details: {
        durationMS: 60000,
        fightName,
        players,
        targets: [],
        skillMap: {},
        buffMap: {},
    },
});

const makePlayer = (account: string, profession: string, strips: number, stripTime = 0, stripDownContrib = 0) => ({
    account,
    profession,
    notInSquad: false,
    support: [{ boonStrips: strips, boonStripsTime: stripTime, boonStripDownContribution: stripDownContrib }],
    dpsAll: [{ damage: 0 }],
    statsAll: [{ connectedDamageCount: 0 }],
    damage1S: [[0]],
    targetDamage1S: [[[0]]],
    targetDamageDist: [[[]]],
    totalDamageDist: [[]],
});

describe('computeStripSpikesData', () => {
    it('extracts per-fight strip values for each player', () => {
        const logs = [
            makeLog('fight-1', [
                makePlayer('Alice.1234', 'Spellbreaker', 10, 500, 3),
                makePlayer('Bob.5678', 'Scourge', 5, 200, 1),
            ]),
            makeLog('fight-2', [
                makePlayer('Alice.1234', 'Spellbreaker', 15, 800, 5),
                makePlayer('Bob.5678', 'Scourge', 20, 1000, 8),
            ]),
        ];

        const result = computeStripSpikesData(logs);

        expect(result.fights).toHaveLength(2);
        expect(result.fights[0].values['Alice.1234'].strips).toBe(10);
        expect(result.fights[1].values['Bob.5678'].strips).toBe(20);
        expect(result.fights[1].maxStrips).toBe(20);
    });

    it('aggregates player totals and peaks across fights', () => {
        const logs = [
            makeLog('fight-1', [makePlayer('Alice.1234', 'Spellbreaker', 10, 500, 3)]),
            makeLog('fight-2', [makePlayer('Alice.1234', 'Spellbreaker', 15, 800, 5)]),
        ];

        const result = computeStripSpikesData(logs);
        const alice = result.players.find((p) => p.key === 'Alice.1234');

        expect(alice).toBeTruthy();
        expect(alice!.totalStrips).toBe(25);
        expect(alice!.peakStrips).toBe(15);
        expect(alice!.totalStripTime).toBe(1300);
        expect(alice!.peakStripTime).toBe(800);
        expect(alice!.logs).toBe(2);
    });

    it('splits players by class when splitPlayersByClass is true', () => {
        const logs = [
            makeLog('fight-1', [
                makePlayer('Alice.1234', 'Spellbreaker', 10),
                makePlayer('Alice.1234', 'Scourge', 5),
            ]),
        ];

        const result = computeStripSpikesData(logs, true);
        const keys = result.players.map((p) => p.key);

        expect(keys).toContain('Alice.1234::Spellbreaker');
        expect(keys).toContain('Alice.1234::Scourge');
        expect(result.players).toHaveLength(2);
    });

    it('skips notInSquad players', () => {
        const logs = [
            makeLog('fight-1', [
                { ...makePlayer('Alice.1234', 'Spellbreaker', 10), notInSquad: true },
                makePlayer('Bob.5678', 'Scourge', 5),
            ]),
        ];

        const result = computeStripSpikesData(logs);

        expect(result.players).toHaveLength(1);
        expect(result.players[0].key).toBe('Bob.5678');
    });

    it('returns empty arrays for empty logs', () => {
        const result = computeStripSpikesData([]);
        expect(result.fights).toHaveLength(0);
        expect(result.players).toHaveLength(0);
    });

    it('sorts players by total strips descending', () => {
        const logs = [
            makeLog('fight-1', [
                makePlayer('Low.1234', 'Spellbreaker', 2),
                makePlayer('High.5678', 'Scourge', 20),
                makePlayer('Mid.9012', 'Herald', 10),
            ]),
        ];

        const result = computeStripSpikesData(logs);
        const names = result.players.map((p) => p.account);

        expect(names).toEqual(['High.5678', 'Mid.9012', 'Low.1234']);
    });
});
```

- [ ] **Step 2: Run the test**

Run: `npx vitest run src/renderer/__tests__/computeStripSpikesData.test.ts`

Expected: All 6 tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/__tests__/computeStripSpikesData.test.ts
git commit -m "test: add unit tests for computeStripSpikesData"
```

---

### Task 3: Integrate computeStripSpikesData into computeStatsAggregation

**Files:**
- Modify: `src/renderer/stats/computeStatsAggregation.ts`

- [ ] **Step 1: Add the import**

In `src/renderer/stats/computeStatsAggregation.ts`, after the existing import of `computeSpikeDamageData` (line 7), add:

```typescript
import { computeStripSpikesData } from './computeStripSpikesData';
```

- [ ] **Step 2: Call the computation**

After line 657 (`const spikeDamage = computeSpikeDamageData(validLogs, splitPlayersByClass);`), add:

```typescript
const stripSpikes = computeStripSpikesData(validLogs, splitPlayersByClass);
```

- [ ] **Step 3: Include in the return object**

In the return object (around line 739), after `spikeDamage,` add:

```typescript
            stripSpikes,
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run typecheck`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/computeStatsAggregation.ts
git commit -m "feat: wire computeStripSpikesData into stats aggregation"
```

---

### Task 4: Create FightMetricSection component

**Files:**
- Create: `src/renderer/stats/sections/FightMetricSection.tsx`

- [ ] **Step 1: Create the component file**

Create `src/renderer/stats/sections/FightMetricSection.tsx`. This component follows the same layout as SpikeDamageSection but is generic — it accepts configurable modes, a generic value type, and optional drilldown.

```typescript
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartContainer } from '../ui/ChartContainer';
import { Maximize2, X } from 'lucide-react';
import { getProfessionColor } from '../../../shared/professionUtils';
import { PillToggleGroup } from '../ui/PillToggleGroup';
import { useStatsSharedContext } from '../StatsViewContext';
import type { StatsTocIcon } from '../hooks/useStatsNavigation';

export type FightMetricPlayer = {
    key: string;
    account: string;
    displayName: string;
    characterName: string;
    profession: string;
    professionList: string[];
    logs: number;
    value: number;
    peakFightLabel: string;
};

export type FightMetricPoint = {
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

    modes: Array<{ id: string; label: string }>;
    activeMode: string;
    setActiveMode: (value: string) => void;

    playerFilter: string;
    setPlayerFilter: (value: string) => void;
    groupedPlayers: Array<{ profession: string; players: FightMetricPlayer[] }>;
    selectedPlayerKey: string | null;
    setSelectedPlayerKey: (value: string | null) => void;
    selectedPlayer: FightMetricPlayer | null;

    chartData: FightMetricPoint[];
    chartMaxY: number;

    formatValue: (n: number) => string;
    valueSuffix?: string;
};

export const FightMetricSection = ({
    sectionId,
    title,
    titleIcon: TitleIcon,
    titleIconClassName = '',
    listTitle = 'Squad Players',
    searchPlaceholder = 'Search player or account',
    modes,
    activeMode,
    setActiveMode,
    playerFilter,
    setPlayerFilter,
    groupedPlayers,
    selectedPlayerKey,
    setSelectedPlayerKey,
    selectedPlayer,
    chartData,
    chartMaxY,
    formatValue,
    valueSuffix = '',
}: FightMetricSectionProps) => {
    const { expandedSection, expandedSectionClosing, openExpandedSection, closeExpandedSection, formatWithCommas, renderProfessionIcon } = useStatsSharedContext();
    const isExpanded = expandedSection === sectionId;

    const sanitizeWvwLabel = (value: string) => String(value || '')
        .replace(/^Detailed\s*WvW\s*-\s*/i, '')
        .replace(/^World\s*vs\s*World\s*-\s*/i, '')
        .replace(/^WvW\s*-\s*/i, '')
        .trim();

    const playerColor = selectedPlayer ? getProfessionColor(selectedPlayer.profession) : '#818cf8';

    const avgValue = chartData.length > 0
        ? chartData.reduce((sum, entry) => sum + Number(entry.value || 0), 0) / chartData.length
        : 0;

    const renderContent = (expanded: boolean) => (
        <div
            id={expanded ? undefined : sectionId}
            className={`glass-surface rounded-xl overflow-hidden ${expanded ? 'h-full flex flex-col' : ''}`}
            style={{ scrollMarginTop: '80px' }}
        >
            {/* ── Header ─────────────────────────────────────── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                    {TitleIcon && <TitleIcon className={`w-4 h-4 ${titleIconClassName}`} />}
                    <span className="text-sm font-semibold text-slate-200">{title}</span>
                </div>
                <div className="flex items-center gap-2">
                    {modes.length > 1 && (
                        <PillToggleGroup
                            options={modes.map((m) => ({ value: m.id, label: m.label }))}
                            value={activeMode}
                            onChange={setActiveMode}
                        />
                    )}
                    {!expanded && (
                        <button
                            onClick={() => openExpandedSection(sectionId)}
                            className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-colors"
                            title="Expand"
                        >
                            <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {expanded && (
                        <button
                            onClick={closeExpandedSection}
                            className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-slate-200 transition-colors"
                            title="Close"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* ── Body ────────────────────────────────────────── */}
            <div className={`flex ${expanded ? 'flex-1 min-h-0' : ''}`} style={expanded ? undefined : { height: 420 }}>
                {/* ── Player list ─────────────────────────────── */}
                <div className="w-[260px] flex-shrink-0 border-r border-white/5 flex flex-col">
                    <div className="px-3 py-2 border-b border-white/5">
                        <input
                            type="text"
                            value={playerFilter}
                            onChange={(e) => setPlayerFilter(e.target.value)}
                            placeholder={searchPlaceholder}
                            className="w-full bg-white/5 rounded px-2 py-1 text-xs text-slate-300 placeholder-slate-500 outline-none focus:ring-1 focus:ring-indigo-500/50"
                        />
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 px-3 pt-2 pb-1">{listTitle}</div>
                    <div className="flex-1 overflow-y-auto px-1.5 pb-2">
                        {groupedPlayers.map((group) => (
                            <div key={group.profession}>
                                {groupedPlayers.length > 1 && (
                                    <div className="text-[10px] text-slate-500 px-2 pt-2 pb-0.5">{group.profession}</div>
                                )}
                                {group.players.map((player) => {
                                    const isSelected = selectedPlayerKey === player.key;
                                    return (
                                        <button
                                            key={player.key}
                                            onClick={() => setSelectedPlayerKey(isSelected ? null : player.key)}
                                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                                                isSelected
                                                    ? 'bg-indigo-500/15 ring-1 ring-indigo-500/30'
                                                    : 'hover:bg-white/5'
                                            }`}
                                        >
                                            {renderProfessionIcon(player.profession, player.professionList, 'w-4 h-4 flex-shrink-0')}
                                            <span className={`text-xs truncate flex-1 ${isSelected ? 'text-slate-200' : 'text-slate-400'}`}>
                                                {player.displayName}
                                            </span>
                                            <span className={`text-xs tabular-nums ${isSelected ? 'text-indigo-300 font-semibold' : 'text-slate-500'}`}>
                                                {formatValue(player.value)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                        {groupedPlayers.length === 0 && (
                            <div className="text-xs text-slate-500 px-2 py-4 text-center">No players</div>
                        )}
                    </div>
                </div>

                {/* ── Chart area ─────────────────────────────── */}
                <div className="flex-1 flex flex-col min-w-0">
                    {!selectedPlayer ? (
                        <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                            Select a player to view per-fight trend
                        </div>
                    ) : (
                        <>
                            {/* Summary row */}
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

                            {/* Chart */}
                            <div className="flex-1 min-h-0 px-4 py-3">
                                <ChartContainer width="100%" height="100%">
                                    <LineChart data={chartData}>
                                        <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                                        <XAxis
                                            dataKey="shortLabel"
                                            tick={{ fontSize: 10, fill: '#64748b' }}
                                            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            domain={[0, Math.max(1, chartMaxY)]}
                                            tick={{ fontSize: 10, fill: '#64748b' }}
                                            axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                                            tickLine={false}
                                            tickFormatter={(v: number) => formatValue(v)}
                                            width={50}
                                        />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (!active || !payload?.length) return null;
                                                const data = payload[0]?.payload as FightMetricPoint | undefined;
                                                if (!data) return null;
                                                return (
                                                    <div className="bg-slate-900/95 border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
                                                        <div className="text-slate-200 font-medium mb-1">{sanitizeWvwLabel(data.fullLabel)}</div>
                                                        <div className="text-indigo-300">{selectedPlayer?.displayName}: <strong>{formatValue(data.value)}</strong>{valueSuffix ? ` ${valueSuffix}` : ''}</div>
                                                        <div className="text-slate-500">Fight Max: {formatValue(data.maxValue)}</div>
                                                    </div>
                                                );
                                            }}
                                        />
                                        <Line
                                            dataKey="maxValue"
                                            name="Fight Max"
                                            stroke="rgba(148,163,184,0.5)"
                                            strokeWidth={1.5}
                                            strokeDasharray="6 4"
                                            dot={false}
                                            isAnimationActive={false}
                                        />
                                        <Line
                                            dataKey="value"
                                            name={selectedPlayer?.displayName || 'Player'}
                                            stroke={playerColor}
                                            strokeWidth={2.5}
                                            dot={{ r: 3, fill: playerColor, stroke: playerColor }}
                                            activeDot={{ r: 5, fill: playerColor, stroke: '#fff', strokeWidth: 2 }}
                                            isAnimationActive={false}
                                        />
                                    </LineChart>
                                </ChartContainer>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );

    if (isExpanded) {
        return renderContent(true);
    }

    return renderContent(false);
};
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run typecheck`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/stats/sections/FightMetricSection.tsx
git commit -m "feat: add generic FightMetricSection component"
```

---

### Task 5: Add Strip Spikes to TOC navigation

**Files:**
- Modify: `src/renderer/stats/hooks/useStatsNavigation.ts`

- [ ] **Step 1: Add Eraser import**

In `src/renderer/stats/hooks/useStatsNavigation.ts`, add `Eraser` to the lucide-react import (line 3):

Change:
```typescript
import { Trophy, Shield, ShieldAlert, ShieldOff, Zap, Map as MapIcon, Users, Skull, Star, HeartPulse, Keyboard, ListTree, BarChart3, ArrowBigUp, FileText, Swords, GitCompareArrows, Clock3, Target, Route, Waves, Flame, Crosshair, ArrowUpDown } from 'lucide-react';
```

To:
```typescript
import { Trophy, Shield, ShieldAlert, ShieldOff, Zap, Map as MapIcon, Users, Skull, Star, HeartPulse, Keyboard, ListTree, BarChart3, ArrowBigUp, FileText, Swords, GitCompareArrows, Clock3, Target, Route, Waves, Flame, Crosshair, ArrowUpDown, Eraser } from 'lucide-react';
```

- [ ] **Step 2: Add strip-spikes to the offensive stats group**

In the `offense` group (around line 91-102), add `'strip-spikes'` to the `sectionIds` array and a new item entry.

Change:
```typescript
        sectionIds: ['offense-detailed', 'damage-modifiers', 'player-breakdown', 'damage-breakdown', 'spike-damage', 'conditions-outgoing'],
        items: [
            { id: 'offense-detailed', label: 'Offense Detailed', icon: Swords },
            { id: 'damage-modifiers', label: 'Damage Modifiers', icon: Flame },
            { id: 'player-breakdown', label: 'Player Breakdown', icon: ListTree },
            { id: 'damage-breakdown', label: 'Damage Breakdown', icon: BarChart3 },
            { id: 'spike-damage', label: 'Spike Damage', icon: Zap },
            { id: 'conditions-outgoing', label: 'Conditions', icon: Skull }
        ]
```

To:
```typescript
        sectionIds: ['offense-detailed', 'damage-modifiers', 'player-breakdown', 'damage-breakdown', 'spike-damage', 'strip-spikes', 'conditions-outgoing'],
        items: [
            { id: 'offense-detailed', label: 'Offense Detailed', icon: Swords },
            { id: 'damage-modifiers', label: 'Damage Modifiers', icon: Flame },
            { id: 'player-breakdown', label: 'Player Breakdown', icon: ListTree },
            { id: 'damage-breakdown', label: 'Damage Breakdown', icon: BarChart3 },
            { id: 'spike-damage', label: 'Spike Damage', icon: Zap },
            { id: 'strip-spikes', label: 'Strip Spikes', icon: Eraser },
            { id: 'conditions-outgoing', label: 'Conditions', icon: Skull }
        ]
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run typecheck`

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/stats/hooks/useStatsNavigation.ts
git commit -m "feat: add Strip Spikes entry to stats TOC navigation"
```

---

### Task 6: Wire strip spikes state and rendering in StatsView.tsx

**Files:**
- Modify: `src/renderer/StatsView.tsx`

- [ ] **Step 1: Add FightMetricSection import**

In `src/renderer/StatsView.tsx`, after the SpikeDamageSection import (around line 57 where `import { SpikeDamageSection }` is), add:

```typescript
import { FightMetricSection } from './stats/sections/FightMetricSection';
import type { FightMetricPlayer, FightMetricPoint } from './stats/sections/FightMetricSection';
```

Also add `Eraser` to the lucide-react import if not already present. Check the existing lucide import and add `Eraser` to it.

- [ ] **Step 2: Add state variables**

After the existing spike damage state variables (around line 845, after `const [spikeDamageBasis, setSpikeDamageBasis] = useState<'all' | 'downContribution'>('all');`), add:

```typescript
    const [stripPlayerFilter, setStripPlayerFilter] = useState('');
    const [selectedStripPlayerKey, setSelectedStripPlayerKey] = useState<string | null>(null);
    const [stripMode, setStripMode] = useState<string>('strips');
```

- [ ] **Step 3: Add strip spikes data extraction memo**

After the spike damage data extraction and memos (after the `spikeChartMaxY` useMemo, around line 1641), add the strip spikes memos:

```typescript
    // ── Strip Spikes ──────────────────────────────────────────────────────────────
    const stripSpikesData = useMemo(() => {
        const raw = safeStats?.stripSpikes;
        if (!raw) return { fights: [], players: [] };
        return {
            fights: Array.isArray(raw.fights) ? raw.fights : [],
            players: Array.isArray(raw.players) ? raw.players : [],
        };
    }, [safeStats]);

    const stripPlayerMap = useMemo(() => {
        const map = new Map<string, (typeof stripSpikesData.players)[number]>();
        stripSpikesData.players.forEach((player) => map.set(player.key, player));
        return map;
    }, [stripSpikesData.players]);

    const groupedStripPlayers = useMemo((): Array<{ profession: string; players: FightMetricPlayer[] }> => {
        const modeValue = (player: any) => {
            if (stripMode === 'stripTime') return Number(player.peakStripTime || 0);
            if (stripMode === 'stripDownContrib') return Number(player.peakStripDownContrib || 0);
            return Number(player.peakStrips || 0);
        };
        const term = stripPlayerFilter.trim().toLowerCase();
        const filtered = !term
            ? stripSpikesData.players
            : stripSpikesData.players.filter((player) =>
                player.displayName.toLowerCase().includes(term)
                || player.account.toLowerCase().includes(term)
                || player.profession.toLowerCase().includes(term)
            );
        const groups = new Map<string, FightMetricPlayer[]>();
        filtered.forEach((player) => {
            const profession = player.profession || 'Unknown';
            const list = groups.get(profession) || [];
            list.push({
                key: player.key,
                account: player.account,
                displayName: player.displayName,
                characterName: player.characterName,
                profession: player.profession,
                professionList: player.professionList,
                logs: player.logs,
                value: modeValue(player),
                peakFightLabel: player.peakFightLabel,
            });
            groups.set(profession, list);
        });
        return Array.from(groups.entries())
            .map(([profession, players]) => ({
                profession,
                players: [...players].sort((a, b) => b.value - a.value || a.displayName.localeCompare(b.displayName))
            }))
            .sort((a, b) => a.profession.localeCompare(b.profession));
    }, [stripSpikesData.players, stripPlayerFilter, stripMode]);

    const selectedStripPlayer = selectedStripPlayerKey
        ? (() => {
            const raw = stripPlayerMap.get(selectedStripPlayerKey);
            if (!raw) return null;
            const modeValue = stripMode === 'stripTime' ? raw.peakStripTime
                : stripMode === 'stripDownContrib' ? raw.peakStripDownContrib
                : raw.peakStrips;
            return {
                key: raw.key,
                account: raw.account,
                displayName: raw.displayName,
                characterName: raw.characterName,
                profession: raw.profession,
                professionList: raw.professionList,
                logs: raw.logs,
                value: Number(modeValue || 0),
                peakFightLabel: raw.peakFightLabel,
            } as FightMetricPlayer;
        })()
        : null;

    const stripChartData = useMemo((): FightMetricPoint[] => {
        if (!selectedStripPlayerKey) return [];
        return stripSpikesData.fights.map((fight, index) => {
            const entry = fight.values?.[selectedStripPlayerKey];
            const value = stripMode === 'stripTime' ? Number(entry?.stripTime || 0)
                : stripMode === 'stripDownContrib' ? Number(entry?.stripDownContrib || 0)
                : Number(entry?.strips || 0);
            const maxValue = stripMode === 'stripTime' ? Number(fight.maxStripTime || 0)
                : stripMode === 'stripDownContrib' ? Number(fight.maxStripDownContrib || 0)
                : Number(fight.maxStrips || 0);
            return {
                index,
                fightId: fight.id,
                shortLabel: fight.shortLabel,
                fullLabel: fight.fullLabel,
                timestamp: Number(fight.timestamp || 0),
                value,
                maxValue,
            };
        });
    }, [stripSpikesData.fights, selectedStripPlayerKey, stripMode]);

    const stripChartMaxY = useMemo(() => {
        const selectedPeak = stripChartData.reduce((best, entry) => Math.max(best, Number(entry.value || 0)), 0);
        const fightPeak = stripChartData.reduce((best, entry) => Math.max(best, Number(entry.maxValue || 0)), 0);
        return Math.max(1, selectedPeak, fightPeak);
    }, [stripChartData]);

    const formatStripTime = (ms: number) => {
        const seconds = ms / 1000;
        return seconds < 10 ? seconds.toFixed(1) + 's' : Math.round(seconds) + 's';
    };
```

- [ ] **Step 4: Add the FightMetricSection render call**

Find where `SpikeDamageSection` is rendered (around line 4132-4154, inside `renderSectionWrap`). After the SpikeDamageSection render block, add:

```typescript
{renderSectionWrap(<FightMetricSection
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
    formatValue={stripMode === 'stripTime' ? formatStripTime : (v: number) => formatWithCommas(v, 0)}
    valueSuffix={stripMode === 'strips' ? 'strips' : ''}
/>)}
```

Note: There may be a second render site (for modern layout). Search StatsView.tsx for all places where `SpikeDamageSection` appears and add a corresponding `FightMetricSection` render call after each one.

- [ ] **Step 5: Verify it compiles**

Run: `npm run typecheck`

Expected: No errors.

- [ ] **Step 6: Verify lint passes**

Run: `npm run lint`

Expected: No warnings (max-warnings 0).

- [ ] **Step 7: Commit**

```bash
git add src/renderer/StatsView.tsx
git commit -m "feat: wire strip spikes into StatsView with FightMetricSection"
```

---

### Task 7: Visual verification and end-to-end test

**Files:**
- None created — manual verification

- [ ] **Step 1: Run full validate**

Run: `npm run validate`

Expected: Typecheck and lint both pass with no errors.

- [ ] **Step 2: Run existing unit tests**

Run: `npm run test:unit`

Expected: All existing tests pass. No regressions.

- [ ] **Step 3: Run the dev server and verify visually**

Run: `npm run dev`

Load the app, import some WvW logs, and navigate to the stats dashboard. Verify:
1. "Strip Spikes" appears in the left TOC sidebar under Offensive Stats
2. Clicking it scrolls to the Strip Spikes section
3. The section shows a player list ranked by strip count
4. Clicking a player shows their per-fight strip trend chart
5. The mode toggle switches between Strips / Strip Time / Down Contrib
6. The expand button works
7. The chart tooltip displays fight name, player value, and fight max

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address visual verification issues for strip spikes"
```

(Skip this step if no fixes were needed.)
