#!/usr/bin/env node
/**
 * Empirical validation gate for the revive derivation
 * (`docs/superpowers/specs/2026-09-09-detailed-resurrects-design.md`).
 *
 * Runs in two phases so the expensive half happens once:
 *
 *   node scripts/revive-validate.mjs extract [--stride 13] [--limit N]
 *       Parses a strided sample of the real arcdps log folder with axilog and
 *       writes one COMPACT core per log to `--cache` (default /tmp/revive-cores).
 *       A core is a minimal `details`-shaped object — squad roster, each
 *       player's `combatReplayData.down`/`dead`, and only the rotation entries
 *       for skills that could plausibly be a resurrect — which is exactly what
 *       `deriveReviveLogSummary` consumes. Cores stay in /tmp: they carry real
 *       account names and are never committed.
 *
 *   node scripts/revive-validate.mjs report [--cache DIR] [--gaps]
 *       Re-runs the derivation over the cached cores. Instant, so the catalog
 *       and its windows can be changed and re-measured without re-parsing.
 *       `--gaps` additionally prints, per candidate skill, the distribution of
 *       the delay from cast start to the next squad stand-up — the measurement
 *       the catalogued `windowMs` values are pinned against.
 *
 * The log folder comes from the dev app's own `logDirectory` setting, so this
 * measures the same logs the app does.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cwd = process.cwd();

// `--bundle` points the derivation at a different build of bridge-metrics, so a
// catalog change can be measured against the same cores as the build before it.
const bundleArg = process.argv.slice(2).indexOf('--bundle');
const BUNDLE = bundleArg >= 0
    ? path.resolve(process.argv.slice(2)[bundleArg + 1])
    : path.join(cwd, 'packages/bridge-metrics/dist/index.cjs');

const { deriveReviveLogSummary, classifyResurrectSkill } = require(BUNDLE);

// ─── Args ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const mode = argv.find((a) => !a.startsWith('-')) || 'report';
const flag = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const CACHE_DIR = flag('cache', path.join(os.tmpdir(), 'revive-cores'));
const STRIDE = Number(flag('stride', 13));
const LIMIT = Number(flag('limit', Infinity));

/**
 * Skills worth carrying into a core. Deliberately WIDER than the catalog: the
 * point of a cached core is to answer "what would adding skill X change?"
 * without re-parsing, which is impossible if the extract already filtered to
 * the ids the catalog happens to know today. Every GW2 skill whose description
 * or facts mention reviving, plus the hand/self channels and the spirit ids
 * that describe their revive only in the pet's own skill.
 */
const CANDIDATE_IDS = new Set([
    1066, 1175,                                   // Resurrect (hand), Bandage (self)
    10244, 25541,                                 // Illusion of Life
    12569, 69300,                                 // Spirit of Nature
    14419, 14569,                                 // Battle Standard
    9163, 24414,                                  // Signet of Mercy
    10611, 24544,                                 // Signet of Undeath
    5760, 5761, 5762, 5763,                       // Glyph of Renewal (attunement variants)
    24407, 24409, 24410, 24411,                   // Glyph of Renewal (duplicate ids)
    5573,                                         // Glyph of Renewal (base id)
    30123, 34309,                                 // "Search and Rescue!"
    31677, 55024, 55046,                          // Glyph of the Stars
    56920, 56921, 72103, 72114,                   // Function Gyro
    65179,                                        // Rescue Protocol
    12515,                                        // Lick Wounds
    9246,                                         // Merciful Intervention
    5867, 6091,                                   // Toss Elixir R
]);

const logDirectory = () => {
    const candidates = [
        path.join(os.homedir(), '.config/AxiBridge-Dev/config.json'),
        path.join(os.homedir(), '.config/AxiBridge/config.json'),
    ];
    for (const file of candidates) {
        if (!fs.existsSync(file)) continue;
        const dir = JSON.parse(fs.readFileSync(file, 'utf8'))?.logDirectory;
        if (dir && fs.existsSync(dir)) return dir;
    }
    return null;
};

