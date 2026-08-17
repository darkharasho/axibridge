import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';

import {
    AxilogManager,
    DEFAULT_PARSER_BACKEND,
    applyEiCompatShims,
    formatEncounterDuration,
    mapEiSettingsToAxilogOptions,
    normalizeParserBackend,
} from '../axilogParser';
import { DEFAULT_EI_SETTINGS } from '../eiParser';
import { pruneDetailsForStats, buildDashboardSummaryFromDetails, hasUsableFightDetails } from '../detailsProcessing';
import { getDistanceScalars, getPositionTracks, getArena } from '@axiapps/bridge-metrics/nativePositioning';
import { squadEntities } from '@axiapps/bridge-metrics/nativeRoster';

/**
 * Anonymized WvW fixture — every character name in it is an `Anon<N>`
 * placeholder, every account `:Anon<N>.<digits>`, every guild id zeroed, so it
 * carries no PII. It **is committed**, under an owner-authorized, narrow
 * negation of the blanket `*.zevtc` PII guard
 * (`!test-fixtures/axilog/*.anon.zevtc`), specifically so the real-parse block
 * below runs in CI rather than skipping. See `test-fixtures/axilog/README.md`
 * for the verification that was run before committing it.
 *
 * Resolution order (first hit wins):
 *   1. `AXILOG_FIXTURE` env var
 *   2. `test-fixtures/axilog/wvw-small.anon.zevtc` — the committed one
 *   3. a sibling axilog checkout's `fixtures/wvw-small.anon.zevtc`
 *
 * The skip guard on the block stays: the native binding resolves per-platform
 * via `optionalDependencies` and may genuinely be missing. The *fixture* half
 * of it should no longer ever fire in this repo.
 */
const COMMITTED_FIXTURE = path.resolve(__dirname, '../../../test-fixtures/axilog/wvw-small.anon.zevtc');

const FIXTURE_CANDIDATES = [
    process.env.AXILOG_FIXTURE,
    COMMITTED_FIXTURE,
    path.resolve(__dirname, '../../../../axilog/fixtures/wvw-small.anon.zevtc'),
].filter((p): p is string => Boolean(p));

const FIXTURE = FIXTURE_CANDIDATES.find((p) => fs.existsSync(p)) ?? FIXTURE_CANDIDATES[1];

// ─── Backend selection ────────────────────────────────────────────────────────

describe('shipped default backend', () => {
    it('defaults to axilog', () => {
        expect(DEFAULT_PARSER_BACKEND).toBe('axilog');
    });

    it('resolves every unrecognized value to axilog', () => {
        expect(normalizeParserBackend(undefined)).toBe('axilog');
        expect(normalizeParserBackend(null)).toBe('axilog');
        expect(normalizeParserBackend('')).toBe('axilog');
        expect(normalizeParserBackend('Axilog')).toBe('axilog');
        expect(normalizeParserBackend('elite insights')).toBe('axilog');
    });

    it('still honours an explicit elite-insights selection', () => {
        expect(normalizeParserBackend('elite-insights')).toBe('elite-insights');
    });

    it('coerces anything that is not an exact id to the shipped default', () => {
        // The hardening: a corrupt or hand-edited store can never land a user
        // on an engine they did not pick. Mis-cased and whitespace-padded
        // spellings of BOTH ids are rejected, so this test keeps its
        // discriminating power whichever way DEFAULT_PARSER_BACKEND points.
        for (const bad of ['AxiLog', ' axilog ', 'axi-log', 'Elite-Insights', ' elite-insights ', 'eliteinsights', 0, {}, []]) {
            expect(normalizeParserBackend(bad)).toBe(DEFAULT_PARSER_BACKEND);
        }
    });
});

// ─── Settings mapping ─────────────────────────────────────────────────────────

