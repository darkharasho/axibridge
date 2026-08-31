import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IncrementalAggregator, computeStatsSync } from '../incrementalAggregation';
/**
 * Read at runtime rather than `import`ed: a static import of these fixtures
 * gives `tsc --noEmit` a multi-megabyte structural literal to infer, and
 * enough files doing it push `npm run typecheck` past its 8 GB heap.
 */
const fixture = (dir: string, name: string) => JSON.parse(
    readFileSync(resolve(process.cwd(), `test-fixtures/${dir}/${name}.json`), 'utf8'),
);
const fixture1 = fixture('boon', '20260117-175120');
const fixture2 = fixture('boon', '20260117-180135');
const fixture3 = fixture('boon', '20260117-180259');
// Fixture with actual squad deaths + commander replay positions, so
// tagDistanceDeaths produces a non-empty events array.
const fixtureDeaths = fixture('dmg-mit', '20260205-191132');

const makeLogs = (...fixtures: any[]) =>
    fixtures.map((f, i) => ({
        id: `log-${i}`,
        filePath: `test-${i}.zevtc`,
        details: f,
    }));

const ARENA = {
    image_width: 697, image_height: 1000, image_url: 'x',
    world_min_x: -30720, world_min_y: -43008, world_max_x: 30720, world_max_y: 43008,
};

/**
 * A minimal NATIVE fight with two squad deaths: one on-tag, one run-back.
 * The committed EI goldens predate the migration and carry no `native` block,
 * so a positions-bearing fixture has to be built in native shape.
 */
const nativeDeathLog = (startedAtIso: string) => {
    const pollMs = 300;
    const samples = (x: number, n: number) =>
        Array.from({ length: n }, (_, i) => [(i + 1) * pollMs, x, 0] as [number, number, number]);
    return {
        id: 'log-native-deaths',
        filePath: 'native-deaths.zevtc',
        details: {
            durationMS: 6000,
            fightName: 'Skirmish',
            // A real parse returns BOTH surfaces during the migration: the EI
            // rows the un-migrated metrics still read, plus `native`.
            players: [
                { account: 'Cmdr.5678', name: 'Cmdr', profession: 'Guardian', notInSquad: false, hasCommanderTag: true, dpsAll: [{ damage: 100 }], defenses: [{ damageTaken: 10, downCount: 0, deadCount: 0 }], statsAll: [{}] },
                { account: 'Close.1111', name: 'Close', profession: 'Guardian', notInSquad: false, dpsAll: [{ damage: 100 }], defenses: [{ damageTaken: 10, downCount: 1, deadCount: 1 }], statsAll: [{}] },
                { account: 'Far.2222', name: 'Far', profession: 'Necromancer', notInSquad: false, dpsAll: [{ damage: 100 }], defenses: [{ damageTaken: 10, downCount: 1, deadCount: 1 }], statsAll: [{}] },
            ],
            targets: [],
            native: {
                axilog: { schema: '1.0' },
                encounter: {
                    map: 'Green Alpine Borderlands',
                    duration_ms: 6000,
                    started_at_unix: Math.floor(Date.parse(startedAtIso) / 1000),
                },
                entities: [
                    { id: 1, account: 'Cmdr.5678', profession: 'Guardian', role: 'squad', commander: { guid: 'g', segments: [[0, 6000]], variant: 'blue' } },
                    { id: 2, account: 'Close.1111', profession: 'Guardian', role: 'squad' },
                    { id: 3, account: 'Far.2222', profession: 'Necromancer', role: 'squad' },
                ],
                blocks: {
                    replay: {
                        by_entity: {
                            1: { start_ms: 0, end_ms: 6000, active_ms: 6000, down: [], dead: [], dc: [], dist_to_com: 0, stack_dist: 300 },
                            2: { start_ms: 0, end_ms: 6000, active_ms: 6000, down: [[900, 1200]], dead: [[1200, 6000]], dc: [], dist_to_com: 400, stack_dist: 350 },
                            3: { start_ms: 0, end_ms: 6000, active_ms: 6000, down: [[900, 1200]], dead: [[1200, 6000]], dc: [], dist_to_com: 9000, stack_dist: 8000 },
                        },
                        tracks: {
                            poll_ms: pollMs,
                            arena: ARENA,
                            by_entity: {
                                1: { samples: samples(0, 19), down_intervals: [], dead_intervals: [], dc_intervals: [] },
                                2: { samples: samples(400, 19), down_intervals: [[900, 1200]], dead_intervals: [[1200, 6000]], dc_intervals: [] },
                                3: { samples: samples(9000, 19), down_intervals: [[900, 1200]], dead_intervals: [[1200, 6000]], dc_intervals: [] },
                            },
                        },
                    },
                },
            },
        },
    };
};

