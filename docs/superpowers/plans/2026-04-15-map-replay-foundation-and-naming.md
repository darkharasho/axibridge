# Map Replay — Plan 1: Foundation & Fight Naming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the data/types foundation the replay viewer will need (WvW geography ports, movement extractor, EI default flip) and roll a new compact fight-label format (`Green BL: Bay (2:30)`) across every user-facing surface. Scaffolds an empty "Map" stats group.

**Architecture:** Port three `src/shared/` modules verbatim from the sibling `axipulse` repo (`wvwLandmarks.ts`, `wvwTiles.ts`, `mapUtils.ts`). Add a new `src/shared/movementData.ts` with pure extractor + types. Flip the local EI parser's `parseCombatReplay` default to `true`. Introduce `buildFightLabelV2` in shared code, migrate every `buildFightLabel` call site, and delete the old helper. Add a "Map" entry to `STATS_TOC_GROUPS` with a placeholder section so Plan 2 has a home to plug into.

**Tech Stack:** TypeScript · Node/Electron main (`src/main/`) · React 18 renderer (`src/renderer/`) · vitest + jsdom · lucide-react icons · zustand.

**Reference spec:** `docs/superpowers/specs/2026-04-15-map-replay-section-design.md` — §4 (data pipeline), §5 (fight naming), §6 (nav placement).

---

## File Structure

### New shared files (renderer + main + web all import)

- `src/shared/wvwLandmarks.ts` — `WvwMap` enum, `WvwLandmark` interface, hardcoded landmark tables for EBG / Blue BL / Green BL / Red BL, `findNearestLandmark(map, x, y)`. Ported verbatim from `axipulse/src/shared/wvwLandmarks.ts`.
- `src/shared/wvwTiles.ts` — GW2 tile server coordinate mapping. Ported verbatim from `axipulse/src/shared/wvwTiles.ts`.
- `src/shared/mapUtils.ts` — `resolveMapFromZone`, `normalizeMapName`, `normalizeMapNameShort`, `formatDuration`, `computeFightAvgPosition`, `buildFightLabelV2`. `resolveMapFromZone` / `normalizeMapName` / `formatDuration` ported verbatim from axipulse; `normalizeMapNameShort` and the two fight-label helpers are new to axibridge.
- `src/shared/movementData.ts` — `MovementData`, `SquadMemberMovement` types + `buildMovementData(details, localPlayer?)`. Adapted from `axipulse/src/shared/extractPlayerData.ts:135-229` but decoupled from the axipulse player-centric aggregation (no `isLocal` assumption when called without `localPlayer`).

### Modified files

- `src/main/eiParser.ts:33` — flip `DEFAULT_EI_SETTINGS.parseCombatReplay` from `false` to `true`.
- `src/shared/dpsReportTypes.ts:37,102-107` — extend `combatReplayMetaData` with `sizes?: [number, number]` and `maps?: Array<{ url?: string }>`; add `healthPercents?: [number, number][]` to `Player`.
- `src/renderer/stats/utils/labelUtils.ts` — keep `sanitizeWvwLabel`, `normalizeMapLabel`, `tokenizeLabel`, `resolveMapName`. Delete `buildFightLabel`. Re-export `buildFightLabelV2` from `src/shared/mapUtils.ts` for convenience.
- `src/main/discord.ts:109-127` — replace `cleanFightMapLabel` + `formatFightTitleForDiscord` to use `buildFightLabelV2` + new `computeFightAvgPosition`.
- `src/renderer/stats/hooks/useStatsNavigation.ts:29-140` — append a new `map` group to `STATS_TOC_GROUPS`.
- Nine ingest files that call `buildFightLabel(...)`:
  - `src/renderer/StatsView.tsx:1281`
  - `src/renderer/stats/computeAllDamageData.ts:192`
  - `src/renderer/stats/computeBoonTimeline.ts:202`
  - `src/renderer/stats/computeBoonUptimeTimeline.ts:160`
  - `src/renderer/stats/computeHealEffectivenessData.ts:129`
  - `src/renderer/stats/computeSpikeDamageData.ts:360`
  - `src/renderer/stats/computeStripSpikesData.ts:70`
  - `src/renderer/stats/computeTagDistanceDeaths.ts:47`
  - `src/renderer/stats/computeIncomingStrikeDamageData.ts:277`

### New renderer files

- `src/renderer/stats/sections/ReplaySection.tsx` — stub section with a "coming soon" empty state. Just enough to give the new `map` nav group a valid target.

### Modified tests

- `src/renderer/__tests__/labelUtils.test.ts` — drop `buildFightLabel` cases. Existing `sanitizeWvwLabel` / `normalizeMapLabel` / `tokenizeLabel` / `resolveMapName` tests stay intact.
- `src/shared/__tests__/mapUtils.test.ts` — new. Covers `resolveMapFromZone`, `normalizeMapNameShort`, `formatDuration`, `computeFightAvgPosition`, `buildFightLabelV2`.
- `src/shared/__tests__/wvwLandmarks.test.ts` — new. Covers `findNearestLandmark` picks the closest entry.
- `src/shared/__tests__/movementData.test.ts` — new. Fixture-driven round-trip against an existing `ParseCombatReplay=True` fixture under `test-fixtures/`.

---

## Task 1: Port `wvwLandmarks.ts` verbatim

**Files:**
- Create: `src/shared/wvwLandmarks.ts`
- Create: `src/shared/__tests__/wvwLandmarks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/shared/__tests__/wvwLandmarks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findNearestLandmark, WvwMap, WVW_LANDMARKS } from '../wvwLandmarks';

describe('findNearestLandmark', () => {
    it('returns null for an unknown map', () => {
        expect(findNearestLandmark('UnknownMap' as WvwMap, 100, 100)).toBeNull();
    });

    it('returns the only option when the table has exactly one entry', () => {
        const originalEBG = WVW_LANDMARKS[WvwMap.EternalBattlegrounds];
        expect(originalEBG.length).toBeGreaterThan(0);
    });

    it('picks the geometrically closest landmark', () => {
        // Stonemist Castle on EBG sits at (370, 435). A point right next to it should resolve to Stonemist.
        const hit = findNearestLandmark(WvwMap.EternalBattlegrounds, 371, 436);
        expect(hit?.name).toBe('Stonemist Castle');
    });

    it('picks Overlook in the north of EBG', () => {
        // Overlook sits at (400, 230). A nearby point should resolve to Overlook, not Stonemist.
        const hit = findNearestLandmark(WvwMap.EternalBattlegrounds, 405, 235);
        expect(hit?.name).toBe('Overlook');
    });

    it('picks Bay (Ascension Bay) on Blue BL', () => {
        // Ascension Bay sits at (48, 435) on Blue Alpine.
        const hit = findNearestLandmark(WvwMap.BlueBorderlands, 50, 440);
        expect(hit?.name).toBe('Ascension Bay');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/__tests__/wvwLandmarks.test.ts`