describe('mapEiSettingsToAxilogOptions', () => {
    it('maps the default EI settings onto the full read surface', () => {
        expect(mapEiSettingsToAxilogOptions(DEFAULT_EI_SETTINGS)).toEqual({
            replay: true,
            skillDamage: true,
            timeseries: true,
            rotation: true,
            modifiers: true,
        });
    });

    it('always requests replay, mirroring generateEiConf hardcoding ParseCombatReplay=True', () => {
        // `parseCombatReplay` controls post-parse RETENTION, not parsing —
        // the positions are what the derived distToCom/stackDist are built from.
        const off = mapEiSettingsToAxilogOptions({ ...DEFAULT_EI_SETTINGS, parseCombatReplay: false });
        const on = mapEiSettingsToAxilogOptions({ ...DEFAULT_EI_SETTINGS, parseCombatReplay: true });
        expect(off.replay).toBe(true);
        expect(on.replay).toBe(true);
    });

    it('maps computeDamageModifiers -> modifiers and rawTimelineArrays -> timeseries', () => {
        const opts = mapEiSettingsToAxilogOptions({
            ...DEFAULT_EI_SETTINGS,
            computeDamageModifiers: false,
            rawTimelineArrays: false,
        });
        expect(opts.modifiers).toBe(false);
        expect(opts.timeseries).toBe(false);
        // These have no EI conf counterpart (real EI always emits them).
        expect(opts.skillDamage).toBe(true);
        expect(opts.rotation).toBe(true);
    });

    it('treats missing settings as the permissive default', () => {
        expect(mapEiSettingsToAxilogOptions(undefined)).toEqual({
            replay: true,
            skillDamage: true,
            timeseries: true,
            rotation: true,
            modifiers: true,
        });
    });
});

// ─── Derived distance scalars: deleted in unit 3 ──────────────────────────────

describe('the parser no longer fabricates distance scalars', () => {
    it('exports no deriveDistanceScalars', async () => {
        const mod: any = await import('../axilogParser');
        expect(mod.deriveDistanceScalars).toBeUndefined();
        expect(mod.NO_DISTANCE).toBeUndefined();
        expect(mod.DEFAULT_POLLING_RATE_MS).toBeUndefined();
    });
});


// ─── EI-shape shims ───────────────────────────────────────────────────────────

describe('formatEncounterDuration', () => {
    it("uses EI's spelling", () => {
        expect(formatEncounterDuration(49285)).toBe('0m 49s 285ms');
        expect(formatEncounterDuration(83456)).toBe('1m 23s 456ms');
        expect(formatEncounterDuration(3723004)).toBe('1h 2m 3s 4ms');
    });
});

describe('applyEiCompatShims', () => {
    it('aliases character_name onto name and derives zone/encounterDuration', () => {
        const details: any = {
            fightName: 'Detailed WvW - Green Alpine Borderlands',
            durationMS: 49285,
            players: [{ account: ':Anon1.1111', character_name: 'Anon1' }],
        };
        applyEiCompatShims(details, FIXTURE);
        expect(details.players[0].name).toBe('Anon1');
        expect(details.zone).toBe('Green Alpine Borderlands');
        expect(details.encounterDuration).toBe('0m 49s 285ms');
    });

    it('derives timeStart/timeEnd from the native encounter start', () => {
        const details: any = {
            players: [],
            native: { axilog: {}, encounter: { started_at_unix: 1768702180, duration_ms: 10000 } },
        };
        applyEiCompatShims(details, FIXTURE);
        expect(details.timeStart).toBe(1768702180);
        expect(details.timeEnd).toBe(1768702190);
        expect(details.timeStartStd).toBe('2026-01-18 02:09:40 +00');
    });

    it('no longer infers timestamps from the log file mtime', () => {
        // The mtime is the fight end only for a log still sitting where arcdps
        // wrote it. Copied, restored or re-synced logs got a date wrong by
        // months — on the committed fixture, by 204 days. Absent beats invented:
        // callers fall back to uploadTime.
        const details: any = { durationMS: 10000, players: [] };
        applyEiCompatShims(details, __filename);
        expect(details.timeStart).toBeUndefined();
        expect(details.timeEnd).toBeUndefined();
        expect(details.timeStartStd).toBeUndefined();
    });

    it('prefers the native map over the fightName prefix-strip', () => {
        const details: any = {
            fightName: 'Detailed WvW - Eternal Battlegrounds',
            players: [],
            native: { axilog: {}, encounter: { map: 'Green Alpine Borderlands' } },
        };
        applyEiCompatShims(details, FIXTURE);
        expect(details.zone).toBe('Green Alpine Borderlands');
    });

    it('never overwrites values the parser already supplied', () => {
        const details: any = {
            fightName: 'X - Y',
            zone: 'Kept',
            durationMS: 1000,
            encounterDuration: 'Kept',
            timeStart: 42,
            timeEnd: 43,
            players: [{ name: 'Kept', character_name: 'Other' }],
        };
        applyEiCompatShims(details, FIXTURE);
        expect(details.zone).toBe('Kept');
        expect(details.encounterDuration).toBe('Kept');
        expect(details.timeStart).toBe(42);
        expect(details.players[0].name).toBe('Kept');
    });

    it('survives a missing log file', () => {
        const details: any = { durationMS: 1000, players: [] };
        expect(() => applyEiCompatShims(details, '/nope/does-not-exist.zevtc')).not.toThrow();
        expect(details.timeStart).toBeUndefined();
    });

    it('leaves timestamps undefined when the native parse failed', () => {
        // No native, no invented date — the whole point of retiring the mtime.
        const details: any = { durationMS: 1000, players: [], fightName: 'X - Y' };
        applyEiCompatShims(details, FIXTURE);
        expect(details.timeStart).toBeUndefined();
        expect(details.zone).toBe('Y');
        expect(details.encounterDuration).toBe('0m 1s 0ms');
    });
});

