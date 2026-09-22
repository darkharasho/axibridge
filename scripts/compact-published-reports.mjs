#!/usr/bin/env node
/**
 * Rewrites already-published reports from the legacy plain `report.json` into
 * the gzipped parts + stub format that AxiBridge 3.10+ publishes.
 *
 * Why this is worth doing: GitHub Pages re-checks-out and re-deploys the whole
 * site on every publish, so the size of the site is a tax on every future
 * publish, not just the one that wrote the file. On one real report repo the
 * legacy reports were 1346 MB of the 1535 MB tree and the Pages checkout step
 * alone took 2m45s. Compaction is ~5.5x, so that tree drops to roughly 250 MB.
 *
 * The published viewer reads both shapes (see fetchReportPayload), so
 * converted reports keep working and no viewer change is needed.
 *
 * Usage:
 *   node scripts/compact-published-reports.mjs <repo-dir>            # dry run
 *   node scripts/compact-published-reports.mjs <repo-dir> --apply
 *   node scripts/compact-published-reports.mjs <repo-dir> --apply --limit 5
 *
 * <repo-dir> is a local clone of the *published Pages repo* (the one holding
 * reports/, assets/, index.html), not this source repo. Commit and push it
 * yourself afterwards so you get to look at the diff first.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The real publish code, so this script cannot drift from the format the
// viewer actually reads. It is CJS emitted by `tsc -p electron/tsconfig.json`.
const distMain = path.join(projectRoot, 'dist-electron', 'main', 'webReportParts.js');
if (!fs.existsSync(distMain)) {
    console.error(`Missing ${path.relative(projectRoot, distMain)}.\nRun: npx tsc -p electron/tsconfig.json`);
    process.exit(1);
}
const { writeReportParts, REPORT_JSON_FILENAME, REPORT_PARTS_BASENAME } = require(distMain);
const { readPartsManifest } = require(path.join(projectRoot, 'dist-electron', 'shared', 'chunkedGzip.js'));

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;
// Skip both the flags and `--limit`'s value; whatever positional is left is the repo.
const repoDir = args.find((a, i) => !a.startsWith('--') && !(limitArg >= 0 && i === limitArg + 1));

if (!repoDir) {
    console.error('Usage: node scripts/compact-published-reports.mjs <repo-dir> [--apply] [--limit N]');
    process.exit(1);
}

const reportsDir = path.join(repoDir, 'reports');
if (!fs.existsSync(reportsDir)) {
    console.error(`No reports/ directory under ${repoDir} — is that the published Pages repo?`);
    process.exit(1);
}

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

const candidates = [];
for (const entry of fs.readdirSync(reportsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(reportsDir, entry.name);
    const reportPath = path.join(dir, REPORT_JSON_FILENAME);
    if (!fs.existsSync(reportPath)) continue;

    const raw = fs.readFileSync(reportPath);
    let payload;
    try {
        payload = JSON.parse(raw.toString('utf8'));
    } catch {
        console.warn(`! ${entry.name}: report.json is not valid JSON — skipping`);
        continue;
    }
    // Already converted by a previous run, or published by 3.10+.
    if (readPartsManifest(payload)) continue;
    if (!payload?.meta || !payload?.stats) {
        console.warn(`! ${entry.name}: no meta/stats — not a report payload, skipping`);
        continue;
    }
    candidates.push({ id: entry.name, dir, raw, payload });
}

candidates.sort((a, b) => b.raw.length - a.raw.length);
const selected = candidates.slice(0, limit);

if (selected.length === 0) {
    console.log('Nothing to compact — every report is already in the parts format.');
    process.exit(0);
}

console.log(`${candidates.length} legacy report(s) found, ${mb(candidates.reduce((n, c) => n + c.raw.length, 0))} total.`);
console.log(apply ? `Converting ${selected.length}...\n` : `Dry run (pass --apply to write). Showing ${selected.length}:\n`);

let before = 0;
let after = 0;
for (const { id, dir, raw, payload } of selected) {
    before += raw.length;
    if (!apply) {
        console.log(`  ${id}  ${mb(raw.length)}`);
        continue;
    }
    // A prior partial run could have left parts whose count no longer matches
    // the manifest we are about to write; those would be dead files the next
    // publish never touches.
    for (const file of fs.readdirSync(dir)) {
        if (file.startsWith(`${REPORT_PARTS_BASENAME}.`)) fs.rmSync(path.join(dir, file));
    }
    writeReportParts(dir, raw, payload);
    const written = fs.readdirSync(dir)
        .filter((f) => f === REPORT_JSON_FILENAME || f.startsWith(`${REPORT_PARTS_BASENAME}.`))
        .reduce((n, f) => n + fs.statSync(path.join(dir, f)).size, 0);
    after += written;
    console.log(`  ${id}  ${mb(raw.length)} -> ${mb(written)}`);
}

console.log();
if (apply) {
    console.log(`Done: ${mb(before)} -> ${mb(after)} (${(before / Math.max(after, 1)).toFixed(1)}x smaller).`);
    console.log(`Review and publish with:\n  cd ${repoDir} && git add -A && git commit -m "Compact legacy reports" && git push`);
} else {
    console.log(`Would convert ${mb(before)}. Re-run with --apply.`);
}
