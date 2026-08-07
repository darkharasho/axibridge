import { describe, expect, it } from 'vitest';
import { MAX_HIRES_ZOOM, pickTileZoom, visibleMapRect } from '../wvwTiles';
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