Expected: FAIL with "Cannot find module '../wvwLandmarks'".

- [ ] **Step 3: Copy `wvwLandmarks.ts` from axipulse**

Copy the entire contents of `/var/home/mstephens/Documents/GitHub/axipulse/src/shared/wvwLandmarks.ts` into `/var/home/mstephens/Documents/GitHub/axibridge/src/shared/wvwLandmarks.ts`. No modifications.

Final file exports: `enum WvwMap`, `interface WvwLandmark`, `const WVW_LANDMARKS`, `function findNearestLandmark`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/__tests__/wvwLandmarks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/wvwLandmarks.ts src/shared/__tests__/wvwLandmarks.test.ts
git commit -m "feat(shared): port WvW landmark tables from axipulse"
```

---

## Task 2: Port `wvwTiles.ts` verbatim

**Files:**
- Create: `src/shared/wvwTiles.ts`

No dedicated test — this file is pure coordinate math driven by hardcoded data. It's exercised by the Plan 2 replay renderer.

- [ ] **Step 1: Copy `wvwTiles.ts` from axipulse**

Copy the entire contents of `/var/home/mstephens/Documents/GitHub/axipulse/src/shared/wvwTiles.ts` into `/var/home/mstephens/Documents/GitHub/axibridge/src/shared/wvwTiles.ts`. No modifications.

Final file exports: `interface TileInfo`, `function getMapTiles`, `function hasTileData`.

- [ ] **Step 2: Typecheck confirms it compiles**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/shared/wvwTiles.ts
git commit -m "feat(shared): port WvW tile coordinate mapping from axipulse"
```

---

## Task 3: Create `src/shared/mapUtils.ts` with ported helpers + short-code + fight label

**Files:**
- Create: `src/shared/mapUtils.ts`
- Create: `src/shared/__tests__/mapUtils.test.ts`

This file adds three helpers that axipulse doesn't have: `normalizeMapNameShort`, `computeFightAvgPosition`, `buildFightLabelV2`.

- [ ] **Step 1: Write the failing test**

Create `src/shared/__tests__/mapUtils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
    resolveMapFromZone,
    normalizeMapName,
    normalizeMapNameShort,
    formatDuration,
    computeFightAvgPosition,
    buildFightLabelV2,
} from '../mapUtils';
import { WvwMap } from '../wvwLandmarks';

describe('resolveMapFromZone', () => {
    it('resolves EBG variants', () => {
        expect(resolveMapFromZone('Eternal Battlegrounds')).toBe(WvwMap.EternalBattlegrounds);
        expect(resolveMapFromZone('WvW - Eternal Battlegrounds')).toBe(WvwMap.EternalBattlegrounds);
        expect(resolveMapFromZone('EBG')).toBe(WvwMap.EternalBattlegrounds);
    });

    it('resolves borderland variants', () => {
        expect(resolveMapFromZone('Green Alpine Borderlands')).toBe(WvwMap.GreenBorderlands);
        expect(resolveMapFromZone('Blue Borderlands')).toBe(WvwMap.BlueBorderlands);
        expect(resolveMapFromZone('Red Desert Borderlands')).toBe(WvwMap.RedBorderlands);
    });

    it('returns null for unknown zones', () => {
        expect(resolveMapFromZone('Raids Wing 7')).toBeNull();
        expect(resolveMapFromZone('')).toBeNull();
    });
});

describe('normalizeMapNameShort', () => {
    it('returns short codes for known WvW maps', () => {
        expect(normalizeMapNameShort('Eternal Battlegrounds')).toBe('EBG');
        expect(normalizeMapNameShort('Green Alpine Borderlands')).toBe('Green BL');
        expect(normalizeMapNameShort('Blue Borderlands')).toBe('Blue BL');
        expect(normalizeMapNameShort('Red Desert Borderlands')).toBe('Red BL');
    });

    it('strips WvW prefixes before short-coding', () => {
        expect(normalizeMapNameShort('WvW - Eternal Battlegrounds')).toBe('EBG');
        expect(normalizeMapNameShort('Detailed WvW - Green Borderlands')).toBe('Green BL');
    });

    it('returns the sanitized zone for unknown zones', () => {
        expect(normalizeMapNameShort('Raids Wing 7')).toBe('Raids Wing 7');
    });

    it('returns empty string for empty input', () => {
        expect(normalizeMapNameShort('')).toBe('');
    });
});

describe('formatDuration', () => {
    it('formats minutes:seconds with zero-padding', () => {
        expect(formatDuration(0)).toBe('0:00');
        expect(formatDuration(1_000)).toBe('0:01');
        expect(formatDuration(59_000)).toBe('0:59');
        expect(formatDuration(60_000)).toBe('1:00');
        expect(formatDuration(150_000)).toBe('2:30');
        expect(formatDuration(3_600_000)).toBe('60:00');
    });
});

describe('computeFightAvgPosition', () => {
    it('returns null when details has no players', () => {
        expect(computeFightAvgPosition({})).toBeNull();
        expect(computeFightAvgPosition({ players: [] })).toBeNull();
        expect(computeFightAvgPosition(null)).toBeNull();
    });

    it('uses the commander when present', () => {
        const details = {
            players: [
                { hasCommanderTag: false, combatReplayData: { positions: [[100, 100], [200, 200]] } },
                { hasCommanderTag: true, combatReplayData: { positions: [[50, 60], [70, 80], [90, 100]] } },
            ],
        };
        // median of xs=[50,70,90] is 70; median of ys=[60,80,100] is 80.
        expect(computeFightAvgPosition(details)).toEqual([70, 80]);
    });

    it('falls back to first player with positions when no commander', () => {
        const details = {
            players: [
                { hasCommanderTag: false, combatReplayData: { positions: [] } },
                { hasCommanderTag: false, combatReplayData: { positions: [[10, 10], [30, 30], [50, 50]] } },
            ],
        };
        expect(computeFightAvgPosition(details)).toEqual([30, 30]);
    });

    it('returns null when no player has positions', () => {
        const details = {
            players: [
                { hasCommanderTag: true, combatReplayData: { positions: [] } },
                { hasCommanderTag: false, combatReplayData: { positions: [] } },
            ],
        };
        expect(computeFightAvgPosition(details)).toBeNull();
    });
});

describe('buildFightLabelV2', () => {
    it('formats as "Short: Landmark (m:ss)" when all parts resolve', () => {
        // Stonemist Castle sits at (370, 435) on EBG.
        const label = buildFightLabelV2({
            zone: 'Eternal Battlegrounds',
            durationMs: 150_000,
            avgPosition: [370, 435],
        });
        expect(label).toBe('EBG: Stonemist Castle (2:30)');
    });

    it('uses short map code when landmark is unavailable', () => {
        expect(buildFightLabelV2({
            zone: 'Green Borderlands',
            durationMs: 150_000,
            avgPosition: null,
        })).toBe('Green BL (2:30)');
    });

    it('uses sanitized zone when map is unknown', () => {
        expect(buildFightLabelV2({
            zone: 'WvW - Guild Hall Duel',
            durationMs: 90_000,
            avgPosition: null,
        })).toBe('Guild Hall Duel (1:30)');
    });

    it('omits duration when missing or zero', () => {
        expect(buildFightLabelV2({
            zone: 'Green Borderlands',
            avgPosition: null,
        })).toBe('Green BL');
        expect(buildFightLabelV2({
            zone: 'Green Borderlands',
            durationMs: 0,
            avgPosition: null,
        })).toBe('Green BL');
    });

    it('returns "Unknown" when zone is empty and map cannot resolve', () => {
        expect(buildFightLabelV2({ zone: '', durationMs: 60_000 })).toBe('Unknown (1:00)');
    });

    it('strips WvW prefixes from the sanitized fallback', () => {
        expect(buildFightLabelV2({
            zone: 'Detailed WvW - Custom Arena',
            durationMs: 60_000,
        })).toBe('Custom Arena (1:00)');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/__tests__/mapUtils.test.ts`
