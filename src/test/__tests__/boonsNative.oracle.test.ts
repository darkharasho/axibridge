/**
 * Boons oracle -- EI buff shapes vs blocks.boons.
 *
 * Unit 5a is the closest thing to a pure substitution in this migration: the
 * EI shim was already passing native's own numbers through, so the oracle's
 * job is less "did the arithmetic survive" than "is every reader actually on
 * the native path". Hence the strip test, and hence the per-source-join
 * invariant a hand-built fixture cannot pin: native keys by entity id where
 * EI keyed by character name, and names are not unique across agent
 * instances.
 *
 * The "intensity/duration uptime rule" test below is NOT a pin on this
 * unit's migrated code. It computes the rule inline against raw
 * `native.blocks.boons` and `ei.players` data to check the rule's PREMISE --
 * that EI and native agree once you know which fields to read under it. It
 * exercises no production reader: `getEntityBuffUptime`/
 * `getEntityBuffPresence` exist in bridge-metrics but have no caller in
 * `src/` or `packages/bridge-metrics/src` outside their own unit test.
 * 5a's four modules never needed uptime -- `buildBoonTables` reads
 * generation, the two timelines read `states` -- so nothing here is wired to
 * production. The live boon-uptime consumer is
 * `packages/bridge-metrics/src/computePlayerAggregation.ts` and
 * `src/shared/commanderMetrics/*`, which still read EI's `buffUptimes` and
 * belong to the aggregators unit, not this one. Do not read this test as
 * evidence that boon uptime is on native -- it isn't, yet.
 */
import { describe, expect, it } from 'vitest';
import { oracleFixture, expectEqualOrAllowlisted, type DivergenceAllowlist } from '../axilogOracle';
import { buildBoonTables, getEntityBoonGenerationMs } from '../../shared/boonGeneration';
import {
    createStabPerformanceAccumulator, ingestLogStabPerformance, finalizeStabPerformance,
} from '../../renderer/stats/computeStabPerformance';
import {
    createBoonUptimeTimelineAccumulator, ingestLogBoonUptimeTimeline, finalizeBoonUptimeTimeline,
} from '../../renderer/stats/computeBoonUptimeTimeline';

const ALLOWLIST: DivergenceAllowlist = {};

/**
 * These modules expose accumulator triples rather than one-shot functions, so
 * the oracle drives them the way the aggregator does.
 */
const runStab = (logs: any[]) => {
    const acc = createStabPerformanceAccumulator();
    logs.forEach((log) => ingestLogStabPerformance(log, acc));
    return finalizeStabPerformance(acc);
};

const runUptime = (logs: any[]) => {
    const acc = createBoonUptimeTimelineAccumulator();
    logs.forEach((log) => ingestLogBoonUptimeTimeline(log, acc));
    return finalizeBoonUptimeTimeline(acc);
};