describe('IncrementalAggregator', () => {
    it('computeStatsSync produces valid stats for multiple logs', () => {
        const logs = makeLogs(fixture1, fixture2, fixture3);
        const result = computeStatsSync({ logs });

        expect(result.stats).toBeTruthy();
        expect(result.stats.total).toBe(3);
        expect(result.skillUsageData).toBeTruthy();
    });

    it('computeStatsSync produces valid stats for a single log', () => {
        const logs = makeLogs(fixture1);
        const result = computeStatsSync({ logs });

        expect(result.stats).toBeTruthy();
        expect(result.stats.total).toBe(1);
        expect(result.skillUsageData).toBeTruthy();
    });

    it('IncrementalAggregator produces valid stats via ingest+finalize', () => {
        const logs = makeLogs(fixture1, fixture2, fixture3);
        const aggregator = new IncrementalAggregator();
        for (const log of logs) {
            aggregator.ingestLog(log);
        }
        const result = aggregator.finalize();

        expect(result.stats).toBeTruthy();
        expect(result.stats.total).toBe(3);
        expect(result.skillUsageData).toBeTruthy();
    });

    it('produces valid output for empty input', () => {
        const result = computeStatsSync({ logs: [] });

        expect(result.stats).toBeTruthy();
        expect(result.stats.total).toBe(0);
    });

    it('assigns F1 to the earliest fight regardless of ingest order', () => {
        // Ingest reverse-chronologically (matches App.tsx newest-first log array).
        const logs = makeLogs(fixture3, fixture2, fixture1);
        const result = computeStatsSync({ logs });

        const breakdown = result.stats.fightBreakdown;
        expect(Array.isArray(breakdown)).toBe(true);
        expect(breakdown.length).toBe(3);
        expect(breakdown.map((f: any) => f.shortLabel)).toEqual(['F1', 'F2', 'F3']);
        // Timestamps must be non-zero, distinct, and strictly ascending.
        const timestamps = breakdown.map((f: any) => Number(f.timestamp));
        for (const ts of timestamps) expect(ts).toBeGreaterThan(0);
        expect(new Set(timestamps).size).toBe(timestamps.length);
        for (let i = 1; i < timestamps.length; i++) {
            expect(timestamps[i]).toBeGreaterThan(timestamps[i - 1]);
        }
    });

    it('reassigns tagDistanceDeaths shortLabels chronologically (result + events)', () => {
        // fixture2 (Jan 17) is older than the native death log below, so ingest
        // reversed: the death-bearing fight (which would naively get F1) must
        // land at F2.
        const logs = [...makeLogs(fixture2)];
        logs.unshift(nativeDeathLog('2026-02-05T19:11:32Z'));
        const result = computeStatsSync({ logs });

        const tdd = result.stats.tagDistanceDeaths;
        expect(Array.isArray(tdd)).toBe(true);
        expect(tdd.length).toBe(2);
        expect(tdd.map((f: any) => f.shortLabel)).toEqual(['F1', 'F2']);

        const deathFight = tdd.find((f: any) => Array.isArray(f.events) && f.events.length > 0);
        expect(deathFight).toBeTruthy();
        expect(deathFight.shortLabel).toBe('F2');
        for (const event of deathFight.events) {
            expect(event.shortLabel).toBe('F2');
        }
    });

    it('exposes onTagReview rows aggregated from replay deaths', () => {
        const logs = [...makeLogs(fixture2)];
        logs.unshift(nativeDeathLog('2026-02-05T19:11:32Z'));
        const result = computeStatsSync({ logs });

        const otr = result.stats.onTagReview;
        expect(otr).toBeTruthy();
        expect(Array.isArray(otr.rows)).toBe(true);
        expect(otr.rows.length).toBeGreaterThan(0);
        expect(otr.rows.reduce((s: number, r: any) => s + r.total, 0)).toBeGreaterThan(0);
        for (const row of otr.rows) {
            // Every death lands in exactly one distance bucket; After-Tag overlays.
            expect(row.onTag + row.offTag + row.runBack).toBe(row.total);
            expect(row.afterTag).toBeLessThanOrEqual(row.total);
        }
    });

    it('surfaces no tag-distance rows for an EI-only log with no native block', () => {
        // The cutover made explicit: positions now come from axilog's native
        // report, so a log parsed before the migration carries nothing these
        // tables can read. The upgrade re-parse sweep is what refills them --
        // an empty table is the honest answer until it runs, and is very
        // deliberately not a zero-distance one.
        const result = computeStatsSync({ logs: makeLogs(fixtureDeaths) });
        expect(result.stats.onTagReview.rows).toEqual([]);
        expect(result.stats.tagDistanceDeaths.every((f: any) => f.hasReplayData === false)).toBe(true);
    });
});
