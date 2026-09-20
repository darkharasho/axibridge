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
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const VIEWER_ASSETS = [
    'img/AxiBridge-white.png',
    'svg/AxiBridge.svg',
    'svg/commander_tag_outline.svg',
    'svg/custom-icons/dam_mit.svg',
    'svg/custom-icons/gw2_aegis.svg',
    'svg/custom-icons/gw2_boon.svg',
    'svg/custom-icons/gw2_fury.svg',
    'svg/custom-icons/gw2_sigil.svg',
    'svg/custom-icons/mouse.svg'
];

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VIEWER_ASSET_SOURCE_DIR = path.join(REPO_ROOT, 'public');
export const VIEWER_ASSET_OUT_DIR = path.join(REPO_ROOT, 'docs', 'view');

export const copyViewerAssets = () => {
    const missing = VIEWER_ASSETS.filter(
        (relativePath) => !existsSync(path.join(VIEWER_ASSET_SOURCE_DIR, relativePath))
    );
    if (missing.length > 0) {
        throw new Error(
            `copy-viewer-assets: missing source asset(s) under public/:\n  ${missing.join('\n  ')}\n` +
                'Update VIEWER_ASSETS in scripts/copy-viewer-assets.mjs if the asset was renamed.'
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