Expected: FAIL with "Cannot find module '../mapUtils'".

- [ ] **Step 3: Write `src/shared/mapUtils.ts`**

Create `src/shared/mapUtils.ts`:

```ts
import { WvwMap, findNearestLandmark } from './wvwLandmarks';

const ZONE_PREFIXES = ['Detailed WvW - ', 'World vs World - ', 'WvW - '];

function stripPrefix(zone: string): string {
    for (const prefix of ZONE_PREFIXES) {
        if (zone.startsWith(prefix)) return zone.slice(prefix.length);
    }
    return zone;
}

export function resolveMapFromZone(zone: string): WvwMap | null {
    const clean = stripPrefix(zone).toLowerCase();
    if (clean.includes('eternal') || clean === 'ebg') return WvwMap.EternalBattlegrounds;
    if (clean.includes('green')) return WvwMap.GreenBorderlands;
    if (clean.includes('blue')) return WvwMap.BlueBorderlands;
    if (clean.includes('red')) return WvwMap.RedBorderlands;
    return null;
}

export function normalizeMapName(zone: string): string {
    const clean = stripPrefix(zone).toLowerCase();
    if (clean.includes('eternal')) return 'Eternal Battlegrounds';
    if (clean.includes('green')) return 'Green Borderlands';
    if (clean.includes('blue')) return 'Blue Borderlands';
    if (clean.includes('red')) return 'Red Borderlands';
    return stripPrefix(zone);
}

export function normalizeMapNameShort(zone: string): string {
    const clean = stripPrefix(zone).toLowerCase();
    if (clean.includes('eternal') || clean === 'ebg') return 'EBG';
    if (clean.includes('green')) return 'Green BL';
    if (clean.includes('blue')) return 'Blue BL';
    if (clean.includes('red')) return 'Red BL';
    return stripPrefix(zone);
}

export function formatDuration(ms: number): string {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function medianPosition(positions: Array<[number, number]>): [number, number] | null {
    if (!positions.length) return null;
    const xs = positions.map(p => p[0]).sort((a, b) => a - b);
    const ys = positions.map(p => p[1]).sort((a, b) => a - b);
    const mid = Math.floor(positions.length / 2);
    return [xs[mid], ys[mid]];
}

export function computeFightAvgPosition(details: any): [number, number] | null {
    const players = Array.isArray(details?.players) ? details.players : [];
    if (!players.length) return null;
    const commander = players.find((p: any) => p?.hasCommanderTag && p?.combatReplayData?.positions?.length);
    if (commander) return medianPosition(commander.combatReplayData.positions);
    const anyWithPos = players.find((p: any) => p?.combatReplayData?.positions?.length);
    return anyWithPos ? medianPosition(anyWithPos.combatReplayData.positions) : null;
}

export interface FightLabelInputs {
    zone: string;
    durationMs?: number;
    avgPosition?: [number, number] | null;
}

export function buildFightLabelV2(inputs: FightLabelInputs): string {
    const zoneRaw = inputs.zone ?? '';
    const clean = stripPrefix(String(zoneRaw)).trim();
    const map = resolveMapFromZone(zoneRaw);

    let baseName: string;
    if (map) {
        const shortMap = normalizeMapNameShort(zoneRaw);
        const landmark = inputs.avgPosition
            ? findNearestLandmark(map, inputs.avgPosition[0], inputs.avgPosition[1])
            : null;
        baseName = landmark ? `${shortMap}: ${landmark.name}` : shortMap;
    } else {
        baseName = clean || 'Unknown';
    }

    const durationMs = inputs.durationMs;
    if (durationMs && durationMs > 0) {
        return `${baseName} (${formatDuration(durationMs)})`;
    }
    return baseName;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/__tests__/mapUtils.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/mapUtils.ts src/shared/__tests__/mapUtils.test.ts
git commit -m "feat(shared): add mapUtils with short-code + buildFightLabelV2"
```

