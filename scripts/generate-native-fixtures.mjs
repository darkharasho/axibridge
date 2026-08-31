#!/usr/bin/env node
/**
 * Generate native-container fixtures from the raw `.zevtc` logs in `testdata/`.
 *
 * `test-fixtures/boon/` was captured by uploading to dps.report and pulling the
 * hosted Elite Insights JSON. Since the axilog cutover the app parses locally
 * and the migrated readers — outgoing conditions, the map replay — read
 * `details.native`, which hosted EI JSON has never carried. So those fixtures
 * exercise the `!native` early-return and nothing else: `computeOutgoingConditions`
 * returns empty and `buildMovementData` returns null, which is what left
 * `audit:conditions` failing on every fixture and the replay e2e specs unable
 * to render a canvas.
 *
 * This script produces the OTHER half: details objects shaped exactly as
 * `AxilogManager.parseLog` produces them at runtime — EI-shaped output from
 * `parseFileEi`, plus the `native` carry set, plus the EI-compat shims — so a
 * fixture and a real parse cannot drift in shape.
 *
 *   node scripts/generate-native-fixtures.mjs              # every testdata/*.zevtc
 *   node scripts/generate-native-fixtures.mjs 20260117-175120
 *
 * ## On PII
 *
 * Output goes through `scripts/obfuscate-accounts.mjs`, the same pass the
 * dps.report fixtures got: account names are replaced by deterministic fakes,
 * character names and guild IDs are left as-is. That is the existing standard
 * for `test-fixtures/boon/`, and these are the same eight logs already
 * committed there in EI form, so this adds no PII the repo does not already
 * carry.
 *
 * axilog's `anonymizeFile` would rewrite character names too, and was tried
 * first — but it CHANGES THE PARSE, so it is deliberately not used here. On
 * 20260117-175120 it moved the entity count 135 -> 156, friendly players
 * 17 -> 38, and `players[]` 22 -> 43.
 *
 * That divergence was originally read as "anonymization promotes the agents
 * arcdps recorded nameless (allies out of render range) into full roster
 * entries". It was the opposite: the 38 was right and the 17 was the bug.
 * arcdps anonymises non-squad friendlies by replacing `character` with the
 * elite-spec label ("Druid", "Scrapper"), and axilog's `dedupe_players` fell
 * back to `character` when `account` was blank — so every pug sharing a spec
 * collapsed into one person, capping the ally roster at *distinct specs
 * present*. Giving every agent a unique fake name simply defeated that
 * collapse. Fixed upstream in axilog 1.10.2 (the friendly dedupe now falls
 * back to instid, GW2EI's own non-squad rule), and this script now produces
 * 43 `players[]` on that log with no anonymization at all — the same number,
 * and matching a GW2EI 3.21 CLI oracle on all eight logs.
 *
 * The original conclusion still holds for the reason it was written, though:
 * a fixture whose roster is an artifact of its own anonymization is worse
 * than no fixture.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const cwd = process.cwd();

const SRC_DIR = path.join(cwd, 'testdata');
const OUT_DIR = path.join(cwd, 'test-fixtures/native');

// ─── Load the app's own parse path from SOURCE ────────────────────────────────
// Not from `dist-electron/`: a compiled copy goes stale silently, and a fixture
// generated from stale compile output is a fixture that disagrees with the
// shipping parser for reasons nobody can see. Same TS-in-a-sandbox loader
// `conditions-audit.mjs` uses.

const moduleCache = new Map();

const resolveModulePath = (fromDir, req) => {
    const base = path.resolve(fromDir, req);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
};

const loadTsModule = (filePath) => {
    const absPath = path.resolve(filePath);
    if (moduleCache.has(absPath)) return moduleCache.get(absPath).exports;

    const js = ts.transpileModule(fs.readFileSync(absPath, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;

    const module = { exports: {} };
    const sandboxRequire = (req) => {
        if (!req.startsWith('.')) return require(req);
        const resolved = resolveModulePath(path.dirname(absPath), req);
        return resolved ? loadTsModule(resolved) : {};
    };
    vm.runInNewContext(js, { exports: module.exports, module, require: sandboxRequire, console }, { filename: absPath });
    moduleCache.set(absPath, module);
    return module.exports;
};

const { mapParserSettingsToAxilogOptions, applyEiCompatShims } = loadTsModule(
    path.join(cwd, 'src/main/axilogParser.ts')
);
const { buildNativeCarrySet } = loadTsModule(path.join(cwd, 'src/main/nativeCarrySet.ts'));

let axilog;
try {
    axilog = require('@axiapps/axilog');
} catch (error) {
    console.error('@axiapps/axilog did not load — cannot generate native fixtures.');
    console.error(String(error));
    process.exit(1);
}

// ─── Parse options ────────────────────────────────────────────────────────────
// Derived from the app's DEFAULT settings through the app's own mapping rather
// than hardcoded, so a fixture regenerated after a settings-mapping change
// tracks it. `parseCombatReplay` is deliberately absent from the mapping (see
// `mapParserSettingsToAxilogOptions`): `replay` is unconditionally on at parse
// time and the user setting only governs post-parse pruning, which fixtures skip.
const PARSE_OPTIONS = mapParserSettingsToAxilogOptions({
    rawTimelineArrays: true,
    computeDamageModifiers: true,
});

// ─── Generate ─────────────────────────────────────────────────────────────────

const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));

if (!fs.existsSync(SRC_DIR)) {
    console.error(`No ${path.relative(cwd, SRC_DIR)}/ directory — nothing to parse.`);
    process.exit(1);
}

const sources = fs
    .readdirSync(SRC_DIR)
    .filter((name) => name.endsWith('.zevtc') || name.endsWith('.evtc'))
    .filter((name) => requested.length === 0 || requested.some((r) => name.startsWith(r)))
    .sort();

if (sources.length === 0) {
    console.error(requested.length ? `No testdata log matched: ${requested.join(', ')}` : 'No logs in testdata/.');
    process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const written = [];
for (const name of sources) {
    const logPath = path.join(SRC_DIR, name);
    const id = name.replace(/\.[^.]+$/, '');
    const outPath = path.join(OUT_DIR, `${id}.json`);
    const started = Date.now();

    const details = axilog.parseFileEi(logPath, PARSE_OPTIONS);
    const carry = buildNativeCarrySet(axilog.parseFile(logPath, PARSE_OPTIONS));
    if (!carry) {
        console.error(`  ${id}: native parse produced no carry set — skipping.`);
        continue;
    }
    details.native = carry;
    applyEiCompatShims(details, logPath);

    fs.writeFileSync(outPath, JSON.stringify(details), 'utf8');
    execFileSync(process.execPath, [path.join(cwd, 'scripts/obfuscate-accounts.mjs'), outPath], { stdio: 'ignore' });

    const mb = fs.statSync(outPath).size / 1048576;
    console.log(
        `  ${id}: ${details.players.length} players, ${details.targets.length} targets, `
        + `${carry.entities.length} entities, ${mb.toFixed(1)} MB (${Date.now() - started}ms)`
    );
    written.push(id);
}

console.log(`\nWrote ${written.length} native fixture(s) to ${path.relative(cwd, OUT_DIR)}/`);