// ─── Manager ──────────────────────────────────────────────────────────────────

describe('AxilogManager', () => {
    it('reports unavailable when the native binding could not be loaded', async () => {
        const mgr = new AxilogManager(null);
        expect(mgr.isInstalled()).toBe(false);
        expect(mgr.getStatus().installed).toBe(false);
        await expect(mgr.parseLog(FIXTURE, 'log-1')).rejects.toThrow(/not available/i);
    });

    it('forwards the mapped options to parseFileEi and reports progress', async () => {
        const calls: any[] = [];
        const progress: string[] = [];
        const mgr = new AxilogManager({
            parseFileEi: (p, opts) => {
                calls.push([p, opts]);
                return { durationMS: 1000, players: [], fightName: 'Detailed WvW - Somewhere' };
            },
        });
        mgr.setSettings({ ...DEFAULT_EI_SETTINGS, computeDamageModifiers: false });
        mgr.setParseProgressCallback((line) => progress.push(line));

        const result: any = await mgr.parseLog('/tmp/fake.zevtc', 'log-1');

        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toBe('/tmp/fake.zevtc');
        expect(calls[0][1]).toEqual({ replay: true, skillDamage: true, timeseries: true, rotation: true, modifiers: false });
        // Shims applied on the way out.
        expect(result.zone).toBe('Somewhere');
        expect(progress.join('')).toContain('log-1');
    });

    it('round-trips settings', () => {
        const mgr = new AxilogManager(null);
        mgr.setSettings({ ...DEFAULT_EI_SETTINGS, parseCombatReplay: true });
        expect(mgr.getSettings().parseCombatReplay).toBe(true);
    });
});

// ─── Real-parse integration ───────────────────────────────────────────────────

// The native binding resolves per-platform via optionalDependencies; skip
// rather than fail on a platform npm has no prebuilt binary for.
let binding: any = null;
try {
    binding = require('@axiapps/axilog');
} catch {
    binding = null;
}

describe('real-parse fixture availability', () => {
    it('resolves the committed anonymized fixture, so the block below is not silently skipped', () => {
        // Follow-up 3 in docs/axilog-cutover-report.md, resolved: the fixture
        // is in-tree behind a narrow .gitignore negation. Without this
        // assertion a deleted or re-ignored fixture would turn the whole
        // integration block into a green no-op.
        expect(fs.existsSync(COMMITTED_FIXTURE)).toBe(true);
        expect(fs.existsSync(FIXTURE)).toBe(true);
    });
});

