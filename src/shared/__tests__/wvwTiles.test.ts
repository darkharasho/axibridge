import { describe, expect, it } from 'vitest';
import { getMapPixelOffset } from '../wvwTiles';
import { WvwMap } from '../wvwLandmarks';

describe('getMapPixelOffset', () => {
    it('returns the calibrated pixel offset for EBG at reference size', () => {
        expect(getMapPixelOffset(WvwMap.EternalBattlegrounds)).toEqual([-14, 20]);
    });

    it('scales the offset proportionally when render size differs from reference', () => {
        // EBG reference is [716, 750]; doubling gives [1432, 1500] → offset doubles
        expect(getMapPixelOffset(WvwMap.EternalBattlegrounds, 1432, 1500)).toEqual([-28, 40]);
    });

    it('returns [0, 0] for borderland maps that have no offset', () => {
        expect(getMapPixelOffset(WvwMap.GreenBorderlands)).toEqual([0, 0]);
        expect(getMapPixelOffset(WvwMap.RedBorderlands)).toEqual([0, 0]);
    });
});
