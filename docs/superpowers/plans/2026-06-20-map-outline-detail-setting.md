# Map Outline Detail Setting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the replay map-outline detail a user-selectable setting (Off / Standard / High / Max, default Standard), each level a pre-baked per-map outline asset.

**Architecture:** The bake script gains an edge-recipe per detail level and emits one SVG per (map, level). A new `replayLayers.outline` store field (mirroring `heatmap`) drives an "Outline" radio group in the Layers panel; `ReplayView` resolves `getMapOutline(mapKey, level)` and renders it at full opacity.

**Tech Stack:** TypeScript, React, Zustand store, Vite `import.meta.glob` raw inlining, Node `.mjs` + ImageMagick + potrace (dev bake), vitest + @testing-library/react.

## Global Constraints

- Detail levels and their ImageMagick edge recipes (grayscale → black thin line art → `-negate` → potrace), verbatim:
  - `standard`: `-blur 0x0.4 -canny 0x1+6%+18%`
  - `high`: `-clahe 25x25%+128+2 -blur 0x0.4 -canny 0x1+6%+18%`
  - `max`: `-clahe 12x12%+128+3 -canny 0x1+4%+12%`
- Asset filenames: `src/shared/mapOutlines/<map>-outline-<level>.svg`, where `<map>` ∈ `eternalbattlegrounds | alpine | desert`. Green+Blue borderlands share `alpine`.
- `OutlineLevel = 'standard' | 'high' | 'max'`. Store field is `outline: 'off' | OutlineLevel`, default `'standard'`.
- Overlay opacity is `1` (not 0.7).
- SVG lookup stays a base64 data URI via eager `import.meta.glob` (URL hrefs fail in Electron's renderer). The lookup module stays under `src/renderer` (Vite-only; electron-main `tsc` can't compile `import.meta`).
- Respect the test-runner limit: run vitest with `--maxWorkers=2`.

---

### Task 1: Bake the 9 outline assets (manual dev run)

Add the per-level recipe to the bake script and regenerate 3 levels × 3 maps. Network + ImageMagick + potrace; controller-run, validated by checking file presence + viewBoxes. The old single `*-outline.svg` files are removed.

**Files:**
- Modify: `scripts/build-map-outline.mjs`
- Create: `src/shared/mapOutlines/{eternalbattlegrounds,alpine,desert}-outline-{standard,high,max}.svg` (9 generated, committed)
- Delete: `src/shared/mapOutlines/{eternalbattlegrounds,alpine,desert}-outline.svg` (old single variants)

**Interfaces:**
- Produces: 9 SVGs named `<map>-outline-<level>.svg`, each `viewBox="0 0 <pw> <ph>"`.

- [ ] **Step 1: Add the recipe map and level arg to the script**

In `scripts/build-map-outline.mjs`, after the `MAPS` constant, add the recipes (mirrors the spec table). The map `out` values are base names without the level suffix:

```js
// Edge-detection recipe per detail level (ImageMagick args before -negate).
const RECIPES = {
    standard: ['-colorspace', 'Gray', '-blur', '0x0.4', '-canny', '0x1+6%+18%'],
    high:     ['-colorspace', 'Gray', '-clahe', '25x25%+128+2', '-blur', '0x0.4', '-canny', '0x1+6%+18%'],
    max:      ['-colorspace', 'Gray', '-clahe', '12x12%+128+3', '-canny', '0x1+4%+12%'],
};
```

Change `MAPS[*].out` from full filenames to base names (drop `.svg`):
`ebg` → `'eternalbattlegrounds-outline'`, both alpine → `'alpine-outline'`, `desert` → `'desert-outline'`.

Parse a level list from args (default all three):

```js
const levelArg = args.find(a => a.startsWith('--level='));
const levels = levelArg ? levelArg.slice('--level='.length).split(',') : ['standard', 'high', 'max'];
for (const lv of levels) if (!RECIPES[lv]) { console.error(`Unknown level "${lv}"`); process.exit(1); }
```

- [ ] **Step 2: Make the edge + trace + write steps loop over levels**

