import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Builds the share-link viewer as a single self-contained ES module. It is
// loaded by the Cloudflare Worker's boot HTML
// (`<script type="module" src="https://bridge.axi.link/view/viewer.js">`,
// see worker/src/og.ts) rather than via any `index.html` of ours, so this
// uses library mode (no HTML entry, no separate CSS asset — see the
// `?inline` import in src/web/viewerMain.tsx) and writes straight into
// `docs/view/`, which GitHub Pages serves from this repo's `main` branch.
export default defineConfig({
    plugins: [react()],
    // Icons/fonts the viewer needs (gw2-class-icons) are inlined as base64
    // data URIs at build time (see src/renderer/classIconUtils.ts), and no
    // CSS in this bundle references `public/` by absolute path. Copying the
    // ~5MB `public/` tree (fonts/img/svg/web-report-themes meant for the
    // Electron app and the full web report) into `docs/view/` would just be
    // dead weight next to `viewer.js`.
    publicDir: false,
    // Emit asset URLs relative to the bundle rather than root-absolute. The
    // stats Web Worker chunk was referenced as `/assets/statsWorker-*.js`,
    // which resolves against `bridge.axi.link` — the Worker origin, not the
    // GitHub Pages origin this bundle and its chunks are served from — so the
    // worker failed to construct and aggregation silently fell back to the
    // inline `computeStatsSync` path.
    base: './',
    // Library mode leaves `process.env.NODE_ENV` in place for the consuming
    // bundler to replace — but this bundle has no consumer. The browser loads
    // it straight from `<script type="module">` on the Worker's boot page,
    // where `process` does not exist, and React's jsx-runtime reads it while
    // initialising. Without this the viewer dies at load with
    // `ReferenceError: process is not defined` before rendering anything.
    // App builds (vite.web.config.ts) get this define for free; `lib` ones do not.
    define: { 'process.env.NODE_ENV': JSON.stringify('production') },
    build: {
        outDir: 'docs/view',
        emptyOutDir: false,
        cssCodeSplit: false,
        lib: {
            entry: path.resolve(__dirname, 'src/web/viewerMain.tsx'),
            formats: ['es'],
            fileName: () => 'viewer.js'
        }
    }
});
