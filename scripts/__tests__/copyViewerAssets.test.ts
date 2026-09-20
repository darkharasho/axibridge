import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error - plain .mjs build script, no type declarations.
import { VIEWER_ASSETS, VIEWER_ASSET_SOURCE_DIR } from '../copy-viewer-assets.mjs';

/**
 * Guard for the share viewer's asset list: `docs/view/` is populated by an
 * explicit list, so a renamed or deleted `public/` asset would otherwise only
 * surface as a 404 on a live share page.
 */
describe('copy-viewer-assets', () => {
    it('lists assets that all exist under public/', () => {
        const missing = (VIEWER_ASSETS as string[]).filter(
            (relativePath) => !existsSync(path.join(VIEWER_ASSET_SOURCE_DIR as string, relativePath))
        );
        expect(missing).toEqual([]);
    });

    it('lists only relative paths and no duplicates', () => {
        const assets = VIEWER_ASSETS as string[];
        expect(assets.length).toBeGreaterThan(0);
        expect(new Set(assets).size).toBe(assets.length);
        assets.forEach((relativePath) => {
            expect(relativePath.startsWith('/')).toBe(false);
        });
    });
});