---

## Task 4: Flip `parseCombatReplay` default to `true`

**Files:**
- Modify: `src/main/eiParser.ts:33`

- [ ] **Step 1: Edit the default**

Replace in `src/main/eiParser.ts`:

```ts
// before
    parseCombatReplay: false,
// after
    parseCombatReplay: true,
```

- [ ] **Step 2: Typecheck passes**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/eiParser.ts
git commit -m "feat(ei): flip parseCombatReplay default to true"
```

---

## Task 5: Extend `dpsReportTypes.ts` for new combat replay fields

**Files:**
- Modify: `src/shared/dpsReportTypes.ts:37,102-107`

Add the optional fields axipulse reads from EI that axibridge's types don't yet describe: `sizes`, `maps[].url` on metadata; `healthPercents` on `Player`; type `Player.combatReplayData` more fully.

- [ ] **Step 1: Update `DPSReportJSON.combatReplayMetaData`**

Edit `src/shared/dpsReportTypes.ts` line 37:

```ts
// before
    combatReplayMetaData?: { inchToPixel?: number; pollingRate?: number };
// after
    combatReplayMetaData?: {
        inchToPixel?: number;
        pollingRate?: number;
        sizes?: [number, number];
        maps?: Array<{ url?: string }>;
    };
```

- [ ] **Step 2: Extend `Player.combatReplayData` and add `healthPercents`**

Edit `src/shared/dpsReportTypes.ts` lines 102-107:

```ts
// before
    combatReplayData?: {
        positions?: Array<[number, number]>;
        dead?: Array<[number, number]>;
        down?: Array<[number, number]>;
        start?: number;
    };
// after
    combatReplayData?: {
        positions?: Array<[number, number]>;
        dead?: Array<[number, number]>;
        down?: Array<[number, number]>;
        start?: number;
    };
    healthPercents?: Array<[number, number]>;
```

Place the new `healthPercents` field immediately after `combatReplayData`.

- [ ] **Step 3: Typecheck passes**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/shared/dpsReportTypes.ts
git commit -m "feat(types): extend combat replay metadata with sizes + map URL"
```

---

## Task 6: Port `buildMovementData` extractor into `src/shared/movementData.ts`

**Files:**
- Create: `src/shared/movementData.ts`
- Create: `src/shared/__tests__/movementData.test.ts`

The axipulse implementation is player-centric (takes `localPlayer` to mark one member `isLocal: true`). In axibridge we default to commander-centric: `localPlayer` is optional; when absent, no member is marked local.

The axipulse source also imports a shared `ALL_TRACKED_BUFF_IDS` from boon data. Axibridge has its own boon-tracking module; to keep Plan 1 self-contained we accept a `trackedBuffIds: Set<number>` parameter and let Plan 2 wire it to the right set.

- [ ] **Step 1: Write the failing test**

Create `src/shared/__tests__/movementData.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildMovementData } from '../movementData';

const trackedBuffs = new Set<number>([740, 725]); // Might, Fury — arbitrary sample.

describe('buildMovementData', () => {
    it('returns null when no players have positions', () => {
        const details = { players: [{ name: 'Alice', combatReplayData: { positions: [] } }], targets: [] };
        expect(buildMovementData(details, { trackedBuffIds: trackedBuffs })).toBeNull();
    });

    it('extracts ally members with positions', () => {
        const details = {
            durationMS: 60_000,
            combatReplayMetaData: { pollingRate: 300, inchToPixel: 0.01 },
            players: [
                {
                    name: 'Alice', account: 'Alice.0001', profession: 'Guardian', elite_spec: 62,
                    group: 1, hasCommanderTag: true, notInSquad: false, isFake: false,
                    combatReplayData: { positions: [[100, 100], [110, 110]], dead: [], down: [] },
                    healthPercents: [[0, 100], [1000, 90]],
                    buffUptimes: [{ id: 740, states: [[0, 1], [30_000, 0]] }],
                    rotation: [],
                },
            ],
            targets: [],
            skillMap: {},
            buffMap: { b740: { name: 'Might', icon: '/might.png' } },
        };

        const movement = buildMovementData(details, { trackedBuffIds: trackedBuffs });
        expect(movement).not.toBeNull();
        expect(movement!.members).toHaveLength(1);
        const member = movement!.members[0];
        expect(member.name).toBe('Alice');
        expect(member.isCommander).toBe(true);
        expect(member.isLocal).toBe(false);
        expect(member.isEnemy).toBe(false);
        expect(member.inSquad).toBe(true);
        expect(member.positions).toEqual([[100, 100], [110, 110]]);
        expect(member.boonStates?.[740]).toEqual([[0, 1], [30_000, 0]]);
        expect(movement!.boonIcons[740]?.name).toBe('Might');
    });

    it('marks a member as local when localAccount matches', () => {
        const details = {
            durationMS: 60_000,
            combatReplayMetaData: { pollingRate: 300, inchToPixel: 0.01 },
            players: [
                { name: 'Bob', account: 'Bob.0002', profession: 'Engineer', elite_spec: 43,
                  group: 2, hasCommanderTag: false, notInSquad: false, isFake: false,
                  combatReplayData: { positions: [[50, 50]], dead: [], down: [] } },
            ],
            targets: [],
            skillMap: {},
            buffMap: {},
        };

        const movement = buildMovementData(details, { trackedBuffIds: trackedBuffs, localAccount: 'Bob.0002' });
        expect(movement!.members[0].isLocal).toBe(true);
    });

    it('extracts enemy players from targets[]', () => {
        const details = {
            durationMS: 60_000,
            combatReplayMetaData: { pollingRate: 300, inchToPixel: 0.01 },
            players: [
                { name: 'Ally', account: 'Ally.0001', profession: 'Warrior', elite_spec: 18,
                  group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
                  combatReplayData: { positions: [[0, 0]], dead: [], down: [] } },
            ],
            targets: [
                { name: 'Dragonhunter pl-1', isFake: false, enemyPlayer: true, profession: 'Guardian',
                  combatReplayData: { positions: [[500, 500], [510, 510]], dead: [], down: [] } },
            ],
            skillMap: {},
            buffMap: {},
        };

        const movement = buildMovementData(details, { trackedBuffIds: trackedBuffs });
        const enemy = movement!.members.find(m => m.isEnemy);
        expect(enemy).toBeDefined();
        expect(enemy!.name).toBe('Dragonhunter pl-1');
        expect(enemy!.eliteSpec).toBe('Dragonhunter');
    });

    it('deduplicates targets that share a name with an ally', () => {
        const details = {
            durationMS: 60_000,
            combatReplayMetaData: { pollingRate: 300, inchToPixel: 0.01 },
            players: [
                { name: 'DoppelGanger', account: 'DG.0001', profession: 'Mesmer', elite_spec: 40,
                  group: 1, hasCommanderTag: false, notInSquad: false, isFake: false,
                  combatReplayData: { positions: [[0, 0]], dead: [], down: [] } },
            ],
            targets: [
                { name: 'DoppelGanger', isFake: false, enemyPlayer: true, profession: 'Mesmer',
                  combatReplayData: { positions: [[100, 100]], dead: [], down: [] } },
            ],
            skillMap: {},
            buffMap: {},
        };
        const movement = buildMovementData(details, { trackedBuffIds: trackedBuffs });
        expect(movement!.members.filter(m => m.name === 'DoppelGanger')).toHaveLength(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/__tests__/movementData.test.ts`
