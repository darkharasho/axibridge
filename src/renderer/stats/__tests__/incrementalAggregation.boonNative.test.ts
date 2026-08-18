import { describe, it, expect } from 'vitest';
import { computeStatsSync } from '../incrementalAggregation';

/**
 * `ingestLog` does not hand `buildBoonTables` the whole details object — it
 * stores a hand-picked slim projection, because keeping every log's full
 * details OOMs at ~89 logs.
 *
 * Unit 5a moved `buildBoonTables` onto native (`squadEntities(details.native)`
 * for the roster, `native.blocks.boons` for generation) but left the projection
 * carrying only the EI `selfBuffs`/`groupBuffs`/`squadBuffs` arrays it no
 * longer reads. Every log therefore reached the builder with `native`
 * undefined: empty roster, zero rows, every boon table filtered out, and every
 * boon card stuck on "0.0% uptime / No data available".
 *
 * These tests pin the projection to what the reader actually reads.
 */

const PROTECTION = 717;
const MIGHT = 740;

const nativeBoonLog = () => ({
    id: 'log-boons',
    filePath: 'boons.zevtc',
    details: {
        durationMS: 60000,
        fightName: 'Skirmish',
        buffMap: {},
        skillMap: {},
        targets: [],
        players: [
            {
                account: 'Giver.1111', name: 'Giver', profession: 'Firebrand', group: 1,
                notInSquad: false, activeTimes: [60000],
                dpsAll: [{ damage: 100, dps: 1 }],
                defenses: [{ damageTaken: 0, downCount: 0, deadCount: 0 }],
                statsAll: [{}],
                // Deliberately empty: the migrated reader must not depend on these.
                selfBuffs: [], groupBuffs: [], squadBuffs: [],
            },
            {
                account: 'Taker.2222', name: 'Taker', profession: 'Scourge', group: 1,
                notInSquad: false, activeTimes: [60000],
                dpsAll: [{ damage: 100, dps: 1 }],
                defenses: [{ damageTaken: 0, downCount: 0, deadCount: 0 }],
                statsAll: [{}],
                selfBuffs: [], groupBuffs: [], squadBuffs: [],
            },
        ],
        native: {
            axilog: { schema: '1.0' },
            encounter: { map: 'Green Alpine Borderlands', duration_ms: 60000, started_at_unix: 1755000000 },
            entities: [
                { id: 1, account: 'Giver.1111', character: 'Giver', role: 'squad', subgroup: 1, profession: 'Guardian', elite_spec: 'Firebrand' },
                { id: 2, account: 'Taker.2222', character: 'Taker', role: 'squad', subgroup: 1, profession: 'Necromancer', elite_spec: 'Scourge' },
            ],
            catalogs: {
                buffs: {
                    [PROTECTION]: { name: 'Protection', kind: 'boon', stacking: 'duration', max_stacks: 1 },
                    [MIGHT]: { name: 'Might', kind: 'boon', stacking: 'intensity', max_stacks: 25 },
                },
            },
            blocks: {
                replay: {
                    by_entity: {
                        1: { start_ms: 0, end_ms: 60000, active_ms: 60000, down: [], dead: [], dc: [] },
                        2: { start_ms: 0, end_ms: 60000, active_ms: 60000, down: [], dead: [], dc: [] },
                    },
                    // The heavy sibling: it must NOT be needed by the boon math.
                    tracks: { by_entity: {} },
                },
                boons: {
                    by_entity: {
                        1: {
                            [PROTECTION]: { uptime_pct: 80, generation: { self_pct: 10, group_pct: 40, squad_pct: 35 } },
                            [MIGHT]: { avg_stacks: 15, uptime_pct: 95, generation: { self_pct: 5, group_pct: 12, squad_pct: 9 } },
                        },
                        2: {
                            [PROTECTION]: { uptime_pct: 60, generation: { self_pct: 0, group_pct: 0, squad_pct: 0 } },
                            [MIGHT]: { avg_stacks: 12, uptime_pct: 90, generation: { self_pct: 0, group_pct: 0, squad_pct: 0 } },
                        },
                    },
                },
            },
        },
    },
});

const aggregate = () => computeStatsSync({ logs: [nativeBoonLog()] }).stats;

describe('boon tables on a native parse', () => {
    it('builds a leaderboard for every boon with generation, not an empty set', () => {
        const stats: any = aggregate();
        expect(Object.keys(stats.boonLeaderboards ?? {}).sort()).toEqual([`b${PROTECTION}`, `b${MIGHT}`].sort());
    });

    it('ranks the generating player on Protection — the card that read 0.0%', () => {
        const stats: any = aggregate();
        const rows = stats.boonLeaderboards[`b${PROTECTION}`];
        expect(rows.length).toBeGreaterThan(0);
        expect(rows[0].account).toBe('Giver.1111');
        expect(rows[0].value).toBeGreaterThan(0);
    });

    it('labels the row with the elite spec, not the base class', () => {
        const stats: any = aggregate();
        expect(stats.boonLeaderboards[`b${PROTECTION}`][0].profession).toBe('Firebrand');
    });

    it('produces boon tables carrying rows for both boons', () => {
        const stats: any = aggregate();
        const ids = (stats.boonTables ?? []).map((t: any) => t.id).sort();
        expect(ids).toEqual([`b${PROTECTION}`, `b${MIGHT}`].sort());
        for (const table of stats.boonTables) expect(table.rows.length).toBeGreaterThan(0);
    });
});
