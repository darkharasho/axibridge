import { describe, expect, it } from 'vitest';
import { mapOutlineFileName, getMapOutlineSvg, parseOutlineSvg } from '../mapOutlines';
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

describe('parseOutlineSvg', () => {
    it('extracts viewBox dimensions and inner markup for inlining', () => {
        const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="716" height="750" viewBox="0 0 716 750"><path d="M0 0" fill="#000"/></svg>';
        const parsed = parseOutlineSvg(svg);
        expect(parsed).not.toBeNull();
        expect(parsed!.width).toBe(716);
        expect(parsed!.height).toBe(750);
        expect(parsed!.inner).toBe('<path d="M0 0" fill="#000"/>');
    });

    it('falls back to width/height attributes when viewBox is absent', () => {
        const svg = '<svg width="400" height="300"><path d="M1 1"/></svg>';
        const parsed = parseOutlineSvg(svg);
        expect(parsed!.width).toBe(400);
        expect(parsed!.height).toBe(300);
    });

    it('returns null for missing or malformed input', () => {
        expect(parseOutlineSvg(undefined)).toBeNull();
        expect(parseOutlineSvg('')).toBeNull();
        expect(parseOutlineSvg('<div>not svg</div>')).toBeNull();
        expect(parseOutlineSvg('<svg viewBox="0 0 0 0"><path/></svg>')).toBeNull();
    });
});

describe('getMapOutlineSvg', () => {
    it('returns raw inlineable SVG markup (not a data URI) for each bundled (map, level)', () => {
        for (const level of ['standard', 'high', 'max'] as const) {
            const svg = getMapOutlineSvg(WvwMap.EternalBattlegrounds, level);
            expect(svg).toMatch(/^<svg/);
            expect(parseOutlineSvg(svg)).not.toBeNull();
        }
    });

    it('resolves alpine for both green and blue', () => {
        expect(getMapOutlineSvg(WvwMap.GreenBorderlands, 'standard'))
            .toBe(getMapOutlineSvg(WvwMap.BlueBorderlands, 'standard'));
    });
});
