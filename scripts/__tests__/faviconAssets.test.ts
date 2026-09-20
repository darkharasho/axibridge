import { describe, expect, it } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT } from '../copy-viewer-assets.mjs';

/**
 * `bridge.axi.link` is one origin split across two servers: the Worker owns
 * `/r` and `/r/*`, and GitHub Pages serves everything else from this repo's
 * `docs/` (see `docs/CNAME`). The share page's icon links
 * (`worker/src/og.ts`) and the marketing page's are therefore root-relative
 * paths into `docs/` — links the Worker's own tests can assert the text of,
 * but not the existence of, since `worker/tsconfig.json` carries no Node
 * types. That check lives here.
 */
describe('favicon assets on the bridge.axi.link origin', () => {
    const docs = path.join(REPO_ROOT, 'docs');

    it('serves /favicon.ico for clients that ignore the SVG link', () => {
        const ico = path.join(docs, 'favicon.ico');
        expect(existsSync(ico)).toBe(true);
        // A bare `.ico` extension proves nothing about the bytes; a plausible
        // multi-size icon is at least a few KB, and an empty or truncated file
        // would 200 with a broken image rather than fail loudly.
        expect(statSync(ico).size).toBeGreaterThan(1024);
    });

    it('serves /assets/favicon.svg, the link both pages prefer', () => {
        expect(existsSync(path.join(docs, 'assets', 'favicon.svg'))).toBe(true);
    });
});
