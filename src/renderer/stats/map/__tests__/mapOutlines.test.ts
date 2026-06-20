import { describe, expect, it } from 'vitest';
import { mapOutlineFileName, getMapOutline } from '../mapOutlines';
import { WvwMap } from '../../../../shared/wvwLandmarks';

describe('mapOutlineFileName', () => {
    it('maps each WvW map to its outline asset base name', () => {
        expect(mapOutlineFileName(WvwMap.EternalBattlegrounds)).toBe('eternalbattlegrounds-outline');
        expect(mapOutlineFileName(WvwMap.GreenBorderlands)).toBe('alpine-outline');
        expect(mapOutlineFileName(WvwMap.BlueBorderlands)).toBe('alpine-outline');
        expect(mapOutlineFileName(WvwMap.RedBorderlands)).toBe('desert-outline');
    });

    it('shares one asset between green and blue (Alpine) borderlands', () => {
        expect(mapOutlineFileName(WvwMap.GreenBorderlands))
            .toBe(mapOutlineFileName(WvwMap.BlueBorderlands));
    });
});

describe('getMapOutline', () => {
    it('returns a base64 SVG data URI for a bundled map (EBG)', () => {
        const uri = getMapOutline(WvwMap.EternalBattlegrounds);
        expect(uri).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('resolves alpine for both green and blue, and desert for red', () => {
        expect(getMapOutline(WvwMap.GreenBorderlands)).toMatch(/^data:image\/svg\+xml;base64,/);
        expect(getMapOutline(WvwMap.GreenBorderlands)).toBe(getMapOutline(WvwMap.BlueBorderlands));
        expect(getMapOutline(WvwMap.RedBorderlands)).toMatch(/^data:image\/svg\+xml;base64,/);
    });
});