const walk = (dir) => {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else if (/\.z?evtc$/.test(entry.name)) out.push(full);
    }
    return out;
};

// ─── extract ──────────────────────────────────────────────────────────────────

const extract = () => {
    const dir = logDirectory();
    if (!dir) {
        console.error('No logDirectory in the AxiBridge config — nothing to sample.');
        process.exit(1);
    }
    const axilog = require('@axiapps/axilog');
    const all = walk(dir).sort();
    const sample = all.filter((_, i) => i % STRIDE === 0).slice(0, LIMIT);

    console.log(`${all.length} logs in ${dir}`);
    console.log(`Sampling every ${STRIDE}th -> ${sample.length} logs into ${CACHE_DIR}\n`);
    fs.mkdirSync(CACHE_DIR, { recursive: true });

    let failed = 0;
    let done = 0;
    for (const logPath of sample) {
        const id = path.basename(logPath).replace(/\.[^.]+$/, '');
        const outPath = path.join(CACHE_DIR, `${id}.json`);
        if (fs.existsSync(outPath)) { done += 1; continue; }

        let details;
        try {
            // Only what the derivation reads. Skipping skillDamage/timeseries/
            // modifiers keeps the sample parse well under the full app parse.
            details = axilog.parseFileEi(logPath, { replay: true, rotation: true });
        } catch (error) {
            failed += 1;
            console.error(`  ${id}: parse failed — ${error?.message || error}`);
            continue;
        }

        const skillMap = {};
        const players = (Array.isArray(details?.players) ? details.players : []).map((player) => {
            const rotation = [];
            for (const entry of Array.isArray(player?.rotation) ? player.rotation : []) {
                if (!CANDIDATE_IDS.has(Number(entry?.id))) continue;
                const key = `s${entry.id}`;
                if (details?.skillMap?.[key]) skillMap[key] = details.skillMap[key];
                rotation.push({
                    id: entry.id,
                    skills: (Array.isArray(entry.skills) ? entry.skills : [])
                        .map((s) => ({ castTime: s?.castTime, duration: s?.duration })),
                });
            }
            return {
                account: player?.account, name: player?.name, profession: player?.profession,
                notInSquad: player?.notInSquad,
                combatReplayData: {
                    down: player?.combatReplayData?.down ?? null,
                    dead: player?.combatReplayData?.dead ?? null,
                },
                rotation,
            };
        });

        fs.writeFileSync(outPath, JSON.stringify({
            id, durationMS: details?.durationMS, skillMap, players,
        }));
        done += 1;
        if (done % 25 === 0) console.log(`  ${done}/${sample.length}`);
    }

    console.log(`\nExtracted ${done} core(s), ${failed} parse failure(s).`);
};