Replace the single edge step (the `magick … -canny 0x1+10%+30% -negate threshold` call) and the trace+write tail so they run per level. The composite (Step 1 of the script) is unchanged and shared across levels. Each level writes its own threshold cache and output file:

```js
for (const lv of levels) {
    const threshold = path.join(work, `threshold-${lv}.png`);
    // 2) Edge detection for this level.
    execFileSync('magick', [composite, ...RECIPES[lv], '-negate', threshold], { stdio: 'inherit' });
    // 3) Trace with potrace.
    const traced = await new Promise((resolve, reject) => {
        potrace.trace(threshold, { threshold: 128, turdSize: 4, optTolerance: 0.4, color: '#000000', background: 'transparent' },
            (err, out) => (err ? reject(err) : resolve(out)));
    });
    // 4) Normalise header to reference pixel space and write.
    const svg = traced.replace(/<svg\b[^>]*>/, (open) => {
        const cleaned = open.replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, '').replace(/\sviewBox="[^"]*"/, '');
        return cleaned.replace(/>$/, ` width="${pw}" height="${ph}" viewBox="0 0 ${pw} ${ph}">`);
    });
    const outPath = path.join(outDir, `${cfg.out}-${lv}.svg`);
    writeFileSync(outPath, svg);
    console.log(`[${key}:${lv}] wrote ${outPath}`);
}
```

(Remove the old single-`threshold`/`tracedRaw`/`outPath` block this replaces. The `threshold` const declared earlier near the cache paths is no longer needed — delete that line if present.)

- [ ] **Step 3: Generate all 9 assets**

Run (composite cached after the first run per map via `--reuse`):

```bash
node scripts/build-map-outline.mjs ebg
node scripts/build-map-outline.mjs alpine-green --reuse
node scripts/build-map-outline.mjs desert --reuse
```

Expected: each prints `[<map>:standard|high|max] wrote …`. 9 files appear in `src/shared/mapOutlines/`.

- [ ] **Step 4: Remove the old single-variant assets and verify**

```bash
git rm src/shared/mapOutlines/eternalbattlegrounds-outline.svg src/shared/mapOutlines/alpine-outline.svg src/shared/mapOutlines/desert-outline.svg
ls src/shared/mapOutlines/*-outline-*.svg | wc -l   # expect 9
grep -l 'viewBox="0 0 716 750"' src/shared/mapOutlines/eternalbattlegrounds-outline-*.svg | wc -l  # expect 3
```

- [ ] **Step 5: Commit**

```bash
git add scripts/build-map-outline.mjs src/shared/mapOutlines/*-outline-*.svg
git commit -m "feat(maps): bake standard/high/max outline variants per map"
```

---

### Task 2: Store — `outline` field + setter

Add the `outline` detail level to `replayLayers`, mirroring `heatmap`.

**Files:**
- Modify: `src/renderer/stats/statsStore.ts`
- Test: `src/renderer/stats/map/__tests__/statsStoreLayers.test.ts`

**Interfaces:**
- Consumes: `OutlineLevel` (Task 3) — but to avoid ordering coupling, the store declares the union inline as `'off' | 'standard' | 'high' | 'max'`.
- Produces: `replayLayers.outline: 'off' | 'standard' | 'high' | 'max'` (default `'standard'`); `setReplayOutlineMode(mode)`.

- [ ] **Step 1: Write the failing tests**

Append to `src/renderer/stats/map/__tests__/statsStoreLayers.test.ts` inside the top-level `describe`:

```ts
    it('defaults outline detail to standard', () => {
        expect(useStatsStore.getState().replayLayers.outline).toBe('standard');
    });

    it('setReplayOutlineMode updates the outline level', () => {
        useStatsStore.getState().setReplayOutlineMode('high');
        expect(useStatsStore.getState().replayLayers.outline).toBe('high');
        useStatsStore.getState().setReplayOutlineMode('off');
        expect(useStatsStore.getState().replayLayers.outline).toBe('off');
    });

    it('resetReplayLayers restores outline to standard', () => {
        useStatsStore.getState().setReplayOutlineMode('max');
        useStatsStore.getState().resetReplayLayers();
        expect(useStatsStore.getState().replayLayers.outline).toBe('standard');
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/stats/map/__tests__/statsStoreLayers.test.ts --maxWorkers=2`
Expected: FAIL — `outline` is undefined / `setReplayOutlineMode` is not a function.

