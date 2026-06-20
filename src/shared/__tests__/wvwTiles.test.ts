import { describe, expect, it } from 'vitest';
import { getMapReferenceSize } from '../wvwTiles';
import { WvwMap } from '../wvwLandmarks';

describe('getMapReferenceSize', () => {
    it('returns the calibrated pixel size for each WvW map', () => {
        expect(getMapReferenceSize(WvwMap.EternalBattlegrounds)).toEqual([716, 750]);
        expect(getMapReferenceSize(WvwMap.GreenBorderlands)).toEqual([523, 750]);
        expect(getMapReferenceSize(WvwMap.BlueBorderlands)).toEqual([523, 750]);
        expect(getMapReferenceSize(WvwMap.RedBorderlands)).toEqual([750, 750]);
    });
});
