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
