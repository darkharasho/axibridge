import { describe, expect, it } from 'vitest';
import { MAX_HIRES_ZOOM, pickTileZoom, visibleMapRect, getMapTiles, HIRES_TILE_BASE, type MapRect } from '../wvwTiles';
import { WvwMap } from '../wvwLandmarks';

// EBG: continentRect width 3072 units rendered into 716 map units
// → native (z7) density ≈ 4.2905 art px per map unit.
const EBG = WvwMap.EternalBattlegrounds;
const MAP_W = 716;

describe('pickTileZoom', () => {
    it('matches the legacy default for a 1:1 panel at scale 1, dpr 1', () => {
        expect(pickTileZoom(EBG, MAP_W, 716, 1, 1)).toBe(5);
    });

    it('accounts for panel size (2× panel → one level up)', () => {
        expect(pickTileZoom(EBG, MAP_W, 1432, 1, 1)).toBe(6);
    });

    it('accounts for devicePixelRatio', () => {
        expect(pickTileZoom(EBG, MAP_W, 1432, 1, 2)).toBe(7);
    });

    it('reaches hi-res zooms at the default viewport scale of 3', () => {
        expect(pickTileZoom(EBG, MAP_W, 1432, 3, 1)).toBe(8);
        expect(pickTileZoom(EBG, MAP_W, 1432, 3, 2)).toBe(9);
    });

    it('rounds up: picks the exact zoom when density matches exactly', () => {
        const nativeDensity = 3072 / MAP_W;
        // needed = 2× native → exactly z8
        expect(pickTileZoom(EBG, MAP_W, MAP_W, nativeDensity * 2, 1)).toBe(8);
    });

    it('clamps to MAX_HIRES_ZOOM at extreme zoom', () => {
        expect(pickTileZoom(EBG, MAP_W, 1432, 50, 2)).toBe(MAX_HIRES_ZOOM);
    });

    it('clamps to 3 for tiny panels', () => {
        expect(pickTileZoom(EBG, MAP_W, 10, 1, 1)).toBe(3);
    });

    it('falls back to a 1:1 panel assumption when panel width is 0 (pre-layout)', () => {
        expect(pickTileZoom(EBG, MAP_W, 0, 1, 1)).toBe(5);
    });

    it('treats non-positive dpr as 1', () => {
        expect(pickTileZoom(EBG, MAP_W, 716, 1, 0)).toBe(5);
    });

    it('returns 5 for a map without tile data', () => {
        expect(pickTileZoom('Nope' as unknown as WvwMap, MAP_W, 1432, 3, 2)).toBe(5);
    });

    it('MAX_HIRES_ZOOM is 9 (ship gate in the hosting task may lower to 8)', () => {
        expect(MAX_HIRES_ZOOM).toBe(9);
    });
});

describe('visibleMapRect', () => {
    it('is the full map for a same-size panel at identity viewport', () => {
        expect(visibleMapRect(700, 700, 700, 700, { scale: 1, tx: 0, ty: 0 }))
            .toEqual({ x: 0, y: 0, width: 700, height: 700 });
    });

    it('accounts for slice cropping on a wide panel (vertical crop, centered)', () => {
        // rs = max(1400/700, 700/700) = 2 → rendered 1400×1400, panel shows
        // the middle 700 px vertically → viewBox y 175..525, x full.
        expect(visibleMapRect(1400, 700, 700, 700, { scale: 1, tx: 0, ty: 0 }))
            .toEqual({ x: 0, y: 175, width: 700, height: 350 });
    });

    it('inverts the pan/zoom transform', () => {
        // scale 2 centered on the map center: v = m·2 − 350 → m = (v+350)/2.
        expect(visibleMapRect(700, 700, 700, 700, { scale: 2, tx: -350, ty: -350 }))
            .toEqual({ x: 175, y: 175, width: 350, height: 350 });
    });

    it('returns the full map when the panel has no size yet', () => {
        expect(visibleMapRect(0, 0, 716, 750, { scale: 3, tx: 0, ty: 0 }))
            .toEqual({ x: 0, y: 0, width: 716, height: 750 });
    });
});

describe('getMapTiles — URL routing and culling', () => {
    it('returns the full EBG grid without a visible rect (unchanged behavior)', () => {
        expect(getMapTiles(EBG, 7, 716, 750)).toHaveLength(169);
        expect(getMapTiles(EBG, 5, 716, 750)).toHaveLength(16);
    });

    it('routes z ≤ 7 to the official service and z ≥ 8 to the hi-res host', () => {
        const z7 = getMapTiles(EBG, 7, 716, 750);
        expect(z7[0].url).toBe('https://tiles.guildwars2.com/2/3/7/34/49.jpg');
        const z8 = getMapTiles(EBG, 8, 716, 750);
        expect(z8).toHaveLength(625);
        expect(z8[0].url).toBe(`${HIRES_TILE_BASE}/2/3/8/69/99.jpg`);
        const z9 = getMapTiles(EBG, 9, 716, 750);
        expect(z9).toHaveLength(2401);
        expect(z9[0].url).toBe(`${HIRES_TILE_BASE}/2/3/9/139/199.jpg`);
    });

    it('culls to the visible rect plus a one-tile margin', () => {
        const rect: MapRect = { x: 330, y: 350, width: 60, height: 60 };
        const tiles = getMapTiles(EBG, 7, 716, 750, rect);
        expect(tiles.length).toBeGreaterThan(0);
        expect(tiles.length).toBeLessThan(169);
        // Every returned tile overlaps the expanded rect (margin = 1 tile).
        const tw = tiles[0].width, th = tiles[0].height;
        for (const t of tiles) {
            expect(t.x + t.width).toBeGreaterThanOrEqual(rect.x - tw);
            expect(t.x).toBeLessThanOrEqual(rect.x + rect.width + tw);
            expect(t.y + t.height).toBeGreaterThanOrEqual(rect.y - th);
            expect(t.y).toBeLessThanOrEqual(rect.y + rect.height + th);
        }
        // The rect itself is fully covered: each corner falls inside a tile.
        for (const [px, py] of [
            [rect.x, rect.y], [rect.x + rect.width, rect.y],
            [rect.x, rect.y + rect.height], [rect.x + rect.width, rect.y + rect.height],
        ] as const) {
            expect(tiles.some(t =>
                px >= t.x && px <= t.x + t.width && py >= t.y && py <= t.y + t.height
            )).toBe(true);
        }
    });

    it('an off-map rect yields no tiles beyond the margin ring', () => {
        const tiles = getMapTiles(EBG, 7, 716, 750, { x: -5000, y: -5000, width: 10, height: 10 });
        expect(tiles).toHaveLength(0);
    });
});
