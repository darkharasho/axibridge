import { describe, expect, it } from 'vitest';
import {
    buildIndexPayload,
    parseSiteIndex,
    removeFromSiteIndex,
    resolveSiteAppearance,
    shouldWriteViewer
} from '../sharedSitePolicy';

const local = { colorPalette: 'electric-blue', axiTheme: 'glass' as const };

describe('parseSiteIndex', () => {
    it('accepts the legacy plain-array format', () => {
        expect(parseSiteIndex([{ id: 'a' }])).toEqual({
            entries: [{ id: 'a' }], colorPalette: null, axiTheme: null, generator: null
        });
    });
    it('reads appearance and generator from the object format', () => {
        const parsed = parseSiteIndex({
            colorPalette: 'ember', axiTheme: 'flat', generator: { app: 'axibridge', version: '3.21.0' }, entries: []
        });
        expect(parsed.colorPalette).toBe('ember');
        expect(parsed.axiTheme).toBe('flat');
        expect(parsed.generator).toEqual({ app: 'axibridge', version: '3.21.0' });
    });
    it('keeps a theme this version does not know, verbatim', () => {
        expect(parseSiteIndex({ axiTheme: 'some-future-theme', entries: [] }).axiTheme).toBe('some-future-theme');
    });
    it('treats null / garbage as an empty site', () => {
        expect(parseSiteIndex(null).entries).toEqual([]);
        expect(parseSiteIndex('nope').entries).toEqual([]);
    });
});

describe('resolveSiteAppearance', () => {
    const site = parseSiteIndex({ colorPalette: 'ember', axiTheme: 'flat', entries: [] });
    it('admin publishes local appearance', () => {
        expect(resolveSiteAppearance({ isAdmin: true, local, site })).toEqual(local);
    });
    it('non-admin carries the site appearance', () => {
        expect(resolveSiteAppearance({ isAdmin: false, local, site })).toEqual({ colorPalette: 'ember', axiTheme: 'flat' });
    });
    it('non-admin carries an unknown site theme through to the index payload', () => {
        const future = parseSiteIndex({ colorPalette: 'ember', axiTheme: 'some-future-theme', entries: [] });
        const appearance = resolveSiteAppearance({ isAdmin: false, local, site: future });
        expect(appearance.axiTheme).toBe('some-future-theme');
        const { payload } = buildIndexPayload({ entry: { id: 'x' }, site: future, appearance, generator: null });
        expect(payload.axiTheme).toBe('some-future-theme');
    });
    it('non-admin falls back to local when the site has none', () => {
        expect(resolveSiteAppearance({ isAdmin: false, local, site: parseSiteIndex([]) })).toEqual(local);
        expect(resolveSiteAppearance({ isAdmin: false, local, site: null })).toEqual(local);
    });
});

describe('shouldWriteViewer', () => {
    const rec = (version: string) => ({ app: 'axibridge' as const, version });
    it('writes when nothing is recorded', () => expect(shouldWriteViewer('3.20.0', null)).toBe(true));
    it('writes when equal', () => expect(shouldWriteViewer('3.20.0', rec('3.20.0'))).toBe(true));
    it('writes when newer', () => expect(shouldWriteViewer('3.21.0', rec('3.20.9'))).toBe(true));
    it('skips when older', () => expect(shouldWriteViewer('3.19.4', rec('3.20.0'))).toBe(false));
    it('writes when either version is unparseable', () => {
        expect(shouldWriteViewer('dev', rec('3.20.0'))).toBe(true);
        expect(shouldWriteViewer('3.20.0', rec('x'))).toBe(true);
    });
});

describe('buildIndexPayload', () => {
    it('puts the new entry first, replaces a same-id entry, keeps others', () => {
        const site = parseSiteIndex({ entries: [{ id: 'b', publishedBy: 'kyra' }, { id: 'a', title: 'old' }] });
        const { payload, entries } = buildIndexPayload({
            entry: { id: 'a', title: 'new' }, site, appearance: local, generator: { app: 'axibridge', version: '3.20.0' }
        });
        expect(entries.map((e) => e.id)).toEqual(['a', 'b']);
        expect(entries[0].title).toBe('new');
        expect(payload).toMatchObject({
            colorPalette: 'electric-blue', axiTheme: 'glass', glass: true, glassSurfaces: true,
            generator: { app: 'axibridge', version: '3.20.0' }
        });
    });
    it('omits generator when null', () => {
        const { payload } = buildIndexPayload({ entry: { id: 'a' }, site: parseSiteIndex([]), appearance: local, generator: null });
        expect('generator' in payload).toBe(false);
    });
});

describe('removeFromSiteIndex', () => {
    it('preserves every top-level field on the object format', () => {
        const out = removeFromSiteIndex({
            colorPalette: 'ember', axiTheme: 'flat', siteTheme: { x: 1 }, generator: { app: 'axibridge', version: '3.20.0' },
            entries: [{ id: 'a' }, { id: 'b' }]
        }, ['a']);
        expect(out).toEqual({
            colorPalette: 'ember', axiTheme: 'flat', siteTheme: { x: 1 }, generator: { app: 'axibridge', version: '3.20.0' },
            entries: [{ id: 'b' }]
        });
    });
    it('filters the legacy array format', () => {
        expect(removeFromSiteIndex([{ id: 'a' }, { id: 'b' }], ['b'])).toEqual([{ id: 'a' }]);
    });
});
