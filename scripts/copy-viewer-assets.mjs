#!/usr/bin/env node
/**
 * Copy the static assets the share viewer fetches at runtime into `docs/view/`.
 *
 * `vite.viewer.config.ts` sets `publicDir: false` (copying the whole ~4.6MB
 * `public/` tree next to `viewer.js` would be dead weight), so nothing else
 * puts these files on the GitHub Pages origin the viewer is served from. The
 * bundle resolves them relative to its own location — see `VIEWER_ASSET_BASE`
 * in `src/web/viewerMain.tsx` — so each one has to exist at
 * `docs/view/<path>`.
 *
 * The list is explicit rather than a glob: it was derived by grepping the
 * built bundle for literal asset paths, and an explicit list is what lets
 * `scripts/__tests__/copyViewerAssets.test.ts` fail when a source asset is
 * renamed or deleted.
 *
 * `logo.json` is deliberately absent. It is a per-user guild-logo manifest
 * generated at publish time by `src/main/handlers/githubHandlers.ts`; it does
 * not live in `public/`, and 404ing on it is already handled.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The list lives in `scripts/viewer-assets.json` so that the guard test can
 * read it without importing this module. Importing a `.mjs` from a `.ts` test
 * makes Vite externalise it, and on Windows the resulting `C:\...` path is
 * handed to Node as an import specifier whose backslashes are escape
 * sequences — a bare `SyntaxError: Invalid or unexpected token` with no frame.
 */
export const VIEWER_ASSETS = JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'scripts', 'viewer-assets.json'), 'utf8')
).assets;

export const VIEWER_ASSET_SOURCE_DIR = path.join(REPO_ROOT, 'public');
export const VIEWER_ASSET_OUT_DIR = path.join(REPO_ROOT, 'docs', 'view');

export const copyViewerAssets = () => {
    const missing = VIEWER_ASSETS.filter(
        (relativePath) => !existsSync(path.join(VIEWER_ASSET_SOURCE_DIR, relativePath))
    );
    if (missing.length > 0) {
        throw new Error(
            `copy-viewer-assets: missing source asset(s) under public/:\n  ${missing.join('\n  ')}\n` +
                'Update the list in scripts/viewer-assets.json if the asset was renamed.'
        );
    }
    for (const relativePath of VIEWER_ASSETS) {
        const destination = path.join(VIEWER_ASSET_OUT_DIR, relativePath);
        mkdirSync(path.dirname(destination), { recursive: true });
        copyFileSync(path.join(VIEWER_ASSET_SOURCE_DIR, relativePath), destination);
    }
    return VIEWER_ASSETS.length;
};

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
    try {
        const count = copyViewerAssets();
        console.log(`copy-viewer-assets: copied ${count} asset(s) into docs/view/`);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}
