# Replay Zone Outlines (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Outline every WvW map sector on the combat replay in its owning team's colour, with independent (inner-aligned) shared sides, driven by real GW2 API sector polygons and an optional per-log match-ownership snapshot.

**Architecture:** A generator script bakes GW2 API sector polygons (converted to EI pixel space) into a committed `src/shared/wvwSectors.ts`. A new `SectorOutlineLayer` SVG component renders them in `ReplayView` (desktop + web share it) behind a new Layers toggle. A renderer-side hook snapshots `/v2/wvw/matches/<id>` ownership onto fresh logs (`ILogData.sectorOwners`), threaded into `ReplayFightPayload`.

**Tech Stack:** React 18 + TypeScript (strict), SVG, zustand (`useStatsStore`), vitest + jsdom + @testing-library/react, Node ≥18 `.mjs` script (global fetch), GW2 API v2.

**Spec:** `docs/superpowers/specs/2026-07-31-replay-zone-outlines-design.md`

## Global Constraints

- Run vitest with `--maxWorkers=2` (machine constraint, see root CLAUDE.md).
- `npm run validate` (typecheck + eslint `--max-warnings 0`) must pass before the final commit.
- No meaningful report.json growth: per-log ownership snapshot only (~200 B); polygons are bundled code, never payload.
- Follow existing code style: inline `style={{}}` objects, CSS vars (`var(--text-muted)` etc.), 4-space indent, single quotes.
- Old logs / unset match / unknown owner → neutral slate outlines. Never throw; the layer degrades to nothing on missing data.
- Outline visual: ~2 screen px, inner-aligned via per-sector `clipPath` (stroke at 2× width clipped to polygon interior) so shared sides render independently.
- Colours: Red `#ef4444`, Blue `#3b82f6`, Green `#22c55e`, neutral/unknown `rgba(148,163,184,0.55)`, stroke opacity 0.9.
- Commit after every task (conventional commits, `feat(replay): …` / `test: …` / `chore: …`).

## Verified API facts (probed live 2026-07-31, do not re-derive)

- Sector polygons: `https://api.guildwars2.com/v2/continents/2/floors/3` → `.regions["7"].maps[<id>].sectors` — maps `38` (EBG), `95` (Green Alpine), `96` (Blue Alpine), `1099` (Red Desert). ~21 sectors each with `bounds: [x,y][]` in continent coords.
- Objective→sector: `https://api.guildwars2.com/v2/wvw/objectives?ids=all` → each has `id` ("95-33"), `map_id`, `sector_id`. Example: `95-33` = Dreadfall Bay Keep → `sector_id: 999`.
- Matches: `https://api.guildwars2.com/v2/wvw/matches` → ids `["2-1"…"2-5","1-1"…"1-4"]` (region `1`=NA, `2`=EU; second number = tier; ids stable across weeks). `/v2/wvw/matches/<id>` → `maps[]` with `{id, type, objectives[]}`; every objective (Camps, Towers, Keeps, Castle, **and Spawn**) has `owner: "Red"|"Blue"|"Green"|"Neutral"`.
- There is **no** `/v2/wvw/teams` endpoint and `/v2/worlds` has no team-era entries — hence the match picker, not a team dropdown.

---

### Task 1: Sector data generator + `wvwSectors.ts`

**Files:**
- Create: `scripts/generate-wvw-sectors.mjs`
- Create: `src/shared/wvwSectors.ts` (generated output, committed)
- Create: `src/shared/__tests__/wvwSectors.test.ts`
- Modify: `package.json` (add script `"generate:wvw-sectors": "node scripts/generate-wvw-sectors.mjs"` next to the other `generate:*` entries)

**Interfaces:**
- Consumes: `WvwMap` enum from `src/shared/wvwLandmarks.ts` (values: `EternalBattlegrounds`, `GreenBorderlands`, `BlueBorderlands`, `RedBorderlands`).
- Produces (exact exports of `src/shared/wvwSectors.ts`, relied on by Tasks 2, 3, 5):

```ts
export type WvwOwner = 'Red' | 'Blue' | 'Green' | 'Neutral';
export interface WvwSector { id: number; name: string; bounds: [number, number][]; }
export const WVW_MAP_IDS: Record<WvwMap, number>;            // EBG 38, Green 95, Blue 96, Red 1099
export const WVW_SECTOR_REF_SIZE: Record<WvwMap, [number, number]>; // EBG [716,750], Alpines [523,750], Red [750,750]
export const WVW_SECTORS: Record<WvwMap, WvwSector[]>;       // bounds in EI pixel space
export const OBJECTIVE_SECTORS: Record<string, number>;      // "95-33" -> 999, all four maps
```

- [ ] **Step 1: Write the generator script**