- [ ] **Step 3: Add the field, default, setter, and reset**

In `src/renderer/stats/statsStore.ts`:

In the `replayLayers` type (after `heatmap: …;`):
```ts
        outline: 'off' | 'standard' | 'high' | 'max';
```

In the actions type block (after `setReplayHeatmapMode: …;`):
```ts
    setReplayOutlineMode: (mode: StatsStoreState['replayLayers']['outline']) => void;
```

In `initialState.replayLayers` (after `heatmap: 'off' as const,`):
```ts
        outline: 'standard' as const,
```

In the store object, after the `setReplayHeatmapMode` action:
```ts
    setReplayOutlineMode: (mode) => set((state) => ({
        replayLayers: { ...state.replayLayers, outline: mode },
    })),
```

In `resetReplayLayers`'s `replayLayers` object (after `heatmap: 'off',`):
```ts
            outline: 'standard',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/stats/map/__tests__/statsStoreLayers.test.ts --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/statsStore.ts src/renderer/stats/map/__tests__/statsStoreLayers.test.ts
git commit -m "feat(replay): add outline detail level to replay layers store"
```

---

### Task 3: Lookup — `getMapOutline(map, level)`

Extend the lookup to resolve a per-level variant. Requires Task 1's 9 assets.

**Files:**
- Modify: `src/renderer/stats/map/mapOutlines.ts`
- Test: `src/renderer/stats/map/__tests__/mapOutlines.test.ts`

**Interfaces:**
- Produces:
  - `export type OutlineLevel = 'standard' | 'high' | 'max'`
  - `mapOutlineFileName(map: WvwMap, level: OutlineLevel): string` (e.g. `eternalbattlegrounds-outline-standard`)
  - `getMapOutline(map: WvwMap, level: OutlineLevel): string | undefined`

- [ ] **Step 1: Update the failing tests**

Replace the body of `src/renderer/stats/map/__tests__/mapOutlines.test.ts` with:

```ts
import { describe, expect, it } from 'vitest';
import { mapOutlineFileName, getMapOutline } from '../mapOutlines';
import { WvwMap } from '../../../../shared/wvwLandmarks';

describe('mapOutlineFileName', () => {
    it('maps each map+level to its outline asset base name', () => {
        expect(mapOutlineFileName(WvwMap.EternalBattlegrounds, 'standard')).toBe('eternalbattlegrounds-outline-standard');
        expect(mapOutlineFileName(WvwMap.GreenBorderlands, 'high')).toBe('alpine-outline-high');
        expect(mapOutlineFileName(WvwMap.BlueBorderlands, 'high')).toBe('alpine-outline-high');
        expect(mapOutlineFileName(WvwMap.RedBorderlands, 'max')).toBe('desert-outline-max');
    });

    it('shares the alpine asset between green and blue at each level', () => {
        expect(mapOutlineFileName(WvwMap.GreenBorderlands, 'standard'))
            .toBe(mapOutlineFileName(WvwMap.BlueBorderlands, 'standard'));
    });
});

describe('getMapOutline', () => {
    it('returns a base64 SVG data URI for each bundled (map, level)', () => {
        for (const level of ['standard', 'high', 'max'] as const) {
            expect(getMapOutline(WvwMap.EternalBattlegrounds, level)).toMatch(/^data:image\/svg\+xml;base64,/);
            expect(getMapOutline(WvwMap.GreenBorderlands, level)).toMatch(/^data:image\/svg\+xml;base64,/);
            expect(getMapOutline(WvwMap.RedBorderlands, level)).toMatch(/^data:image\/svg\+xml;base64,/);
        }
    });

    it('resolves alpine for both green and blue', () => {
        expect(getMapOutline(WvwMap.GreenBorderlands, 'standard'))
            .toBe(getMapOutline(WvwMap.BlueBorderlands, 'standard'));
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/stats/map/__tests__/mapOutlines.test.ts --maxWorkers=2`
Expected: FAIL — `mapOutlineFileName`/`getMapOutline` take one arg / wrong base names.