describe.runIf(binding && fs.existsSync(FIXTURE))('axilog real parse (anonymized WvW fixture)', () => {
    let details: any;

    beforeAll(async () => {
        const mgr = new AxilogManager();
        mgr.setSettings(DEFAULT_EI_SETTINGS);
        details = await mgr.parseLog(FIXTURE, 'fixture');
    }, 120_000);

    it('produces a parseLog-shaped EI JSON payload', () => {
        expect(details).toBeTruthy();
        expect(details.error).toBeUndefined();
        expect(hasUsableFightDetails(details)).toBe(true);
        expect(details.durationMS).toBeGreaterThan(0);
        expect(typeof details.fightName).toBe('string');
        expect(Array.isArray(details.players)).toBe(true);
        expect(Array.isArray(details.targets)).toBe(true);
        expect(details.players.length).toBeGreaterThan(0);
    });

    it('leaves statsAll[0].distToCom absent rather than reconstructing it', () => {
        // Absent beats invented. The EI side never carried these; axibridge
        // reconstructed them from pixel arrays with a rounded inchToPixel
        // (-3.12% systematic) and a first-commander-track approximation
        // standing in for real commander segments. axilog measures them
        // in-core now — see @axiapps/bridge-metrics/nativePositioning.
        const player = details.players.find((p: any) => !p.notInSquad);
        expect(player.statsAll[0].distToCom).toBeUndefined();
        expect(player.statsAll[0].stackDist).toBeUndefined();
    });

    it('carries every block the enabled ParseOptions gate', () => {
        const player = details.players.find((p: any) => !p.notInSquad);
        expect(player.dpsAll[0].damage).toBeGreaterThan(0);
        expect(player.statsAll[0]).toBeTruthy();
        expect(player.defenses[0]).toBeTruthy();
        expect(player.support[0]).toBeTruthy();
        expect(player.buffUptimes.length).toBeGreaterThan(0);
        expect(details.buffMap).toBeTruthy();
        expect(details.skillMap).toBeTruthy();
        // modifiers: true
        expect(details.damageModMap).toBeTruthy();
        // replay: true
        expect(details.combatReplayMetaData.pollingRate).toBeGreaterThan(0);
        expect(details.combatReplayMetaData.inchToPixel).toBeGreaterThan(0);
        expect(player.combatReplayData.positions.length).toBeGreaterThan(0);
        // skillDamage / timeseries / rotation: at least one squad player has each
        expect(details.players.some((p: any) => p.totalDamageDist?.[0]?.length)).toBe(true);
        expect(details.players.some((p: any) => p.damage1S?.[0]?.length)).toBe(true);
        expect(details.players.some((p: any) => p.rotation?.length)).toBe(true);
    });

    it('carries plausible native distToCom/stackDist for every squad player', () => {
        // These come from axilog's in-core pass now, not from a reconstruction
        // over EI's pixel arrays, and they are already world inches — there is
        // no inchToPixel division on this path to get wrong.
        const scalars = getDistanceScalars(details);
        expect(scalars.size).toBeGreaterThan(0);

        const squadIds = squadEntities(details.native).map((e: any) => e.id);
        expect(squadIds.length).toBeGreaterThan(0);

        const measured = squadIds
            .map((id: number) => scalars.get(id))
            .filter((s: any) => s && s.distToCom !== null && s.distToCom >= 0);
        expect(measured.length).toBeGreaterThan(squadIds.length / 2);

        for (const s of measured) {
            // Sane world-inch magnitudes: no NaN, no pixel-scale leakage, and
            // nothing wider than a WvW borderlands map.
            expect(Number.isFinite(s!.distToCom!)).toBe(true);
            expect(s!.distToCom!).toBeLessThan(200000);
            expect(s!.stackDist!).toBeGreaterThanOrEqual(0);
            expect(s!.stackDist!).toBeLessThan(200000);
        }
        // Not every player can be sitting exactly on the tag.
        expect(measured.some((s: any) => s.distToCom > 1)).toBe(true);

        // The bulk of a WvW squad stacks within a few hundred inches of the
        // tag; stragglers are real, so assert the median rather than the max.
        const sorted = measured.map((s: any) => s.distToCom).sort((a: number, b: number) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        expect(median).toBeGreaterThan(0);
        expect(median).toBeLessThan(2000);
    });

    it('survives the stats pruning pipeline in both retention modes', () => {
        const kept = pruneDetailsForStats(details, { keepReplayPositions: true });
        expect(kept.players[0].combatReplayData.positions.length).toBeGreaterThan(0);
        expect(getPositionTracks(kept).size).toBeGreaterThan(0);
        expect(getDistanceScalars(kept).size).toBeGreaterThan(0);

        const coarse = pruneDetailsForStats(details, { keepReplayPositions: false });
        expect(coarse.players[0].combatReplayData).toBeUndefined();
        // Coarse mode must drop BOTH sample surfaces, or it would be larger
        // after the migration than before it — 284 KB of native tracks against
        // 6.0 KB of intervals on this fixture.
        expect(getPositionTracks(coarse).size).toBe(0);
        expect(getArena(coarse)).toBeNull();
        // ...but the scalars and intervals survive: they ARE the coarse data
        // this mode exists to keep, and Closest-to-Tag still resolves from them.
        expect(getDistanceScalars(coarse).size).toBeGreaterThan(0);

        // And the source object is untouched — pruning returns a new tree.
        expect(getPositionTracks(details).size).toBeGreaterThan(0);
    });

    it('builds a dashboard summary with a non-degenerate enemy count', () => {
        const summary = buildDashboardSummaryFromDetails(details);
        expect(summary.hasPlayers).toBe(true);
        expect(summary.hasTargets).toBe(true);
        expect(summary.squadCount).toBeGreaterThan(0);
        expect(summary.enemyCount).toBeGreaterThan(0);
        expect(summary.isWin).not.toBeNull();
    });

    it('carries a per-target downs/kills split narrower than the whole-fight total', () => {
        // The `statsAll` substitution this once guarded against was deleted at
        // 0.3.4 (it was a deliberately high-biased substitute: it counts NPCs,
        // guards and siege too). What still needs pinning is that the split is
        // present AND genuinely per-target — on this fixture it totals 25
        // against statsAll's 49, so a regression that silently widened the
        // split back to whole-fight scope would show up here as equality.
        const sawSplit = details.players.some((p: any) =>
            (p.statsTargets ?? []).some((t: any) => t?.[0]?.downed !== undefined || t?.[0]?.killed !== undefined));
        expect(sawSplit).toBe(true);

        const splitTotal = details.players
            .filter((p: any) => !p.notInSquad)
            .reduce((sum: number, p: any) => sum + (p.statsTargets ?? []).reduce(
                (inner: number, t: any) => inner + Number(t?.[0]?.downed || 0) + Number(t?.[0]?.killed || 0), 0), 0);
        const statsAllTotal = details.players
            .filter((p: any) => !p.notInSquad)
            .reduce((sum: number, p: any) => sum + Number(p.statsAll?.[0]?.downed || 0) + Number(p.statsAll?.[0]?.killed || 0), 0);

        expect(splitTotal).toBeGreaterThan(0);
        expect(splitTotal).toBeLessThan(statsAllTotal);
    });

    it('emits the read-surface blocks that MEIGAP/MEIGAP2 closed', () => {
        // One assertion per gap the ORIGINAL audit listed as blocking the
        // default flip (its §4.2-§4.4; see §1.5 of the current report for the
        // closed list, which re-numbered these sections).
        // These are the fields whose absence rendered whole features blank, so
        // a silent upstream regression would be a silent UI regression.
        const players: any[] = details.players;
        const targets: any[] = details.targets;
        const some = (f: (p: any) => any) => players.some((p) => { try { return Boolean(f(p)); } catch { return false; } });

        // Boon-generation attribution (boonGeneration.ts, Stability generation).
        expect(some((p) => p.selfBuffs?.[0]?.buffData?.[0]?.generation !== undefined)).toBe(true);
        expect(some((p) => p.groupBuffs?.[0]?.buffData?.[0]?.generation !== undefined)).toBe(true);
        expect(some((p) => p.squadBuffs?.[0]?.buffData?.[0]?.generation !== undefined)).toBe(true);
        // Per-source boon timelines.
        expect(some((p) => p.buffUptimes?.[0]?.statesPerSource)).toBe(true);
        expect(some((p) => p.buffUptimes?.[0]?.states?.length)).toBe(true);
        // Incoming CC and incoming strips.
        expect(some((p) => p.defenses?.[0]?.receivedCrowdControl !== undefined)).toBe(true);
        expect(some((p) => p.defenses?.[0]?.boonStrips !== undefined)).toBe(true);
        // Per-ally / per-skill healing and barrier.
        expect(some((p) => p.extHealingStats?.outgoingHealingAllies)).toBe(true);
        expect(some((p) => p.extHealingStats?.totalHealingDist)).toBe(true);
        expect(some((p) => p.extBarrierStats?.outgoingBarrierAllies)).toBe(true);
        // Minion damage-taken rollups (the mitigation "avoided" minion term).
        expect(some((p) => p.minions?.length)).toBe(true);
        // Squad-guild auto-detection, boon-application counts, health timelines.
        expect(some((p) => typeof p.guildID === 'string')).toBe(true);
        expect(some((p) => p.boonsStates?.length)).toBe(true);
        expect(some((p) => p.healthPercents?.length)).toBe(true);
        // Power/condi split on the incoming series.
        expect(some((p) => p.powerDamageTaken1S?.[0]?.length)).toBe(true);
        // Outcome columns on the outgoing skill distribution.
        expect(some((p) => p.totalDamageDist?.[0]?.some((e: any) => e.connectedHits !== undefined))).toBe(true);
        // Breakbar damage.
        expect(some((p) => p.dpsAll?.[0]?.breakbarDamage !== undefined)).toBe(true);

        // Enemy-side: the damage-mitigation and incoming-conditions inputs.
        expect(targets.some((t) => t.totalDamageDist?.[0]?.length)).toBe(true);
        expect(targets.some((t) => t.damage1S?.[0]?.length)).toBe(true);
        expect(targets.some((t) => t.powerDamage1S?.[0]?.length)).toBe(true);
        expect(targets.some((t) => t.buffs?.[0]?.statesPerSource)).toBe(true);
        expect(targets.some((t) => t.dpsAll?.[0]?.damage !== undefined)).toBe(true);
    });

    it('emits the residuals axilog 0.3.2 and 0.3.4 closed', () => {
        // Promoted out of the inverse pin below as the dependency moved
        // 0.3.0 -> 0.3.2 -> 0.3.4. Each was a documented gap in §4.3 of the
        // cutover report; each now carries real values, not just keys, so these
        // assert on populated data rather than field presence alone.
        const players: any[] = details.players;

        // Boon overstack. Generation was already exact; `wasted` closes the
        // other half, so "how much of it was wasted" stops reading 0.
        const wastedCells = players.flatMap((p) =>
            ['selfBuffs', 'groupBuffs', 'squadBuffs'].flatMap((k) =>
                (p[k] ?? []).map((e: any) => e.buffData?.[0]?.wasted),
            ),
        ).filter((w) => w !== undefined);
        expect(wastedCells.length).toBeGreaterThan(0);
        expect(wastedCells.some((w) => w > 0)).toBe(true);

        // Deferred upstream until 0.3.2.
        expect(players.every((p) => typeof p.statsAll?.[0]?.saved === 'number')).toBe(true);
        expect(players.some((p) => p.statsAll[0].saved > 0)).toBe(true);

        // Enemy profession — every enemy player resolves a class, so the
        // per-target damage-split labels and the incoming-strike legend stop
        // falling back to the character name.
        const enemyPlayers = details.targets.filter((t: any) => t.enemyPlayer);
        expect(enemyPlayers.length).toBeGreaterThan(0);
        expect(enemyPlayers.every((t: any) => typeof t.profession === 'string' && t.profession)).toBe(true);

        // 0.3.4's headline closure: the per-target split widened 8 -> 23
        // fields, which retired BOTH remaining workarounds (the statsAll
        // offense fallback and the enemy-downs substitution). The 15 Offense
        // Detailed columns that had read 0 now source per-target throughout.
        // packages/bridge-metrics/src/__tests__/statsTargetsFieldSurface.test.ts
        // pins the individual field names; this pins the width.
        const perTarget = players[0].statsTargets[0][0];
        expect(Object.keys(perTarget).length).toBeGreaterThanOrEqual(23);
        for (const field of [
            'directDmg', 'missed', 'evaded', 'blocked', 'invulned',
            'appliedCrowdControlDownContribution', 'appliedCrowdControlDurationDownContribution',
        ]) {
            expect(perTarget[field], `per-target ${field}`).toBeDefined();
        }
    });

    it('keeps the enemy roster free of squad-side minions', () => {
        // 0.3.2 stopped enumerating squad pets, spirits, banners, conjures and
        // food as enemy targets (they were 48 of 0.3.0's 80 entries on this
        // fixture). Two consequences this pins, both correctness rather than
        // cosmetics:
        //   - friendly minion damage was being folded into the global ENEMY
        //     per-skill buckets behind damage mitigation;
        //   - downs credited against a squad member's own pet counted as ENEMY
        //     downs, inflating the fixture's split total 15 -> 25.
        // `statsTargets`/`targetDamageDist` are positionally indexed against
        // `targets`, so the three must stay the same length or every per-target
        // read silently misattributes.
        const targets: any[] = details.targets;
        expect(targets.length).toBeGreaterThan(0);
        expect(targets.every((t) => t.enemyPlayer)).toBe(true);

        for (const p of details.players) {
            if (Array.isArray(p.statsTargets)) expect(p.statsTargets.length).toBe(targets.length);
            if (Array.isArray(p.targetDamageDist)) expect(p.targetDamageDist.length).toBe(targets.length);
        }
    });

    it('leaves the documented residual gaps absent rather than faked', () => {
        // The inverse pin: §4 of the cutover report promises these are MISSING,
        // and the doc comment on DEFAULT_PARSER_BACKEND justifies the flip on
        // the basis that each degrades to 0/empty at a null-guarded read site.
        // If axilog starts emitting one, the report and comment go stale — fail
        // loudly rather than let the docs drift.
        const players: any[] = details.players;
        const every = (f: (p: any) => any) => players.every((p) => { try { return !f(p); } catch { return true; } });

        // Every reader falls back to character_name/name.
        expect(every((p) => p.display_name !== undefined)).toBe(true);
        // Skill/buff icon + classification metadata needs EI's bundled GW2 DB.
        // These close via NATIVE `catalogs` in units 5 and 7 of the migration —
        // to_ei_json does not map them, so on ei-json they stay absent.
        expect(Object.values(details.skillMap).every((s: any) => s.icon === undefined)).toBe(true);
        expect(Object.values(details.buffMap).every((b: any) => b.icon === undefined)).toBe(true);
        expect(Object.values(details.buffMap).every((b: any) => b.classification === undefined)).toBe(true);
    });
});

describe('native carry-set at the seam', () => {
    const fakeBinding = (native: any) => ({
        parseFileEi: () => ({ players: [], durationMS: 1000 }),
        parseFile: () => native,
    });

    it('attaches the pruned native report as details.native', async () => {
        const mgr = new AxilogManager(fakeBinding({
            axilog: { schema: '1.0' },
            encounter: { map: 'Green Alpine Borderlands' },
            entities: [],
            coverage: {},
            blocks: { replay: { tracks: [1, 2, 3] }, damage: { by_entity: {} } },
        }) as any);
        const details: any = await mgr.parseLog(FIXTURE, 'log-1');
        expect(details.native.encounter.map).toBe('Green Alpine Borderlands');
        // Unit 3 carries `blocks.replay` — and ONLY that block. `blocks`
        // wholesale is 2.4 MB; a silent widening here would be a 100x
        // payload regression in report.json.
        expect(details.native.blocks.replay.tracks).toEqual([1, 2, 3]);
        expect(Object.keys(details.native.blocks)).toEqual(['replay']);
    });

    it('leaves details.native absent when the native parse throws', async () => {
        const binding: any = {
            parseFileEi: () => ({ players: [] }),
            parseFile: () => { throw new Error('native boom'); },
        };
        const details: any = await new AxilogManager(binding).parseLog(FIXTURE, 'log-1');
        // Absent, NOT null and NOT {}: readers must be able to tell
        // "no native data" from "native data that is empty".
        expect('native' in details).toBe(false);
        expect(details.players).toEqual([]);
    });

    it('leaves details.native absent when the binding has no parseFile', async () => {
        const details: any = await new AxilogManager({ parseFileEi: () => ({ players: [] }) } as any)
            .parseLog(FIXTURE, 'log-1');
        expect('native' in details).toBe(false);
    });
});