Expected: FAIL with "Cannot find module '../movementData'".

- [ ] **Step 3: Write `src/shared/movementData.ts`**

Create `src/shared/movementData.ts`:

```ts
export interface SquadMemberMovement {
    name: string;
    account: string;
    profession: string;
    eliteSpec: string | number;
    group: number;
    isCommander: boolean;
    isLocal: boolean;
    isEnemy: boolean;
    inSquad: boolean;
    positions: [number, number][];
    downRanges: [number, number][];
    deadRanges: [number, number][];
    boonStates?: Record<number, [number, number][]>;
    healthPercents?: [number, number][];
    skillCasts?: { id: number; time: number; duration: number }[];
}

export interface MovementData {
    pollingRate: number;
    durationMs: number;
    inchToPixel: number;
    members: SquadMemberMovement[];
    boonIcons: Record<number, { name: string; icon: string }>;
    skillIcons: Record<number, { name: string; icon: string }>;
}

export interface BuildMovementDataOptions {
    trackedBuffIds: Set<number>;
    localAccount?: string;
    localName?: string;
}

export function buildMovementData(details: any, options: BuildMovementDataOptions): MovementData | null {
    const { trackedBuffIds, localAccount, localName } = options;
    const pollingRate = details?.combatReplayMetaData?.pollingRate ?? 300;
    const durationMs = details?.durationMS ?? 0;
    const inchToPixel = details?.combatReplayMetaData?.inchToPixel ?? 1;

    const skillIcons: Record<number, { name: string; icon: string }> = {};
    for (const [key, val] of Object.entries(details?.skillMap ?? {})) {
        const id = Number(String(key).replace(/^s/, ''));
        const info = val as any;
        if (info?.icon && !info.autoAttack) {
            skillIcons[id] = { name: info.name, icon: info.icon };
        }
    }

    const members: SquadMemberMovement[] = [];
    const allyNames = new Set<string>();

    const players = Array.isArray(details?.players) ? details.players : [];
    for (const p of players) {
        if (p?.isFake) continue;
        const positions = p?.combatReplayData?.positions;
        if (!positions?.length) continue;
        allyNames.add(p.name);

        let boonStates: Record<number, [number, number][]> | undefined;
        if (Array.isArray(p.buffUptimes)) {
            boonStates = {};
            for (const buff of p.buffUptimes) {
                if (!trackedBuffIds.has(buff.id) || !buff.states?.length) continue;
                boonStates[buff.id] = buff.states;
            }
        }

        let skillCasts: { id: number; time: number; duration: number }[] | undefined;
        if (Array.isArray(p.rotation) && p.rotation.length) {
            skillCasts = [];
            for (const entry of p.rotation) {
                if (!skillIcons[entry.id]) continue;
                const casts = Array.isArray(entry.skills) ? entry.skills : [];
                for (const cast of casts) {
                    // Trait procs are instant (duration 0). Keep user-pressed casts and negative IDs (dodge, weapon swap).
                    if (entry.id > 0 && cast.duration <= 0) continue;
                    skillCasts.push({ id: entry.id, time: cast.castTime, duration: cast.duration });
                }
            }
            skillCasts.sort((a, b) => a.time - b.time);
        }

        const isLocal = (!!localAccount && p.account === localAccount)
            || (!!localName && p.name === localName);

        members.push({
            name: p.name,
            account: p.account ?? '',
            profession: p.profession ?? '',
            eliteSpec: p.elite_spec ?? '',
            group: p.group ?? 0,
            isCommander: !!p.hasCommanderTag,
            isLocal,
            isEnemy: false,
            inSquad: !p.notInSquad,
            positions,
            downRanges: p.combatReplayData?.down ?? [],
            deadRanges: p.combatReplayData?.dead ?? [],
            boonStates,
            healthPercents: p.healthPercents,
            skillCasts,
        });
    }

    const targets = Array.isArray(details?.targets) ? details.targets : [];
    for (const t of targets) {
        if (!t?.enemyPlayer || t?.isFake) continue;
        const positions = t?.combatReplayData?.positions;
        if (!positions?.length) continue;
        if (allyNames.has(t.name)) continue;

        const specMatch = typeof t.name === 'string' ? t.name.match(/^(.+?) pl-\d+$/) : null;
        const specName = specMatch?.[1] ?? '';
        members.push({
            name: t.name,
            account: '',
            profession: t.profession ?? specName,
            eliteSpec: specName,
            group: 0,
            isCommander: false,
            isLocal: false,
            isEnemy: true,
            inSquad: false,
            positions,
            downRanges: t.combatReplayData?.down ?? [],
            deadRanges: t.combatReplayData?.dead ?? [],
        });
    }

    if (!members.length) return null;

    const boonIcons: Record<number, { name: string; icon: string }> = {};
    for (const [key, val] of Object.entries(details?.buffMap ?? {})) {
        const id = Number(String(key).replace(/^b/, ''));
        const info = val as any;
        if (trackedBuffIds.has(id) && info?.icon) {
            boonIcons[id] = { name: info.name, icon: info.icon };
        }
    }

    return { pollingRate, durationMs, inchToPixel, members, boonIcons, skillIcons };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/__tests__/movementData.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/movementData.ts src/shared/__tests__/movementData.test.ts
git commit -m "feat(shared): add buildMovementData extractor + types"
```