- [ ] **Step 3: Update the lookup module**

Replace the `MAP_OUTLINE_FILE` constant and the two functions in `src/renderer/stats/map/mapOutlines.ts` (keep the glob/`outlinesByName` block above unchanged):

```ts
export type OutlineLevel = 'standard' | 'high' | 'max';

const MAP_OUTLINE_BASE: Record<WvwMap, string> = {
    [WvwMap.EternalBattlegrounds]: 'eternalbattlegrounds-outline',
    [WvwMap.GreenBorderlands]: 'alpine-outline',
    [WvwMap.BlueBorderlands]: 'alpine-outline',
    [WvwMap.RedBorderlands]: 'desert-outline',
};

/** Base asset name (no extension) for a map's outline SVG at a detail level. */
export function mapOutlineFileName(map: WvwMap, level: OutlineLevel): string {
    return `${MAP_OUTLINE_BASE[map]}-${level}`;
}

/** Base64 SVG data URI for a map's outline at a detail level, or undefined if not bundled. */
export function getMapOutline(map: WvwMap, level: OutlineLevel): string | undefined {
    return outlinesByName[mapOutlineFileName(map, level)];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/stats/map/__tests__/mapOutlines.test.ts --maxWorkers=2`
Expected: PASS (9 assets from Task 1 resolve).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/mapOutlines.ts src/renderer/stats/map/__tests__/mapOutlines.test.ts
git commit -m "feat(maps): getMapOutline resolves per-level outline variants"
```

---

### Task 4: Layers panel — Outline radio group

Add an "Outline" section to the panel, mirroring the Heatmap radio section.

**Files:**
- Modify: `src/renderer/stats/map/LayersPopover.tsx`
- Test: `src/renderer/stats/map/__tests__/LayersPopover.test.tsx`

**Interfaces:**
- Consumes: `replayLayers.outline`, `setReplayOutlineMode` (Task 2).

- [ ] **Step 1: Write the failing test**

Append to `src/renderer/stats/map/__tests__/LayersPopover.test.tsx` (mirror the file's existing render/setup style; if no test for the open panel exists, add this self-contained one):

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LayersPanel } from '../LayersPopover';
import { useStatsStore } from '../../statsStore';

describe('LayersPanel — outline section', () => {
    beforeEach(() => {
        useStatsStore.setState((useStatsStore as any).getInitialState());
    });

    it('renders the four outline options and selects standard by default', () => {
        render(<LayersPanel open onToggle={() => {}} />);
        expect(screen.getByLabelText('Off', { selector: 'input[name="replay-outline"]' })).toBeTruthy();
        const standard = screen.getByLabelText('Standard', { selector: 'input[name="replay-outline"]' }) as HTMLInputElement;
        expect(standard.checked).toBe(true);
    });

    it('switching to High detail updates the store', () => {
        render(<LayersPanel open onToggle={() => {}} />);
        fireEvent.click(screen.getByLabelText('High detail', { selector: 'input[name="replay-outline"]' }));
        expect(useStatsStore.getState().replayLayers.outline).toBe('high');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/stats/map/__tests__/LayersPopover.test.tsx --maxWorkers=2`
Expected: FAIL — no `replay-outline` radios.

- [ ] **Step 3: Add the Outline section**

In `src/renderer/stats/map/LayersPopover.tsx`, add the options constant near `HEATMAP_OPTIONS`:

```tsx
const OUTLINE_OPTIONS: { value: 'off' | 'standard' | 'high' | 'max'; label: string; title: string }[] = [
    { value: 'off', label: 'Off', title: 'No map outline overlay' },
    { value: 'standard', label: 'Standard', title: 'Balanced black outline of terrain and structures' },
    { value: 'high', label: 'High detail', title: 'Captures more structure and terrain edges (busier)' },
    { value: 'max', label: 'Max detail', title: 'Densest outline — most edges, busiest terrain' },
];
```

