import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import viewerAssets from '../viewer-assets.json';

/**
 * Guard for the share viewer's asset list: `docs/view/` is populated from an
 * explicit list, so a renamed or deleted `public/` asset would otherwise only
 * surface as a 404 on a live share page.
 *
 * This reads the JSON directly rather than importing `copy-viewer-assets.mjs`.
 * Importing that `.mjs` from here makes Vite externalise it, and on Windows the
 * resulting `C:\...` path reaches Node as an import specifier whose backslashes
 * are escape sequences — the suite dies with a bare
 * `SyntaxError: Invalid or unexpected token` and zero collected tests.
 */
// Resolved from the vitest root (the repo root) rather than `import.meta.url`:
// under vite-node `import.meta.url` is an http:// URL, not a file:// one. If the
// cwd were ever wrong, every asset reads as missing and the first test fails
// loudly — the safe direction.
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

describe('copy-viewer-assets', () => {
    const assets: string[] = viewerAssets.assets;

    it('lists assets that all exist under public/', () => {
        const missing = assets.filter((relativePath) => !existsSync(path.join(PUBLIC_DIR, relativePath)));
        expect(missing).toEqual([]);
    });

    it('lists only relative paths and no duplicates', () => {
        expect(assets.length).toBeGreaterThan(0);
        expect(new Set(assets).size).toBe(assets.length);
        assets.forEach((relativePath) => {
            expect(relativePath.startsWith('/')).toBe(false);
            expect(relativePath.includes('\\')).toBe(false);
        });
    });
});

/**
 * The other direction, and the one that actually broke: the list above was
 * derived by hand from the bundle once, so an asset added to the viewer later
 * is simply absent from it — no build error, no failing test, just a 404 on
 * every live share page. `svg/axibridge-glyph.svg` went that way when the
 * report header switched from the wordmark to the glyph.
 *
 * `docs/view/viewer.js` is committed, so it is always here to read. The paths
 * survive minification as string literals because they are template-joined
 * onto the asset base at runtime rather than resolved by Vite.
 */
describe('viewer bundle asset references', () => {
    const BUNDLE = path.resolve(process.cwd(), 'docs', 'view', 'viewer.js');

    it('references no asset the copy list is missing', () => {
        const bundle = readFileSync(BUNDLE, 'utf8');
        // `assets/` is excluded: those are Vite's own emitted chunks (the stats
        // worker), which the build writes next to the bundle itself.
        const referenced = new Set(
            Array.from(bundle.matchAll(/"((?:svg|img|icons)\/[A-Za-z0-9_./-]+)"/g), (m) => m[1])
        );
        const listed = new Set<string>(viewerAssets.assets);
        expect([...referenced].filter((asset) => !listed.has(asset))).toEqual([]);
    });
});