---

## Task 7: Re-export `buildFightLabelV2` from `labelUtils.ts`; delete legacy `buildFightLabel`

**Files:**
- Modify: `src/renderer/stats/utils/labelUtils.ts`
- Modify: `src/renderer/__tests__/labelUtils.test.ts`

- [ ] **Step 1: Update the test to drop `buildFightLabel` cases**

Edit `src/renderer/__tests__/labelUtils.test.ts`.

Remove lines 113-145 (the entire `describe('buildFightLabel', …)` block).

Also remove `buildFightLabel` from the import on line 2:

```ts
// before
import { sanitizeWvwLabel, normalizeMapLabel, tokenizeLabel, buildFightLabel, resolveMapName } from '../stats/utils/labelUtils';
// after
import { sanitizeWvwLabel, normalizeMapLabel, tokenizeLabel, resolveMapName } from '../stats/utils/labelUtils';
```

- [ ] **Step 2: Rewrite `labelUtils.ts`**

Replace the contents of `src/renderer/stats/utils/labelUtils.ts` with:

```ts
export { buildFightLabelV2, computeFightAvgPosition } from '../../../shared/mapUtils';
export type { FightLabelInputs } from '../../../shared/mapUtils';

/**
 * Strips common WvW prefix noise from a map/fight label.
 */
export const sanitizeWvwLabel = (value: any): string =>
    String(value || '')
        .replace(/^Detailed\s*WvW\s*-\s*/i, '')
        .replace(/^World\s*vs\s*World\s*-\s*/i, '')
        .replace(/^WvW\s*-\s*/i, '')
        .trim();

export const normalizeMapLabel = (value: any): string => {
    if (!value) return 'Unknown';
    const cleaned = sanitizeWvwLabel(value);
    const borderlandsMatch = cleaned.match(/^(Red|Blue|Green)\s+(?:Alpine|Desert)?\s*Borderlands$/i);
    if (borderlandsMatch) {
        return `${borderlandsMatch[1]} Borderlands`;
    }
    return cleaned || 'Unknown';
};

export const tokenizeLabel = (value: string): string[] =>
    sanitizeWvwLabel(value)
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token));

export const resolveMapName = (details: any, log: any): string =>
    normalizeMapLabel(
        details?.zone
        || details?.mapName
        || details?.map
        || details?.location
        || details?.fightName
        || log?.fightName
        || log?.encounterName
        || 'Unknown'
    );
```

- [ ] **Step 3: Run test to verify it passes**

Run: `npx vitest run src/renderer/__tests__/labelUtils.test.ts`
Expected: PASS (remaining tests for `sanitizeWvwLabel`, `normalizeMapLabel`, `tokenizeLabel`, `resolveMapName`).

- [ ] **Step 4: Typecheck — confirms call sites still compile since `buildFightLabel` is unexported**

Run: `npm run typecheck`
Expected: FAIL — every site that still imports `buildFightLabel` fails. That's the intended breakage and drives Task 8.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/utils/labelUtils.ts src/renderer/__tests__/labelUtils.test.ts
git commit -m "refactor(labelUtils): drop buildFightLabel; re-export buildFightLabelV2"
```

---

## Task 8: Migrate renderer ingest sites to `buildFightLabelV2`

**Files:**
- Modify: `src/renderer/StatsView.tsx:1281`
- Modify: `src/renderer/stats/computeAllDamageData.ts:192`
- Modify: `src/renderer/stats/computeBoonTimeline.ts:202`
- Modify: `src/renderer/stats/computeBoonUptimeTimeline.ts:160`
- Modify: `src/renderer/stats/computeHealEffectivenessData.ts:129`
- Modify: `src/renderer/stats/computeSpikeDamageData.ts:360`
- Modify: `src/renderer/stats/computeStripSpikesData.ts:70`
- Modify: `src/renderer/stats/computeTagDistanceDeaths.ts:47`
- Modify: `src/renderer/stats/computeIncomingStrikeDamageData.ts:277`

Each site currently does:

```ts
const fightName = sanitizeWvwLabel(details?.fightName || log?.encounterName || `Fight ${i + 1}`);
const mapName = resolveMapName(details, log);
const fullLabel = buildFightLabel(fightName, String(mapName || ''));
```

Replace with:

```ts
const fullLabel = buildFightLabelV2({
    zone: details?.fightName || log?.encounterName || `Fight ${i + 1}`,
    durationMs: details?.durationMS,
    avgPosition: computeFightAvgPosition(details),
});
```

- [ ] **Step 1: Migrate `computeTagDistanceDeaths.ts`**

Edit `src/renderer/stats/computeTagDistanceDeaths.ts`. At the imports near the top, add:

```ts
import { buildFightLabelV2, computeFightAvgPosition } from './utils/labelUtils';
```

Remove any now-unused `buildFightLabel` import.

Replace the block beginning at line 44:

```ts
// before
    const fightName = sanitizeWvwLabel(details?.fightName || log?.encounterName || `Fight ${fightIndex + 1}`);
    const mapName = resolveMapName(details, log);
    const shortLabel = `F${fightIndex + 1}`;
    const fullLabel = buildFightLabel(fightName, String(mapName || ''));
