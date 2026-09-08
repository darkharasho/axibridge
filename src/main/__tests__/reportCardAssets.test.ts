import path from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { __resetReportCardAssetCache, resolveReportCardAssets } from '../reportCardAssets';

const PUBLIC_DIR = path.resolve(__dirname, '../../../public');

describe('resolveReportCardAssets', () => {
    beforeEach(() => {
        __resetReportCardAssetCache();
    });

    it('inlines the real font and glyph from the repo public dir', () => {
        const assets = resolveReportCardAssets(PUBLIC_DIR, []);
        expect(assets.fontDataUri?.startsWith('data:font/woff2;base64,')).toBe(true);
        expect(assets.fontDataUri!.length).toBeGreaterThan(1000);
        expect(assets.glyphDataUri?.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('inlines only the requested professions', () => {
        const assets = resolveReportCardAssets(PUBLIC_DIR, ['Firebrand']);
        expect(Object.keys(assets.iconDataUris)).toEqual(['Firebrand']);
        expect(assets.iconDataUris.Firebrand.startsWith('data:image/png;base64,')).toBe(true);
    });

    it('refuses a profession outside the allow-list instead of reading a path', () => {
        const assets = resolveReportCardAssets(PUBLIC_DIR, ['../../../../etc/passwd', 'NotAClass']);
        expect(assets.iconDataUris).toEqual({});
    });

    it('degrades to nulls when the public dir does not exist', () => {
        const assets = resolveReportCardAssets('/nonexistent-axibridge-public', ['Firebrand']);
        expect(assets.fontDataUri).toBeNull();
        expect(assets.glyphDataUri).toBeNull();
        expect(assets.iconDataUris).toEqual({});
    });

    it('reads each file only once across variants', () => {
        const first = resolveReportCardAssets(PUBLIC_DIR, ['Firebrand']);
        const second = resolveReportCardAssets(PUBLIC_DIR, ['Firebrand']);
        // Memoised: the same string instance comes back, so the 344 KB font is
        // not re-read or re-encoded for the second variant of a publish.
        expect(second.fontDataUri).toBe(first.fontDataUri);
        expect(second.iconDataUris.Firebrand).toBe(first.iconDataUris.Firebrand);
    });
});
