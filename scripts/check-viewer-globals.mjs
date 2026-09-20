/**
 * Fails if the built share viewer reaches for a Node global the browser does
 * not have.
 *
 * The viewer is a Vite *library* build, and library mode deliberately leaves
 * `process.env.NODE_ENV` unreplaced so a consuming bundler can substitute it.
 * This bundle has no consumer — the Worker's boot HTML loads it straight from
 * `<script type="module">` — so an unreplaced reference is a hard
 * `ReferenceError: process is not defined` at load, before anything renders.
 * `vite.viewer.config.ts` pins the define; this check is what notices if that
 * define is ever dropped, since neither the type check nor the unit tests
 * execute the built bundle.
 *
 * A reference guarded by `typeof process` is fine: that idiom is how library
 * code feature-detects Node, and it never evaluates `process` in a browser.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const OUT_DIR = path.resolve(process.cwd(), 'docs', 'view');

/** How far back to look for a `typeof process` guard on the same expression. */
const GUARD_WINDOW = 200;

const collectJsFiles = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return collectJsFiles(full);
        return entry.isFile() && full.endsWith('.js') ? [full] : [];
    });

const unguardedHits = (source) => {
    const hits = [];
    const pattern = /\bprocess\s*\./g;
    let match;
    while ((match = pattern.exec(source)) !== null) {
        const window = source.slice(Math.max(0, match.index - GUARD_WINDOW), match.index);
        if (!/typeof\s+process\s*[<!=]/.test(window)) {
            hits.push(source.slice(Math.max(0, match.index - 60), match.index + 60));
        }
    }
    return hits;
};

let failed = false;
for (const file of collectJsFiles(OUT_DIR)) {
    const hits = unguardedHits(readFileSync(file, 'utf8'));
    if (hits.length === 0) continue;
    failed = true;
    console.error(`${path.relative(process.cwd(), file)}: ${hits.length} unguarded \`process.\` reference(s):`);
    // A dropped define reintroduces ~112 of these at once; a handful of
    // samples identifies the cause without burying the CI log.
    for (const hit of hits.slice(0, 5)) console.error(`  …${hit.replace(/\n/g, ' ')}…`);
    if (hits.length > 5) console.error(`  …and ${hits.length - 5} more.`);
}

if (failed) {
    console.error(
        '\nThe share viewer bundle would throw `ReferenceError: process is not defined` in a browser.\n'
        + 'Check that vite.viewer.config.ts still defines `process.env.NODE_ENV`.'
    );
    process.exit(1);
}

console.log('check-viewer-globals: no unguarded Node globals in docs/view/');