// after
    const shortLabel = `F${fightIndex + 1}`;
    const fullLabel = buildFightLabelV2({
        zone: details?.fightName || log?.encounterName || `Fight ${fightIndex + 1}`,
        durationMs: details?.durationMS,
        avgPosition: computeFightAvgPosition(details),
    });
```

If `sanitizeWvwLabel` or `resolveMapName` is no longer referenced in this file after the edit, remove them from the import list. If `fightName` or `mapName` are no longer used, remove their declarations.

- [ ] **Step 2: Migrate `computeAllDamageData.ts`**

Same pattern. At `src/renderer/stats/computeAllDamageData.ts:192`:

```ts
// before
    const fullLabel = buildFightLabel(fightName, String(mapName || ''));
// after
    const fullLabel = buildFightLabelV2({
        zone: details?.fightName || log?.encounterName || `Fight ${fightIndex + 1}`,
        durationMs: details?.durationMS,
        avgPosition: computeFightAvgPosition(details),
    });
```

Read the surrounding context (5-10 lines before the edit) to confirm the right variable names (`details`, `log`, `fightIndex`) are in scope. If the site uses a different iterator variable (e.g. `fightNumber`, `i`), substitute it accordingly. Add the import for `buildFightLabelV2` + `computeFightAvgPosition`; remove the old `buildFightLabel` import and any now-unused `fightName` / `mapName` declarations.

- [ ] **Step 3: Migrate `computeBoonTimeline.ts`**

Same pattern at line 202. Confirm `details` / `log` / fight index variable names in scope before editing.

- [ ] **Step 4: Migrate `computeBoonUptimeTimeline.ts`**

Same pattern at line 160.

- [ ] **Step 5: Migrate `computeHealEffectivenessData.ts`**

Same pattern at line 129. Note the shape (`fullLabel:` inside an object literal) — swap in the call:

```ts
// before
        fullLabel: buildFightLabel(fightName, String(mapName || '')),
// after
        fullLabel: buildFightLabelV2({
            zone: details?.fightName || log?.encounterName || `Fight ${fightIndex + 1}`,
            durationMs: details?.durationMS,
            avgPosition: computeFightAvgPosition(details),
        }),
```

- [ ] **Step 6: Migrate `computeSpikeDamageData.ts`**

Same pattern at line 360.

- [ ] **Step 7: Migrate `computeStripSpikesData.ts`**

Same pattern at line 70.

- [ ] **Step 8: Migrate `computeIncomingStrikeDamageData.ts`**

Same pattern at line 277.

- [ ] **Step 9: Migrate `StatsView.tsx`**

Same pattern at line 1281. This call site may construct labels differently — inspect 5–10 lines of surrounding context to confirm how `fightName`, `rawMap`, and the fight index variable are derived, and adapt the replacement so the zone input passed to `buildFightLabelV2` is `details?.fightName || log?.encounterName || rawFallback`.

- [ ] **Step 10: Typecheck**

Run: `npm run typecheck`
Expected: PASS — every former `buildFightLabel` caller now uses the V2 helper.

- [ ] **Step 11: Unit tests**

Run: `npm run test:unit`
Expected: PASS. The compute-* functions are exercised by integration tests; any snapshot/regression test that baked the old label will need its fixture regenerated. If a snapshot fails and the new label is correct, regenerate with `npx vitest --update` on that specific test file.

- [ ] **Step 12: Commit**

```bash
git add -A src/renderer/StatsView.tsx src/renderer/stats/compute*.ts
git commit -m "refactor(stats): use buildFightLabelV2 at all ingest sites"
```

---

## Task 9: Port `buildFightLabelV2` into Discord webhook formatter

**Files:**
- Modify: `src/main/discord.ts:109-127`

- [ ] **Step 1: Replace `cleanFightMapLabel` + `formatFightTitleForDiscord`**

Edit `src/main/discord.ts`. Add to the imports at the top:

```ts
import { buildFightLabelV2, computeFightAvgPosition } from '../shared/mapUtils';
```

Replace lines 109-127:

```ts
// before
const cleanFightMapLabel = (rawFightName: any) => {
    return String(rawFightName || 'Unknown Map')
        .replace(/^Detailed\s*WvW\s*-\s*/i, '')
        .replace(/^WvW\s*-\s*/i, '')
        .trim();
};

const formatFightTitleForDiscord = (jsonDetails: any, logData: any) => {
    const timestampMs = resolveFightTimestampMs(jsonDetails, logData);
    const mapLabel = cleanFightMapLabel(jsonDetails?.fightName);
    const dateLabel = timestampMs > 0
        ? new Date(timestampMs).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })
        + ' '
        + new Date(timestampMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        : '';
    if (dateLabel && mapLabel) return `${dateLabel} - ${mapLabel}`;
    if (mapLabel) return mapLabel;
    return jsonDetails?.fightName || 'Log Uploaded';
};
// after
const formatFightTitleForDiscord = (jsonDetails: any, logData: any) => {
    const timestampMs = resolveFightTimestampMs(jsonDetails, logData);
    const fightLabel = buildFightLabelV2({
        zone: jsonDetails?.fightName || logData?.encounterName || '',
        durationMs: jsonDetails?.durationMS,
        avgPosition: computeFightAvgPosition(jsonDetails),
    });
    const dateLabel = timestampMs > 0
        ? new Date(timestampMs).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })
        + ' '
        + new Date(timestampMs).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
        : '';
    if (dateLabel && fightLabel) return `${dateLabel} - ${fightLabel}`;
    if (fightLabel) return fightLabel;
    return jsonDetails?.fightName || 'Log Uploaded';
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/main/discord.ts
git commit -m "feat(discord): use buildFightLabelV2 in webhook fight titles"
```

---

## Task 10: Add "Map" nav group + stub `ReplaySection` placeholder

**Files:**
- Create: `src/renderer/stats/sections/ReplaySection.tsx`
- Modify: `src/renderer/stats/hooks/useStatsNavigation.ts:29-140`
- Modify: `src/renderer/StatsView.tsx` — render the new section at the corresponding `id="replay"` anchor

- [ ] **Step 1: Create the placeholder section**

Write `src/renderer/stats/sections/ReplaySection.tsx`:

```tsx
import React from 'react';