// ─── report ───────────────────────────────────────────────────────────────────

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(2)}%` : '—');

const quantile = (sorted, q) =>
    sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : null;

const report = () => {
    if (!fs.existsSync(CACHE_DIR)) {
        console.error(`No cores in ${CACHE_DIR} — run the extract phase first.`);
        process.exit(1);
    }
    const files = fs.readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json')).sort();

    const squad = { downs: 0, recovered: 0, died: 0 };
    const byKind = { hand: 0, utility: 0, self: 0, unattributed: 0 };
    const utilities = new Map();
    const perLogUnattributed = [];
    let withoutData = 0;

    // Cast-start -> next squad stand-up delays, per candidate skill. Measured
    // over ALL candidate casts, catalogued or not, so an uncatalogued skill can
    // be judged before it is added.
    const gaps = new Map();

    for (const file of files) {
        const core = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf8'));
        const summary = deriveReviveLogSummary(core);
        if (!summary.hasData) { withoutData += 1; continue; }

        squad.downs += summary.downs;
        squad.recovered += summary.recovered;
        squad.died += summary.died;
        for (const kind of Object.keys(byKind)) byKind[kind] += summary.byKind[kind];
        if (summary.recovered > 0) {
            perLogUnattributed.push(summary.byKind.unattributed / summary.recovered);
        }

        summary.utilities.forEach((tally, skillId) => {
            const row = utilities.get(skillId) || { name: tally.name, casts: 0, revives: 0 };
            row.casts += tally.casts;
            row.revives += tally.revives;
            utilities.set(skillId, row);
        });

        if (!has('gaps')) continue;

        const standUps = [];
        for (const player of core.players) {
            if (player?.notInSquad) continue;
            const down = Array.isArray(player?.combatReplayData?.down) ? player.combatReplayData.down : [];
            const dead = Array.isArray(player?.combatReplayData?.dead) ? player.combatReplayData.dead : [];
            for (const [, end] of down) {
                if (dead.some(([ds]) => Math.abs(ds - end) <= 250)) continue;
                standUps.push(end);
            }
        }
        standUps.sort((a, b) => a - b);

        for (const player of core.players) {
            if (player?.notInSquad) continue;
            for (const entry of player.rotation || []) {
                const id = Number(entry.id);
                if (id === 1066 || id === 1175) continue;
                const name = core.skillMap?.[`s${id}`]?.name || String(id);
                for (const cast of entry.skills || []) {
                    const start = Number(cast?.castTime);
                    if (!Number.isFinite(start)) continue;
                    const next = standUps.find((t) => t >= start);
                    const key = `${id}|${name}`;
                    if (!gaps.has(key)) gaps.set(key, { casts: 0, delays: [] });
                    const row = gaps.get(key);
                    row.casts += 1;
                    if (next != null && next - start <= 60000) row.delays.push(next - start);
                }
            }
        }
    }

    console.log(`Cores: ${files.length} (${withoutData} without revive data)\n`);
    console.log(`Downs ${squad.downs} · recovered ${squad.recovered} · died ${squad.died}\n`);
    console.log('| Bucket | Count | % of recoveries |');
    console.log('|---|---|---|');
    for (const kind of ['hand', 'utility', 'self', 'unattributed']) {
        console.log(`| ${kind} | ${byKind[kind]} | ${pct(byKind[kind], squad.recovered)} |`);
    }

    const sortedLogs = perLogUnattributed.slice().sort((a, b) => a - b);
    const mean = perLogUnattributed.reduce((a, b) => a + b, 0) / (perLogUnattributed.length || 1);
    console.log(
        `\nPer-log unattributed: median ${pct(quantile(sortedLogs, 0.5), 1)}, `
        + `p75 ${pct(quantile(sortedLogs, 0.75), 1)}, unweighted mean ${pct(mean, 1)} `
        + `over ${perLogUnattributed.length} logs with >=1 recovery`
    );

    console.log('\n| Skill id | Name | Casts | Revives |');
    console.log('|---|---|---|---|');
    for (const [id, row] of [...utilities.entries()].sort((a, b) => b[1].revives - a[1].revives)) {
        console.log(`| ${id} | ${row.name} | ${row.casts} | ${row.revives} |`);
    }

    if (!has('gaps')) return;

    console.log('\nCast -> next squad stand-up delay, per candidate skill:\n');
    console.log('| Skill id | Name | In catalog | Casts | p10 | median | p90 | <=1s | <=2s | <=5s |');
    console.log('|---|---|---|---|---|---|---|---|---|---|');
    const rows = [...gaps.entries()].sort((a, b) => b[1].casts - a[1].casts);
    for (const [key, row] of rows) {
        const [id, name] = key.split('|');
        const delays = row.delays.slice().sort((a, b) => a - b);
        const under = (ms) => delays.filter((d) => d <= ms).length;
        const known = classifyResurrectSkill(Number(id), { [`s${id}`]: { name } });
        console.log(
            `| ${id} | ${name} | ${known ? known.kind : '—'} | ${row.casts} `
            + `| ${quantile(delays, 0.1)} | ${quantile(delays, 0.5)} | ${quantile(delays, 0.9)} `
            + `| ${under(1000)} | ${under(2000)} | ${under(5000)} |`
        );
    }
};

if (mode === 'extract') extract();
else if (mode === 'report') report();
else {
    console.error(`Unknown mode "${mode}" — use "extract" or "report".`);
    process.exit(1);
}
