import { existsSync } from 'node:fs';
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