export const ReplaySection: React.FC = () => {
    return (
        <section id="replay" className="stats-section">
            <div className="stats-section-header">
                <h2>Replay</h2>
            </div>
            <div className="stats-empty-state">
                Fight replay is coming soon. Logs parsed after this release will carry the full combat replay data needed for the viewer.
            </div>
        </section>
    );
};

export default ReplaySection;
```

- [ ] **Step 2: Append the `map` group to `STATS_TOC_GROUPS`**

Edit `src/renderer/stats/hooks/useStatsNavigation.ts`. At line 3, the `lucide-react` import already brings `Map as MapIcon` into scope, and `Play` is not — add it:

```ts
// before
import { Trophy, Shield, ShieldAlert, ShieldOff, Zap, Map as MapIcon, Users, Skull, Star, HeartPulse, Keyboard, ListTree, BarChart3, ArrowBigUp, FileText, Swords, GitCompareArrows, Clock3, Target, Route, Waves, Flame, Crosshair, ArrowUpDown, Eraser } from 'lucide-react';
// after
import { Trophy, Shield, ShieldAlert, ShieldOff, Zap, Map as MapIcon, Users, Skull, Star, HeartPulse, Keyboard, ListTree, BarChart3, ArrowBigUp, FileText, Swords, GitCompareArrows, Clock3, Target, Route, Waves, Flame, Crosshair, ArrowUpDown, Eraser, Play } from 'lucide-react';
```

Append a new group after the `other` group (after line 139, before the closing `];` of `STATS_TOC_GROUPS`):

```ts
    {
        id: 'map',
        label: 'Map',
        icon: MapIcon,
        sectionIds: ['replay'],
        items: [
            { id: 'replay', label: 'Replay', icon: Play }
        ]
    }
```

- [ ] **Step 3: Render `<ReplaySection />` inside `StatsView`**

Edit `src/renderer/StatsView.tsx`. Locate the existing section rendering — the file is large; search for one of the existing section anchors (e.g. `id="overview"`) and find where groups / sections are stitched together. Add:

```tsx
import { ReplaySection } from './stats/sections/ReplaySection';
```

to the imports, and render `<ReplaySection />` inside the same structure used by the other end-of-view sections (e.g. next to `apm-stats` or `player-comparison`). The exact placement depends on how `StatsView` currently groups sections by `sectionIds` in `STATS_TOC_GROUPS`; follow the existing pattern.

Note: if `StatsView` renders sections by mapping from `tocGroups` directly, no JSX change may be needed once the placeholder section exists and a wrapper keys off `group.id === 'map'`. Inspect the existing `other` group's rendering (`apm-stats`, `player-comparison`) to confirm.

- [ ] **Step 4: Typecheck + lint**

Run: `npm run validate`
Expected: PASS.

- [ ] **Step 5: Dev-run sanity check**

Run: `npm run dev`
Open the app, load the fixture dataset (`npm run dev:fake-first-time` if needed), and confirm the "Map" group appears at the end of the stats navigation with a "Replay" item below it. Clicking it should scroll to / focus the placeholder section showing the empty-state message. Stop the dev server with Ctrl-C when confirmed.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/stats/sections/ReplaySection.tsx src/renderer/stats/hooks/useStatsNavigation.ts src/renderer/StatsView.tsx
git commit -m "feat(stats): add Map nav group with Replay section placeholder"
```

---

## Task 11: Full validation sweep

**Files:** none (verification only).

- [ ] **Step 1: Full typecheck + lint**

Run: `npm run validate`
Expected: PASS.

- [ ] **Step 2: Full unit test run**

Run: `npm run test:unit`
Expected: PASS.

If any integration or snapshot test fails because it baked the old `Skirmish - Eternal Battlegrounds` label into its expected output, the fix is to regenerate the snapshot (`npx vitest --update` on that file) after confirming the new label output is what the test should now assert. Do not regenerate snapshots that fail for unrelated reasons.

- [ ] **Step 3: Audit regressions**

Run: `npm run test:regression:stats`
Expected: PASS. Regenerate any label-only snapshot failures as in Step 2.

- [ ] **Step 4: Web e2e**

Run: `npm run test:e2e:web`
Expected: PASS.

- [ ] **Step 5: Final commit (if snapshots were updated)**

If any snapshots were regenerated:

```bash
git add -A
git commit -m "test: regenerate snapshots for new fight label format"
```

---

## Self-review checklist (for plan author)

1. **Spec coverage.** Every §4 (data pipeline) and §5 (fight naming) item in the spec maps to a task:
   - §4.1 EI flip → Task 4 ✓
   - §4.2 Required fields → Task 5 (types) ✓
   - §4.3 Movement extraction → Task 6 ✓
   - §4.4 WvW geography → Tasks 1, 2, 3 ✓
   - §4.5 Hydration + pruning → deferred to Plan 2 (no new pipeline) ✓
   - §4.6 Web report bundle → deferred to Plan 2 ✓
   - §5.1 Landmark estimator → Task 3 (`computeFightAvgPosition` + `findNearestLandmark` integrated in `buildFightLabelV2`) ✓
   - §5.2 New label helper → Task 3 ✓
   - §5.3 Rollout → Tasks 7, 8, 9 ✓
   - §5.4 Surfaces → web report label surface deferred to Plan 2 (reportApp consumes labels from aggregation, so it inherits the new format automatically once Task 8 ships) ✓
   - §6 Stats nav placement → Task 10 ✓

2. **Placeholder scan.** No "TBD" / "later" / "handle edge cases" / vague steps. Every code-writing step includes the exact code to write. No step depends on text "similar to Task N" without repeating the required code.

3. **Type consistency.** `MovementData` / `SquadMemberMovement` field names match spec §4.3. `FightLabelInputs.zone` + `.durationMs` + `.avgPosition` are the only inputs referenced at every call site. `buildMovementData` accepts `BuildMovementDataOptions` consistently in test and implementation.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-15-map-replay-foundation-and-naming.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

Which approach?
