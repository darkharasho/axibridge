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