describe('boons oracle -- EI shapes vs blocks.boons', () => {
    const { ei, native } = oracleFixture();
    const details = { ...ei, native } as any;
    const log = { filePath: 'fixture', details };
    const squad = native.entities.filter((e: any) => e.role === 'squad');

    it('builds the same boon tables the EI path built', () => {
        const { boonTables } = buildBoonTables([log]);
        expectEqualOrAllowlisted('boonTableCount', 12, boonTables.length, ALLOWLIST);

        // A player earns a table row for a boon only when generation or wasted
        // is non-zero, so row counts are per-boon, not fixed at squad size --
        // e.g. Might has 33 of 38 squad rows on this fixture (5 members
        // generated zero Might all log). That set is derivable independently
        // of buildBoonTables' own aggregation loop by calling the same
        // low-level reader (getEntityBoonGenerationMs) directly per entity,
        // per category, and checking which entities it credits with any
        // generation or waste -- so this pins the exact row membership per
        // table, not just a bound on the count.
        const durationMs = Number(native.encounter?.duration_ms ?? 0);
        const groupCounts = new Map<number, number>();
        squad.forEach((e: any) => {
            const group = e.subgroup ?? 0;
            groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
        });
        const squadCount = squad.length;
        const CATEGORIES = ['selfBuffs', 'groupBuffs', 'squadBuffs'] as const;

        for (const table of boonTables) {
            const boonId = Number(table.id.slice(1));
            const expectedAccounts = new Set<string>();
            for (const entity of squad) {
                const groupCount = groupCounts.get(entity.subgroup ?? 0) || 1;
                const hasGeneration = CATEGORIES.some((category) => {
                    const { generationMs, wastedMs } = getEntityBoonGenerationMs(
                        details, entity.id, category, boonId, durationMs, groupCount, squadCount,
                    );
                    return generationMs > 0 || wastedMs > 0;
                });
                if (hasGeneration) expectedAccounts.add(entity.account || entity.character || 'Unknown');
            }
            const actualAccounts = new Set(table.rows.map((row) => row.account));
            expect(actualAccounts.size, `${table.name} row count`).toBe(expectedAccounts.size);
            expect([...actualAccounts].sort(), `${table.name} row membership`)
                .toEqual([...expectedAccounts].sort());
        }
    });

    it('matches EI uptime per buff under the intensity/duration rule', () => {
        // NOT a pin on migrated code -- see the file docblock. This checks the
        // rule's premise (EI and native agree under it) using raw block/player
        // data directly; `getEntityBuffUptime`/`getEntityBuffPresence` have no
        // production caller yet, so this test cannot regress a real reader.
        // The rule, pinned against every buff/player pair rather than a sample:
        // EI's `uptime` is avg_stacks for intensity buffs and uptime_pct for
        // duration ones. 504 pairs on this fixture.
        const byAccount: Record<string, any> = {};
        for (const entity of native.entities) {
            const buffs = native.blocks.boons.by_entity[String(entity.id)];
            if (buffs) byAccount[entity.account] = buffs;
        }
        let compared = 0;
        for (const player of ei.players) {
            const buffs = byAccount[player.account];
            if (!buffs) continue;
            for (const buff of player.buffUptimes ?? []) {
                const entry = buffs[String(buff.id)];
                const eiUptime = buff.buffData?.[0]?.uptime;
                if (!entry || eiUptime == null) continue;
                const stacking = native.catalogs.buffs[String(buff.id)]?.stacking === 'intensity';
                const nativeUptime = stacking ? entry.avg_stacks : entry.uptime_pct;
                expect(Math.abs(Number(eiUptime) - Number(nativeUptime))).toBeLessThan(0.011);
                compared++;
            }
        }
        expect(compared).toBe(504);
    });

    it('resolves every per-source key to a real entity', () => {
        // A name-keyed join silently dropped sources whose names collided.
        // 1462 (entity, buff, source) triples on this fixture -- pinned exactly,
        // the same way `compared` is pinned to 504 above, so a join that starts
        // silently dropping resolvable sources (or gains spurious ones) fails
        // here instead of passing a `> 0` check.
        let sources = 0;
        for (const entity of squad) {
            const buffs = native.blocks.boons.by_entity[String(entity.id)] ?? {};
            for (const value of Object.values<any>(buffs)) {
                for (const sourceId of Object.keys(value?.per_source?.by_source ?? {})) {
                    expect(native.entities.some((e: any) => e.id === Number(sourceId))).toBe(true);
                    sources++;
                }
            }
        }
        expect(sources).toBe(1462);
    });

    it('never lets a condition into the boon path', () => {
        const { boonTables } = buildBoonTables([log]);
        const conditionNames = Object.values<any>(native.catalogs.buffs)
            .filter((b: any) => b.kind === 'condition')
            .map((b: any) => b.name);
        expect(conditionNames.length).toBeGreaterThan(0);
        for (const name of conditionNames) {
            expect(boonTables.some((t) => t.name === name)).toBe(false);
        }
    });

    it('reads no EI buff payload anywhere in the boon path', () => {
        // The only proof nothing fell back: strip EI's buff fields entirely
        // -- including the *Active variants (dpsReportTypes.ts selfBuffsActive/
        // groupBuffsActive/squadBuffsActive) that no current reader touches
        // but that were previously left standing, unproven -- and every
        // number must be unchanged.
        const stripped = {
            ...log,
            details: {
                ...details,
                players: ei.players.map((p: any) => ({
                    ...p,
                    buffUptimes: undefined,
                    buffUptimesActive: undefined,
                    selfBuffs: undefined,
                    groupBuffs: undefined,
                    squadBuffs: undefined,
                    selfBuffsActive: undefined,
                    groupBuffsActive: undefined,
                    squadBuffsActive: undefined,
                    activeTimes: undefined,
                })),
                buffMap: undefined,
            },
        };
        expect(buildBoonTables([stripped])).toEqual(buildBoonTables([log]));
        expect(runStab([stripped])).toEqual(runStab([log]));
        expect(runUptime([stripped])).toEqual(runUptime([log]));
    });

    it('keeps stability stacks within the game cap', () => {
        const stab = runStab([log]);
        expect(stab.fights).toHaveLength(1);
        const players = Object.values(stab.fights[0].players);
        expect(players.length).toBeGreaterThan(0);
        for (const player of players) {
            expect(player.stacks.length).toBe(stab.fights[0].bucketCount);
            for (const value of player.stacks) {
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThanOrEqual(25);
            }
        }
    });
});
