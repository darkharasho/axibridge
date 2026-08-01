import { describe, it, expect } from 'vitest';
import { WVW_SECTORS, WVW_MAP_IDS, WVW_SECTOR_REF_SIZE, OBJECTIVE_SECTORS } from '../wvwSectors';
import { sectorIdAt } from '../sectorLookup';
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

    it('sectorIdAt resolves the sector containing a landmark point', () => {
        const dreadfallSector = WVW_SECTORS[WvwMap.GreenBorderlands].find(s => s.name === 'Dreadfall Bay');
        expect(sectorIdAt(WvwMap.GreenBorderlands, 48, 435)).toBe(dreadfallSector?.id);
        expect(sectorIdAt(WvwMap.GreenBorderlands, -100, -100)).toBeUndefined();
    });

    it('maps 95-33 (Dreadfall Bay keep objective) to the Dreadfall Bay sector', () => {
        const sectorId = OBJECTIVE_SECTORS['95-33'];
        const sector = WVW_SECTORS[WvwMap.GreenBorderlands].find(s => s.id === sectorId);
        expect(sector?.name).toBe('Dreadfall Bay');
    });
});