`scripts/generate-wvw-sectors.mjs` — no dependencies, Node ≥18. The conversion constants are intentionally duplicated from `WVW_TILE_DATA` in `src/shared/wvwTiles.ts` (that module doesn't export them); the containment tests in Step 4 catch drift.

```js
// Regenerates src/shared/wvwSectors.ts from the GW2 API.
// Usage: npm run generate:wvw-sectors
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'shared', 'wvwSectors.ts');

// Keep in sync with WVW_TILE_DATA in src/shared/wvwTiles.ts (continentRect, pixelSize, pixelOffset).
const MAPS = {
    EternalBattlegrounds: { apiId: 38,   rect: [[8958, 12798], [12030, 15870]], size: [716, 750], offset: [-14, 20] },
    GreenBorderlands:     { apiId: 95,   rect: [[5630, 11518], [8190, 15102]],  size: [523, 750], offset: [0, 0] },
    BlueBorderlands:      { apiId: 96,   rect: [[12798, 10878], [15358, 14462]], size: [523, 750], offset: [0, 0] },
    RedBorderlands:       { apiId: 1099, rect: [[9214, 8958], [12286, 12030]],  size: [750, 750], offset: [0, 0] },
};

const floor = await (await fetch('https://api.guildwars2.com/v2/continents/2/floors/3')).json();
const objectives = await (await fetch('https://api.guildwars2.com/v2/wvw/objectives?ids=all')).json();

const round1 = (n) => Math.round(n * 10) / 10;
const sectorsByMap = {};
for (const [key, cfg] of Object.entries(MAPS)) {
    const apiMap = floor.regions['7']?.maps?.[String(cfg.apiId)];
    if (!apiMap?.sectors) throw new Error(`No sectors for map ${cfg.apiId} (${key})`);
    const [[cx1, cy1], [cx2, cy2]] = cfg.rect;
    const [pw, ph] = cfg.size;
    const [ox, oy] = cfg.offset;
    const toEi = ([x, y]) => [
        round1((x - cx1) / (cx2 - cx1) * pw + ox),
        round1((y - cy1) / (cy2 - cy1) * ph + oy),
    ];
    sectorsByMap[key] = Object.entries(apiMap.sectors).map(([id, s]) => ({
        id: Number(id),
        name: s.name.trim(),
        bounds: s.bounds.map(toEi),
    }));
    console.log(`${key}: ${sectorsByMap[key].length} sectors`);
}

const wantedMapIds = new Set(Object.values(MAPS).map(m => m.apiId));
const objectiveSectors = {};
for (const o of objectives) {
    if (wantedMapIds.has(o.map_id) && o.sector_id) objectiveSectors[o.id] = o.sector_id;
}
console.log(`objectives mapped: ${Object.keys(objectiveSectors).length}`);

const body = `// GENERATED FILE — do not edit by hand. Regenerate with: npm run generate:wvw-sectors
// Source: GW2 API /v2/continents/2/floors/3 (region 7) + /v2/wvw/objectives.
// Bounds are in EI pixel space (same space as wvwLandmarks/wvwTiles).
import { WvwMap } from './wvwLandmarks';

export type WvwOwner = 'Red' | 'Blue' | 'Green' | 'Neutral';

export interface WvwSector {
    id: number;
    name: string;
    bounds: [number, number][];
}

export const WVW_MAP_IDS: Record<WvwMap, number> = {
${Object.entries(MAPS).map(([k, c]) => `    [WvwMap.${k}]: ${c.apiId},`).join('\n')}
};

export const WVW_SECTOR_REF_SIZE: Record<WvwMap, [number, number]> = {
${Object.entries(MAPS).map(([k, c]) => `    [WvwMap.${k}]: [${c.size[0]}, ${c.size[1]}],`).join('\n')}
};

export const WVW_SECTORS: Record<WvwMap, WvwSector[]> = {
${Object.entries(sectorsByMap).map(([k, secs]) =>
    `    [WvwMap.${k}]: ${JSON.stringify(secs)},`).join('\n')}
};

export const OBJECTIVE_SECTORS: Record<string, number> = ${JSON.stringify(objectiveSectors)};
`;
writeFileSync(OUT, body);
console.log(`wrote ${OUT}`);
```

- [ ] **Step 2: Add the npm script and run the generator**

Add to `package.json` scripts (alphabetically near `generate:fixtures`): `"generate:wvw-sectors": "node scripts/generate-wvw-sectors.mjs"`.

Run: `npm run generate:wvw-sectors`
Expected: logs `EternalBattlegrounds: 2x sectors` etc. for all four maps (~15–30 each), `objectives mapped: ~100+`, and `src/shared/wvwSectors.ts` exists. Spot-check the file compiles: `npm run typecheck`.

- [ ] **Step 3: Write the data-integrity tests (failing first is impossible here — data exists — so these are characterization tests; write and run them now)**

`src/shared/__tests__/wvwSectors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { WVW_SECTORS, WVW_MAP_IDS, WVW_SECTOR_REF_SIZE, OBJECTIVE_SECTORS } from '../wvwSectors';
import { WvwMap } from '../wvwLandmarks';

function pointInPolygon([px, py]: [number, number], poly: [number, number][]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i];
        const [xj, yj] = poly[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

function sectorContaining(map: WvwMap, x: number, y: number) {
    return WVW_SECTORS[map].find(s => pointInPolygon([x, y], s.bounds));
}

describe('wvwSectors generated data', () => {
    it('has sectors, map ids and ref sizes for all four maps', () => {
        for (const map of Object.values(WvwMap)) {
            expect(WVW_SECTORS[map].length).toBeGreaterThanOrEqual(15);
            expect(WVW_MAP_IDS[map]).toBeGreaterThan(0);
            expect(WVW_SECTOR_REF_SIZE[map][1]).toBe(750);
        }
    });

    // Keep landmark coords from wvwLandmarks.ts — containment proves the
    // continent→EI-pixel conversion matches the tile/landmark calibration.
    it('places Dreadfall Bay keep inside its sector (Green BL)', () => {
        expect(sectorContaining(WvwMap.GreenBorderlands, 48, 435)?.name).toBe('Dreadfall Bay');
    });
    it('places Ascension Bay keep inside its sector (Blue BL)', () => {
        expect(sectorContaining(WvwMap.BlueBorderlands, 48, 435)?.name).toBe('Ascension Bay');
    });
    it('places Stonemist inside Stonemist Castle sector (EBG)', () => {
        expect(sectorContaining(WvwMap.EternalBattlegrounds, 370, 435)?.name).toBe('Stonemist Castle');
    });
    it("places Osprey's Palace keep inside its sector (Red BL)", () => {
        expect(sectorContaining(WvwMap.RedBorderlands, 700, 427)?.name).toBe("Osprey's Palace");
    });

    it('maps every objective to a sector that exists on its map', () => {
        const sectorIdsByApiMap = new Map<number, Set<number>>();
        for (const map of Object.values(WvwMap)) {
            sectorIdsByApiMap.set(WVW_MAP_IDS[map], new Set(WVW_SECTORS[map].map(s => s.id)));
        }
        const entries = Object.entries(OBJECTIVE_SECTORS);
        expect(entries.length).toBeGreaterThan(80);
        for (const [objId, sectorId] of entries) {
            const apiMapId = Number(objId.split('-')[0]);
            expect(sectorIdsByApiMap.get(apiMapId)?.has(sectorId), `${objId} -> ${sectorId}`).toBe(true);
        }
    });

    it('maps 95-33 (Dreadfall Bay keep objective) to the Dreadfall Bay sector', () => {
        const sectorId = OBJECTIVE_SECTORS['95-33'];
        const sector = WVW_SECTORS[WvwMap.GreenBorderlands].find(s => s.id === sectorId);
        expect(sector?.name).toBe('Dreadfall Bay');
    });
});
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/shared/__tests__/wvwSectors.test.ts --maxWorkers=2`
Expected: PASS (if a containment test fails, the conversion constants drifted from `wvwTiles.ts` — fix the script, regenerate, rerun).

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-wvw-sectors.mjs src/shared/wvwSectors.ts src/shared/__tests__/wvwSectors.test.ts package.json
git commit -m "feat(replay): generated WvW sector polygon data + generator script"
```

---

### Task 2: `SectorOutlineLayer` component

**Files:**
- Create: `src/renderer/stats/map/SectorOutlineLayer.tsx`
- Test: `src/renderer/stats/map/__tests__/SectorOutlineLayer.test.tsx`

**Interfaces:**
- Consumes: `WVW_SECTORS`, `WVW_SECTOR_REF_SIZE`, `WvwOwner` from `src/shared/wvwSectors` (Task 1); `WvwMap` from `src/shared/wvwLandmarks`.
- Produces (used by Task 3):

```tsx
export const SectorOutlineLayer: React.FC<{
    mapKey: WvwMap;
    mapWidth: number;   // fight's mapSize[0] (EI space, may differ from ref)
    mapHeight: number;  // fight's mapSize[1]
    scale: number;      // viewport.scale — outlines stay ~2 screen px
    sectorOwners?: Record<number, WvwOwner> | null;
}>;
```

- [ ] **Step 1: Write the failing test**

`src/renderer/stats/map/__tests__/SectorOutlineLayer.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { SectorOutlineLayer } from '../SectorOutlineLayer';
import { WvwMap } from '../../../../shared/wvwLandmarks';
import { WVW_SECTORS } from '../../../../shared/wvwSectors';

const renderLayer = (props: Partial<React.ComponentProps<typeof SectorOutlineLayer>> = {}) =>
    render(
        <svg>
            <SectorOutlineLayer
                mapKey={WvwMap.GreenBorderlands}
                mapWidth={523}
                mapHeight={750}
                scale={2}
                {...props}
            />
        </svg>,
    );

describe('SectorOutlineLayer', () => {
    it('renders one clipped polygon per sector', () => {
        const { container } = renderLayer();
        const polys = container.querySelectorAll('polygon[data-sector-id]');
        expect(polys.length).toBe(WVW_SECTORS[WvwMap.GreenBorderlands].length);
        expect(container.querySelectorAll('clipPath').length).toBe(polys.length);
        polys.forEach(p => expect(p.getAttribute('clip-path')).toMatch(/^url\(#/));
    });

    it('uses neutral slate stroke when no owners are known', () => {
        const { container } = renderLayer();
        const poly = container.querySelector('polygon[data-sector-id="999"]');
        expect(poly?.getAttribute('stroke')).toBe('rgba(148,163,184,0.55)');
    });

    it('colours owned sectors by team and leaves others neutral', () => {
        const { container } = renderLayer({ sectorOwners: { 999: 'Red' } });
        expect(container.querySelector('polygon[data-sector-id="999"]')?.getAttribute('stroke')).toBe('#ef4444');
        const other = Array.from(container.querySelectorAll('polygon[data-sector-id]'))
            .find(p => p.getAttribute('data-sector-id') !== '999');
        expect(other?.getAttribute('stroke')).toBe('rgba(148,163,184,0.55)');
    });

    it('treats Neutral owner like unknown', () => {
        const { container } = renderLayer({ sectorOwners: { 999: 'Neutral' } });
        expect(container.querySelector('polygon[data-sector-id="999"]')?.getAttribute('stroke')).toBe('rgba(148,163,184,0.55)');
    });

    it('scales polygon points when the fight map size differs from the reference', () => {
        const base = renderLayer().container.querySelector('polygon[data-sector-id="999"]')!.getAttribute('points')!;
        const doubled = renderLayer({ mapWidth: 1046, mapHeight: 1500 }).container
            .querySelector('polygon[data-sector-id="999"]')!.getAttribute('points')!;
        const first = (s: string) => s.split(' ')[0].split(',').map(Number);
        expect(first(doubled)[0]).toBeCloseTo(first(base)[0] * 2, 1);
        expect(first(doubled)[1]).toBeCloseTo(first(base)[1] * 2, 1);
    });

    it('keeps stroke width at ~2 screen px regardless of zoom (2× width, clipped)', () => {
        const { container } = renderLayer({ scale: 4 });
        const poly = container.querySelector('polygon[data-sector-id="999"]');
        expect(Number(poly?.getAttribute('stroke-width'))).toBeCloseTo(4 / 4, 5);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/SectorOutlineLayer.test.tsx --maxWorkers=2`
Expected: FAIL — cannot resolve `../SectorOutlineLayer`.

- [ ] **Step 3: Implement the component**

`src/renderer/stats/map/SectorOutlineLayer.tsx`:

```tsx
import React, { useId, useMemo } from 'react';
import { WvwMap } from '../../../shared/wvwLandmarks';
import { WVW_SECTORS, WVW_SECTOR_REF_SIZE, type WvwOwner } from '../../../shared/wvwSectors';

const OWNER_COLORS: Record<Exclude<WvwOwner, 'Neutral'>, string> = {
    Red: '#ef4444',
    Blue: '#3b82f6',
    Green: '#22c55e',
};
const NEUTRAL_COLOR = 'rgba(148,163,184,0.55)';

interface SectorOutlineLayerProps {
    mapKey: WvwMap;
    mapWidth: number;
    mapHeight: number;
    scale: number;
    sectorOwners?: Record<number, WvwOwner> | null;
}

/**
 * Team-coloured sector outlines. Each sector's stroke is clipped to its own
 * polygon interior (inner-aligned), so along a shared border both owners'
 * colours render side by side — every sector reads as a complete closed loop.
 */
export const SectorOutlineLayer: React.FC<SectorOutlineLayerProps> = ({ mapKey, mapWidth, mapHeight, scale, sectorOwners }) => {
    const clipPrefix = useId();
    const sectors = WVW_SECTORS[mapKey];
    const [refW, refH] = WVW_SECTOR_REF_SIZE[mapKey] ?? [mapWidth, mapHeight];

    const scaled = useMemo(() => {
        if (!sectors?.length) return [];
        const sx = mapWidth / refW;
        const sy = mapHeight / refH;
        return sectors.map(sec => ({
            id: sec.id,
            points: sec.bounds.map(([x, y]) => `${(x * sx).toFixed(1)},${(y * sy).toFixed(1)}`).join(' '),
        }));
    }, [sectors, mapWidth, mapHeight, refW, refH]);

    if (!scaled.length) return null;

    // 2× the target width, clipped to the interior → ~2 screen px inner-aligned.
    const strokeWidth = 4 / scale;

    return (
        <g>
            <defs>
                {scaled.map(sec => (
                    <clipPath key={sec.id} id={`${clipPrefix}-sec-${sec.id}`}>
                        <polygon points={sec.points} />
                    </clipPath>
                ))}
            </defs>
            {scaled.map(sec => {
                const owner = sectorOwners?.[sec.id];
                const color = owner && owner !== 'Neutral' ? OWNER_COLORS[owner] : NEUTRAL_COLOR;
                return (
                    <polygon
                        key={sec.id}
                        data-sector-id={sec.id}
                        points={sec.points}
                        fill="none"
                        stroke={color}
                        strokeOpacity={0.9}
                        strokeWidth={strokeWidth}
                        strokeLinejoin="round"
                        clipPath={`url(#${clipPrefix}-sec-${sec.id})`}
                    />
                );
            })}
        </g>
    );
};

export default SectorOutlineLayer;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/SectorOutlineLayer.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/SectorOutlineLayer.tsx src/renderer/stats/map/__tests__/SectorOutlineLayer.test.tsx
git commit -m "feat(replay): sector outline layer with inner-aligned independent strokes"
```

---

### Task 3: `zoneBorders` layer toggle + ReplayView mount

**Files:**
- Modify: `src/renderer/stats/statsStore.ts` (replayLayers type ~line 26, `initialState.replayLayers` ~line 75, `resetReplayLayers` ~line 135)
- Modify: `src/renderer/stats/map/LayersPopover.tsx` (new "Map" toggle group above "Squad overlay")
- Modify: `src/renderer/stats/map/ReplayView.tsx` (mount layer after the tile/map-image ternary, before `<HeatmapLayer …>`, ~line 330)
- Test: extend `src/renderer/stats/map/__tests__/statsStoreLayers.test.ts` and `src/renderer/stats/map/__tests__/LayersPopover.test.tsx`

**Interfaces:**
- Consumes: `SectorOutlineLayer` (Task 2); `fight.sectorOwners` reads as `undefined` until Task 5 lands (prop is optional — that is fine and renders neutral).
- Produces: `replayLayers.zoneBorders: boolean` (default **true**) and the Layers-panel checkbox labelled **Zone borders**.

- [ ] **Step 1: Write the failing store tests**

Add to `src/renderer/stats/map/__tests__/statsStoreLayers.test.ts` (follow the file's existing reset/act conventions):

```ts
it('defaults zoneBorders to true', () => {
    expect(useStatsStore.getState().replayLayers.zoneBorders).toBe(true);
});

it('toggles zoneBorders via setReplayLayer and restores true on reset', () => {
    useStatsStore.getState().setReplayLayer('zoneBorders', false);
    expect(useStatsStore.getState().replayLayers.zoneBorders).toBe(false);
    useStatsStore.getState().resetReplayLayers();
    expect(useStatsStore.getState().replayLayers.zoneBorders).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/renderer/stats/map/__tests__/statsStoreLayers.test.ts --maxWorkers=2`
Expected: FAIL (unknown property `zoneBorders` / type error).

- [ ] **Step 3: Implement the store change**

In `src/renderer/stats/statsStore.ts`, three edits (`zoneBorders` is the odd one out: it defaults **true**, the others false):

1. Type block (~line 26): add `zoneBorders: boolean;` as the first field of `replayLayers`.
2. `initialState.replayLayers` (~line 75): add `zoneBorders: true,` first.
3. `resetReplayLayers` (~line 135): add `zoneBorders: true,` to the object literal.

- [ ] **Step 4: Write the failing popover test**

Add to `src/renderer/stats/map/__tests__/LayersPopover.test.tsx` (reuse that file's render helper for the open panel):

```tsx
it('renders the Zone borders toggle checked by default and toggles the store', () => {
    // use the file's existing helper to render <LayersPanel open …>
    const checkbox = screen.getByRole('checkbox', { name: /zone borders/i });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkbox);
    expect(useStatsStore.getState().replayLayers.zoneBorders).toBe(false);
});
```

- [ ] **Step 5: Implement the popover group**

In `src/renderer/stats/map/LayersPopover.tsx`, above the `SQUAD_TOGGLES` const add:

```tsx
const MAP_TOGGLES: { key: 'zoneBorders'; label: string; title: string }[] = [
    { key: 'zoneBorders', label: 'Zone borders', title: 'Outlines each map sector in its owning team\'s colour (neutral when ownership is unknown)' },
];
```

In the open-panel JSX, before the `Squad overlay` header `<div>`, add a `Map` group mirroring the existing header + label markup exactly (same style objects, `checked={layers[t.key]}`, `onChange={e => setReplayLayer(t.key, e.currentTarget.checked)}`):

```tsx
<div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Map</div>
{MAP_TOGGLES.map(t => (
    <label key={t.key} title={t.title} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-primary)', padding: '3px 0', cursor: 'pointer' }}>
        <input type="checkbox"
               checked={layers[t.key]}
               onChange={e => setReplayLayer(t.key, e.currentTarget.checked)} />
        <span>{t.label}</span>
    </label>
))}
```

Then adjust the existing `Squad overlay` header's style to include `marginTop: 12` (matching the `Events` header) so groups space evenly.

- [ ] **Step 6: Mount the layer in ReplayView**

In `src/renderer/stats/map/ReplayView.tsx`:

1. Add import: `import { SectorOutlineLayer } from './SectorOutlineLayer';`
2. Immediately after the tile/map-image ternary block (closes ~line 329, before `<HeatmapLayer …>`), insert:

```tsx
{layers.zoneBorders && selectedFight.mapKey && (
    <SectorOutlineLayer
        mapKey={selectedFight.mapKey}
        mapWidth={mapWidth}
        mapHeight={mapHeight}
        scale={viewport.scale}
        sectorOwners={selectedFight.sectorOwners}
    />
)}
```

(`selectedFight.sectorOwners` type-errors until Task 5 adds the field to `ReplayFightPayload` — to keep this task green standalone, pass `sectorOwners={(selectedFight as { sectorOwners?: Record<number, import('../../../shared/wvwSectors').WvwOwner> }).sectorOwners}` and Task 5 Step 5 removes the cast.)

- [ ] **Step 7: Run tests + validate**

Run: `npx vitest run src/renderer/stats/map/__tests__/statsStoreLayers.test.ts src/renderer/stats/map/__tests__/LayersPopover.test.tsx --maxWorkers=2`
Expected: PASS.
Run: `npm run validate`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/stats/statsStore.ts src/renderer/stats/map/LayersPopover.tsx src/renderer/stats/map/ReplayView.tsx src/renderer/stats/map/__tests__/statsStoreLayers.test.ts src/renderer/stats/map/__tests__/LayersPopover.test.tsx
git commit -m "feat(replay): zone borders layer toggle, mounted in replay view"
```

---

### Task 4: `wvwMatchId` setting (main store + types + Settings UI)

**Files:**
- Modify: `src/main/index.ts` (`applySettings` param type + persistence ~line 1616/1734 area; `get-settings` handler return — find with `grep -n "get-settings" src/main/index.ts`)
- Modify: `src/renderer/global.d.ts` (`getSettings` return type ~line 283, `saveSettings` param type ~line 334)
- Create: `src/renderer/stats/utils/sectorOwners.ts` (starts here with `buildWvwMatchOptions`; grows in Task 5)
- Modify: `src/renderer/SettingsView.tsx` (picker UI)
- Test: `src/renderer/stats/__tests__/sectorOwners.test.ts`

**Interfaces:**
- Produces: setting `wvwMatchId: string | null` (e.g. `"1-3"`; `null` = off) available via `window.electronAPI.getSettings()` / `saveSettings({ wvwMatchId })`, and:

```ts
export function buildWvwMatchOptions(ids: string[]): { value: string; label: string }[];
// ['2-1','1-3','1-1'] -> [{value:'1-1',label:'NA — Tier 1'},{value:'1-3',label:'NA — Tier 3'},{value:'2-1',label:'EU — Tier 1'}]
```

- [ ] **Step 1: Write the failing options-builder test**

`src/renderer/stats/__tests__/sectorOwners.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildWvwMatchOptions } from '../utils/sectorOwners';

describe('buildWvwMatchOptions', () => {
    it('sorts NA before EU, tiers ascending, with readable labels', () => {
        expect(buildWvwMatchOptions(['2-1', '1-3', '2-5', '1-1'])).toEqual([
            { value: '1-1', label: 'NA — Tier 1' },
            { value: '1-3', label: 'NA — Tier 3' },
            { value: '2-1', label: 'EU — Tier 1' },
            { value: '2-5', label: 'EU — Tier 5' },
        ]);
    });
    it('ignores malformed ids', () => {
        expect(buildWvwMatchOptions(['bogus', '3-1', '1-2'])).toEqual([{ value: '1-2', label: 'NA — Tier 2' }]);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/renderer/stats/__tests__/sectorOwners.test.ts --maxWorkers=2`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `buildWvwMatchOptions`**

Create `src/renderer/stats/utils/sectorOwners.ts`:

```ts
// Zone-colour ownership helpers: match picker options (Task 4) and the
// per-log sector ownership snapshot (Task 5).

const REGION_NAMES: Record<string, string> = { '1': 'NA', '2': 'EU' };

export function buildWvwMatchOptions(ids: string[]): { value: string; label: string }[] {
    return ids
        .map(id => {
            const m = /^([12])-(\d+)$/.exec(id);
            return m ? { value: id, region: Number(m[1]), tier: Number(m[2]) } : null;
        })
        .filter((v): v is { value: string; region: number; tier: number } => v !== null)
        .sort((a, b) => a.region - b.region || a.tier - b.tier)
        .map(v => ({ value: v.value, label: `${REGION_NAMES[String(v.region)]} — Tier ${v.tier}` }));
}
```

Run: `npx vitest run src/renderer/stats/__tests__/sectorOwners.test.ts --maxWorkers=2` → PASS.

- [ ] **Step 4: Persist the setting in main**

In `src/main/index.ts`:

1. Add `wvwMatchId?: string | null` to the `applySettings` inline param type (~line 1616).
2. Next to the `allowLocalJson` block (~line 1734), add:

```ts
if (settings.wvwMatchId !== undefined) {
    store.set('wvwMatchId', settings.wvwMatchId);
}
```

3. In the `get-settings` handler's returned object (locate with `grep -n "get-settings" src/main/index.ts`, then find the literal that returns `allowLocalJson`), add:

```ts
wvwMatchId: (store.get('wvwMatchId') as string | null) ?? null,
```

- [ ] **Step 5: Extend the renderer types**

In `src/renderer/global.d.ts` add `wvwMatchId?: string | null;` to **both** the `getSettings` return object (~line 283 block, near `allowLocalJson`) and the `saveSettings` param object (~line 334 block).

- [ ] **Step 6: Add the Settings UI picker**

In `src/renderer/SettingsView.tsx` — locate the general-behaviour section with `grep -n "closeBehavior" src/renderer/SettingsView.tsx` and mirror the nearest labelled `<select>` row's markup/styling exactly. Behaviour:

- Local state `wvwMatchId` initialised from `getSettings()` (the view already loads settings — hook into the same effect) and `wvwMatchOptions` initialised to `[]`.
- On mount, fetch ids: `fetch('https://api.guildwars2.com/v2/wvw/matches').then(r => r.json()).then(ids => setWvwMatchOptions(buildWvwMatchOptions(ids))).catch(() => {})` — on failure the select still renders with the saved value plus Off.
- Render, labelled **WvW match (replay zone colours)** with helper text `Your region + tier this week — used to colour replay map sectors by owner. Teams move tiers weekly.`:

```tsx
<select
    value={wvwMatchId ?? ''}
    onChange={(e) => {
        const next = e.currentTarget.value || null;
        setWvwMatchId(next);
        window.electronAPI.saveSettings({ wvwMatchId: next });
    }}
>
    <option value="">Off</option>
    {wvwMatchOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
</select>
```

(Use the file's existing select/label class or style props verbatim so it matches the section.)

- [ ] **Step 7: Validate + commit**

Run: `npm run validate` → clean.

```bash
git add src/main/index.ts src/renderer/global.d.ts src/renderer/SettingsView.tsx src/renderer/stats/utils/sectorOwners.ts src/renderer/stats/__tests__/sectorOwners.test.ts
git commit -m "feat(settings): WvW match picker for replay zone colours"
```

---

### Task 5: Ownership snapshot — fetch, hook, and payload threading

**Files:**
- Modify: `src/renderer/stats/utils/sectorOwners.ts` (add fetcher + candidate picker)
- Create: `src/renderer/app/hooks/useSectorOwners.ts`
- Modify: `src/renderer/App.tsx` (one hook call)
- Modify: `src/renderer/global.d.ts` (`ILogData.sectorOwners` ~line 505)
- Modify: `src/renderer/stats/map/replayTypes.ts` (`ReplayFightPayload.sectorOwners`)
- Modify: `src/renderer/stats/incrementalAggregation.ts` (`buildReplayFightPayload` ~line 190)
- Modify: `src/renderer/stats/map/ReplayView.tsx` (remove Task 3's temporary cast)
- Test: extend `src/renderer/stats/__tests__/sectorOwners.test.ts`; add one case to `src/renderer/stats/map/__tests__/replayPayload.test.ts`

**Interfaces:**
- Consumes: `OBJECTIVE_SECTORS`, `WVW_MAP_IDS`, `WvwOwner` (Task 1); `resolveMapFromZone` from `src/shared/mapUtils`; setting `wvwMatchId` (Task 4).
- Produces:

```ts
export async function fetchMatchSectorOwners(
    matchId: string,
    mapKey: WvwMap,
    fetchImpl?: typeof fetch,
): Promise<Record<number, WvwOwner> | null>;   // null on error / map not in match

export function pickSnapshotCandidates(logs: ILogData[], nowMs: number): ILogData[];

export const SNAPSHOT_MAX_AGE_MS: number;      // 2h

// ILogData.sectorOwners?: Record<number, WvwOwner>
// ReplayFightPayload.sectorOwners: Record<number, WvwOwner> | null
```

- [ ] **Step 1: Write the failing fetcher + candidate tests**

Append to `src/renderer/stats/__tests__/sectorOwners.test.ts`:

```ts
import { vi } from 'vitest';
import { fetchMatchSectorOwners, pickSnapshotCandidates, SNAPSHOT_MAX_AGE_MS, __clearMatchCacheForTests } from '../utils/sectorOwners';
import { WvwMap } from '../../../shared/wvwLandmarks';

const matchJson = {
    maps: [
        { id: 95, objectives: [{ id: '95-33', owner: 'Red' }, { id: '95-53', owner: 'Green' }, { id: '95-9999', owner: 'Blue' }] },
        { id: 38, objectives: [{ id: '38-9', owner: 'Blue' }] },
    ],
};
const okFetch = () => vi.fn(async () => ({ ok: true, json: async () => matchJson })) as unknown as typeof fetch;

describe('fetchMatchSectorOwners', () => {
    beforeEach(() => __clearMatchCacheForTests());

    it('maps objective owners to sector ids for the requested map', async () => {
        const owners = await fetchMatchSectorOwners('1-1', WvwMap.GreenBorderlands, okFetch());
        expect(owners?.[999]).toBe('Red');          // 95-33 -> sector 999
        expect(Object.values(owners ?? {})).not.toContain('Blue'); // unknown objective 95-9999 skipped
    });

    it('returns null when the map is missing from the match or the fetch fails', async () => {
        const failFetch = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch;
        expect(await fetchMatchSectorOwners('1-1', WvwMap.RedBorderlands, okFetch())).toBeNull();
        __clearMatchCacheForTests();
        expect(await fetchMatchSectorOwners('1-1', WvwMap.GreenBorderlands, failFetch)).toBeNull();
    });

    it('caches the match response for subsequent calls', async () => {
        const f = okFetch();
        await fetchMatchSectorOwners('1-1', WvwMap.GreenBorderlands, f);
        await fetchMatchSectorOwners('1-1', WvwMap.EternalBattlegrounds, f);
        expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls.length).toBe(1);
    });
});

describe('pickSnapshotCandidates', () => {
    const now = 1_800_000_000_000;
    const base = { id: 'a', permalink: '', filePath: '/x.zevtc', detailsStatus: 'loaded' } as const;

    it('picks recent successful WvW logs without owners', () => {
        const logs = [
            { ...base, id: 'fresh', status: 'success', fightName: 'Green Alpine Borderlands', uploadTime: now / 1000 - 600 },
            { ...base, id: 'stale', status: 'success', fightName: 'Green Alpine Borderlands', uploadTime: now / 1000 - SNAPSHOT_MAX_AGE_MS / 1000 - 60 },
            { ...base, id: 'has', status: 'success', fightName: 'Green Alpine Borderlands', uploadTime: now / 1000 - 600, sectorOwners: { 1: 'Red' } },
            { ...base, id: 'notwvw', status: 'success', fightName: 'Edge of the Mists', uploadTime: now / 1000 - 600 },
            { ...base, id: 'pending', status: 'uploading', fightName: 'Green Alpine Borderlands', uploadTime: now / 1000 - 600 },
        ] as unknown as ILogData[];
        expect(pickSnapshotCandidates(logs, now).map(l => l.id)).toEqual(['fresh']);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/renderer/stats/__tests__/sectorOwners.test.ts --maxWorkers=2`
Expected: FAIL — missing exports.

- [ ] **Step 3: Implement fetcher + candidate picker**

Append to `src/renderer/stats/utils/sectorOwners.ts`:

```ts
import { WvwMap } from '../../../shared/wvwLandmarks';
import { OBJECTIVE_SECTORS, WVW_MAP_IDS, type WvwOwner } from '../../../shared/wvwSectors';
import { resolveMapFromZone } from '../../../shared/mapUtils';

export const SNAPSHOT_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const MATCH_CACHE_TTL_MS = 60 * 1000;

let matchCache: { matchId: string; at: number; promise: Promise<unknown> } | null = null;
export function __clearMatchCacheForTests(): void { matchCache = null; }

async function getMatch(matchId: string, fetchImpl: typeof fetch): Promise<unknown> {
    const now = Date.now();
    if (matchCache && matchCache.matchId === matchId && now - matchCache.at < MATCH_CACHE_TTL_MS) {
        return matchCache.promise;
    }
    const promise = fetchImpl(`https://api.guildwars2.com/v2/wvw/matches/${matchId}`)
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null);
    matchCache = { matchId, at: now, promise };
    return promise;
}

export async function fetchMatchSectorOwners(
    matchId: string,
    mapKey: WvwMap,
    fetchImpl: typeof fetch = fetch,
): Promise<Record<number, WvwOwner> | null> {
    const match = await getMatch(matchId, fetchImpl) as { maps?: { id: number; objectives?: { id: string; owner: WvwOwner }[] }[] } | null;
    const map = match?.maps?.find(m => m.id === WVW_MAP_IDS[mapKey]);
    if (!map?.objectives?.length) return null;
    const owners: Record<number, WvwOwner> = {};
    for (const obj of map.objectives) {
        const sectorId = OBJECTIVE_SECTORS[obj.id];
        if (sectorId !== undefined && obj.owner) owners[sectorId] = obj.owner;
    }
    return Object.keys(owners).length ? owners : null;
}

/** Fresh, finished WvW logs that still need an ownership snapshot. */
export function pickSnapshotCandidates(logs: ILogData[], nowMs: number): ILogData[] {
    return logs.filter(log => {
        if (log.status !== 'success' || log.sectorOwners || !log.fightName) return false;
        if (!resolveMapFromZone(log.fightName)) return false;
        const uploadedAtMs = (log.uploadTime ?? 0) * 1000;
        return uploadedAtMs > 0 && nowMs - uploadedAtMs < SNAPSHOT_MAX_AGE_MS;
    });
}
```

Run the tests again → PASS.

- [ ] **Step 4: Add the `useSectorOwners` hook and wire it into App**

Create `src/renderer/app/hooks/useSectorOwners.ts`:

```ts
import { useEffect, useRef } from 'react';
import { fetchMatchSectorOwners, pickSnapshotCandidates } from '../../stats/utils/sectorOwners';
import { resolveMapFromZone } from '../../../shared/mapUtils';

type SetLogs = (updater: (logs: ILogData[]) => ILogData[]) => void;

/**
 * Snapshots WvW match ownership onto freshly processed logs so the replay can
 * colour sector outlines. No-op when the wvwMatchId setting is unset. Only
 * recent logs are snapshotted — rehydrated old sessions stay neutral rather
 * than getting colours from the wrong week.
 */
export function useSectorOwners(logs: ILogData[], setLogsDeferred: SetLogs): void {
    const inFlight = useRef<Set<string>>(new Set());

    useEffect(() => {
        const candidates = pickSnapshotCandidates(logs, Date.now())
            .filter(log => !inFlight.current.has(log.id));
        if (!candidates.length) return;

        let cancelled = false;
        (async () => {
            const settings = await window.electronAPI.getSettings();
            const matchId = settings.wvwMatchId;
            if (!matchId || cancelled) return;
            for (const log of candidates) {
                const mapKey = resolveMapFromZone(log.fightName ?? '');
                if (!mapKey) continue;
                inFlight.current.add(log.id);
                const owners = await fetchMatchSectorOwners(matchId, mapKey);
                inFlight.current.delete(log.id);
                if (!owners || cancelled) continue;
                setLogsDeferred(current => {
                    const idx = current.findIndex(l => l.id === log.id);
                    if (idx < 0 || current[idx].sectorOwners) return current;
                    const updated = [...current];
                    updated[idx] = { ...updated[idx], sectorOwners: owners };
                    return updated;
                });
            }
        })();
        return () => { cancelled = true; };
    }, [logs, setLogsDeferred]);
}
```

In `src/renderer/App.tsx`, next to the other app hooks (e.g. right after the `useUploadListeners({ … })` call around line 604), add:

```ts
useSectorOwners(logs, setLogsDeferred);
```

with the matching import. (`logs` and `setLogsDeferred` both already exist in App scope — the prewarm effect below that call uses `setLogsDeferred` the same way.)

- [ ] **Step 5: Thread the field through types and the payload builder**

1. `src/renderer/global.d.ts` — in `ILogData` (after `replayDataUrl` ~line 505) add:
   `sectorOwners?: Record<number, import('../shared/wvwSectors').WvwOwner>;`
2. `src/renderer/stats/map/replayTypes.ts` — add to `ReplayFightPayload`:
   `sectorOwners: Record<number, import('../../../shared/wvwSectors').WvwOwner> | null;`
3. `src/renderer/stats/incrementalAggregation.ts` — in `buildReplayFightPayload`'s returned object (next to `mapImageUrl` ~line 189) add:
   `sectorOwners: log?.sectorOwners ?? null,`
4. `src/renderer/stats/map/ReplayView.tsx` — replace Task 3's cast with plain `sectorOwners={selectedFight.sectorOwners}`.

- [ ] **Step 6: Payload test + persistence check**

Add to `src/renderer/stats/map/__tests__/replayPayload.test.ts`, inside the existing describe, reusing the file's existing log/details fixture that already produces a non-null payload:

```ts
it('threads sectorOwners from the log onto the payload (null when absent)', () => {
    const withOwners = buildReplayFightPayload({ ...validLogFixture, sectorOwners: { 999: 'Red' } }, 0);
    expect(withOwners?.sectorOwners).toEqual({ 999: 'Red' });
    const without = buildReplayFightPayload(validLogFixture, 0);
    expect(without?.sectorOwners).toBeNull();
});
```

(`validLogFixture` = whatever the file's existing passing tests pass to `buildReplayFightPayload`; reuse it verbatim.)

Persistence check (no code expected, verify + fix only if needed): `grep -rn "save-logs" src/main src/preload` and read the main-process handler — logs are persisted as received; confirm there is no field whitelist/sanitizer between renderer state and disk. If one exists, add `sectorOwners` to it. Same check for the web-report path: `grep -n "replayFights" src/main/handlers/githubHandlers.ts` — the trim logic targets positions/icons and must not strip the new field.

- [ ] **Step 7: Run the affected tests + validate**

Run: `npx vitest run src/renderer/stats/__tests__/sectorOwners.test.ts src/renderer/stats/map/__tests__/replayPayload.test.ts src/renderer/stats/map/__tests__/SectorOutlineLayer.test.tsx --maxWorkers=2`
Expected: PASS.
Run: `npm run validate` → clean.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/stats/utils/sectorOwners.ts src/renderer/app/hooks/useSectorOwners.ts src/renderer/App.tsx src/renderer/global.d.ts src/renderer/stats/map/replayTypes.ts src/renderer/stats/incrementalAggregation.ts src/renderer/stats/map/ReplayView.tsx src/renderer/stats/__tests__/sectorOwners.test.ts src/renderer/stats/map/__tests__/replayPayload.test.ts
git commit -m "feat(replay): per-log WvW ownership snapshot colours zone outlines"
```

---

### Task 6: Full-suite verification + visual smoke

**Files:** none new.

- [ ] **Step 1: Full unit suite**

Run: `npx vitest run --maxWorkers=2`
Expected: all green (fix regressions before proceeding).

- [ ] **Step 2: Validate**

Run: `npm run validate`
Expected: clean typecheck + zero eslint warnings.

- [ ] **Step 3: Visual smoke via the web report**

`dev/report.json` contains 3 replay fights (Blue BL). Temporarily `cp web/report.json /tmp/web-report-backup.json && cp dev/report.json web/report.json`, run `npm run dev:web`, open `http://127.0.0.1:4173/web/`, open the report → Map → Replay. Expected: neutral slate sector outlines over the tile map (this dataset has no `sectorOwners`); the Layers panel shows **Map → Zone borders** checked; unchecking hides the outlines. Restore with `cp /tmp/web-report-backup.json web/report.json` and stop the server.

- [ ] **Step 4: Commit any straggler fixes**

```bash
git status --short   # expect clean besides intentional changes; commit fixes with fix(replay): …
```

---

## Self-review notes (spec coverage)

- Spec "generated `wvwSectors.ts`" → Task 1. "SectorOutlineLayer + clipPath inner alignment + Layers toggle default on" → Tasks 2–3. "WvW match setting (region+tier)" → Task 4. "ownership snapshot at processing time, cached, freshness-guarded, `ILogData` → payload threading, web report pass-through" → Task 5. "old logs neutral" → neutral default in Task 2 + freshness guard in Task 5. "no report bloat" → snapshot-only payload, checked in Task 5 Step 6.
- Phase 2 (cap rings) intentionally not planned here — separate plan after EI JSON exposure lands.