Read the setter alongside the existing hooks at the top of `LayersPanel`:
```tsx
    const setReplayOutlineMode = useStatsStore(state => state.setReplayOutlineMode);
```

Add the section markup immediately after the Heatmap section's closing `))}` + `</…>` (i.e. just before the final `</div>` that closes the scroll container). Mirror the Heatmap block exactly:

```tsx
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: 12, marginBottom: 6 }}>Outline</div>
                {OUTLINE_OPTIONS.map(opt => (
                    <label key={opt.value} title={opt.title} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-primary)', padding: '3px 0', cursor: 'pointer' }}>
                        <input type="radio" name="replay-outline"
                               value={opt.value}
                               checked={layers.outline === opt.value}
                               onChange={() => setReplayOutlineMode(opt.value)} />
                        <span>{opt.label}</span>
                    </label>
                ))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/stats/map/__tests__/LayersPopover.test.tsx --maxWorkers=2`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/LayersPopover.tsx src/renderer/stats/map/__tests__/LayersPopover.test.tsx
git commit -m "feat(replay): outline detail radio group in layers panel"
```

---

### Task 5: Wire the setting into `ReplayView`

Resolve the outline by current map + selected level, render at full opacity.

**Files:**
- Modify: `src/renderer/stats/map/ReplayView.tsx`

**Interfaces:**
- Consumes: `layers.outline` (Task 2), `getMapOutline(map, level)` (Task 3).

- [ ] **Step 1: Update the MapOutlineLayer wiring**

In `src/renderer/stats/map/ReplayView.tsx`, replace the existing `<MapOutlineLayer … />` block (the one currently passing `outlineUrl={selectedFight.mapKey ? getMapOutline(selectedFight.mapKey) : undefined}`) with:

```tsx
                                    <MapOutlineLayer
                                        outlineUrl={selectedFight.mapKey && layers.outline !== 'off'
                                            ? getMapOutline(selectedFight.mapKey, layers.outline)
                                            : undefined}
                                        mapWidth={mapWidth}
                                        mapHeight={mapHeight}
                                        offsetX={outlineOffsetX}
                                        offsetY={outlineOffsetY}
                                        opacity={1}
                                    />
```

(`layers` is already read at `const layers = useStatsStore(state => state.replayLayers);`. The `layers.outline !== 'off'` guard narrows the type to `OutlineLevel`, matching `getMapOutline`'s signature.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors (both tsc invocations).

- [ ] **Step 3: Run the map test suite**

Run: `npx vitest run src/renderer/stats/map --maxWorkers=2`
Expected: PASS (store, lookup, panel, and existing map tests).

- [ ] **Step 4: Manual visual verification**

`npm run dev`, open a fight, open the replay Layers panel → the new "Outline" group. Confirm: Standard is selected by default and the outline shows at full opacity; switching to High/Max increases detail; Off hides it. Try EBG + a borderland.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stats/map/ReplayView.tsx
git commit -m "feat(replay): drive map outline overlay from the detail setting"
```

---

## Self-Review Notes

- **Spec coverage:** levels/recipes + 9 assets (Task 1) ↔ spec §Edge Recipes & §Architecture/1; store field+setter+default (Task 2) ↔ §Architecture/3; `getMapOutline(map, level)`/`OutlineLevel` (Task 3) ↔ §Architecture/2; Outline radio section (Task 4) ↔ §Architecture/4; render wiring + opacity 1.0 (Task 5) ↔ §Architecture/5; off/missing → undefined → null ↔ §Error Handling.
- **Type consistency:** `OutlineLevel = 'standard'|'high'|'max'` (Task 3) matches the store union `'off' | 'standard'|'high'|'max'` (Task 2); `getMapOutline(map, level)` consumed with the `!== 'off'`-narrowed value in Task 5; `setReplayOutlineMode` defined (Task 2), used (Tasks 4) with the same value type.
- **Removability of `max`:** dropping it later = remove from `RECIPES`/levels (script), `OutlineLevel`, `OUTLINE_OPTIONS`, the store union, and delete its 3 SVGs — no structural change.
</content>
