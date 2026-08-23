import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { IncrementalAggregator, computeStatsSync } from '../../incrementalAggregation';

/**
 * Read at runtime rather than `import`ed: a static import of these fixtures
 * gives `tsc --noEmit` a multi-megabyte structural literal to infer, and this
 * file's four of them are enough to push `npm run typecheck` past its 8 GB heap.
 */
const fixture = (name: string) => JSON.parse(
    readFileSync(resolve(process.cwd(), `test-fixtures/native/${name}.json`), 'utf8'),
);

const LOGS = ['20260117-175120', '20260117-180135', '20260117-180259', '20260117-180458'].map(fixture).map((details, i) => ({
    id: `log-${i}`,
    filePath: `test-${i}.zevtc`,
    details,
}));

/**
 * `computeStabPerformance`'s sibling `combatMetrics` writes `stabGeneration`
 * back onto `details.players` as a side effect of player aggregation, and
 * `ingestLogFightDiffMode` reads it — but ingest calls the diff-mode reader
 * BEFORE player aggregation, so the very first pass over a given `details`
 * object reports 0 squad stability and every later pass reports the real
 * number. The fixtures are module-level imports shared by every aggregation in
 * this file, so whichever path ran first would win. That is a pre-existing
 * product wart, not a slicing question: warm the fixtures once up front so both
 * sides of every comparison read the same input.
 */
computeStatsSync({ logs: LOGS });

/** Frames as they actually travel: through JSON, exactly like the sidecar. */
const framesFor = (logs: any[]) => logs.map((log) => {
    const solo = new IncrementalAggregator();
    solo.ingestLog(log);
    return JSON.parse(JSON.stringify(solo.exportFrame()));
});

const mergeAll = (frames: any[]) => {
    const merged = new IncrementalAggregator();
    frames.forEach((frame) => merged.mergeFrame(frame));
    return merged;
};

const framedStats = (logs: any[]) => mergeAll(framesFor(logs)).finalize().stats;

/** replayFights is excluded from frames by design — drop it from both sides. */
const comparable = (stats: any) => {
    const { replayFights, ...rest } = stats || {};
    return rest;
};

/**
 * Deep-equal is order-insensitive for object keys but not for arrays, and
 * `toEqual` also treats `undefined` properties as absent. Key order is the
 * defect class this branch keeps hitting, so pin the serialized form too.
 */
const canonical = (value: any) => JSON.stringify(value, (_k, v) => (
    typeof v === 'number' && !Number.isFinite(v) ? `__nonfinite:${String(v)}` : v
));

describe('aggregator frame export/merge', () => {
    it('reproduces the all-fights aggregation from per-fight frames', () => {
        const direct = computeStatsSync({ logs: LOGS }).stats;
        expect(comparable(framedStats(LOGS))).toEqual(comparable(direct));
    });

    it('reproduces a three-of-four slice', () => {
        const subset = [LOGS[0], LOGS[1], LOGS[3]];
        const direct = computeStatsSync({ logs: subset }).stats;
        expect(comparable(framedStats(subset))).toEqual(comparable(direct));
    });

    it('reproduces a single-fight slice', () => {
        const direct = computeStatsSync({ logs: [LOGS[2]] }).stats;
        expect(comparable(framedStats([LOGS[2]]))).toEqual(comparable(direct));
    });

    it('reproduces the all-fights aggregation byte-for-byte, key order included', () => {
        const direct = computeStatsSync({ logs: LOGS }).stats;
        expect(canonical(comparable(framedStats(LOGS)))).toBe(canonical(comparable(direct)));
    });

    it('reproduces skillUsageData, which finalize returns alongside stats', () => {
        const direct = computeStatsSync({ logs: LOGS }).skillUsageData;
        expect(mergeAll(framesFor(LOGS)).finalize().skillUsageData).toEqual(direct);
    });

    it('recomputes derived sections that frames never carried', () => {
        // The whole point of shipping pre-finalize state: leaderboards, MVPs,
        // topStats, role classifications and boon leaderboards are absent from
        // every frame and reappear after finalize.
        const derived = [
            'leaderboards', 'boonLeaderboards', 'roleClassifications',
            'offensiveMvp', 'defensiveMvp', 'mvp',
            'topSkills', 'topStatsPerSecond', 'topStatsPerMinute',
            'maxDownContrib', 'closestToTag',
        ];
        const frame = framesFor([LOGS[0]])[0];
        derived.forEach((key) => expect(frame).not.toHaveProperty(key));

        const stats = framedStats(LOGS);
        derived.forEach((key) => expect(stats[key]).toBeTruthy());
        expect(stats.leaderboards.damage.length).toBeGreaterThan(0);
        expect(stats.roleClassifications.length).toBeGreaterThan(0);
    });

    it('carries no replay payload in a frame', () => {
        // replayFights is ~66% of report.json; a frame that carried it would
        // blow the sidecar budget on its own.
        const frame = framesFor([LOGS[0]])[0];
        expect(frame).not.toHaveProperty('replayPayloads');
        expect(JSON.stringify(frame)).not.toContain('replayFights');
    });

    it('refuses to export a frame from an aggregator that ingested more than one log', () => {
        const acc = new IncrementalAggregator();
        LOGS.forEach((log) => acc.ingestLog(log));
        expect(() => acc.exportFrame()).toThrow(/exactly one log/i);
    });

    it('refuses to export a frame from an aggregator that ingested nothing', () => {
        expect(() => new IncrementalAggregator().exportFrame()).toThrow(/exactly one log/i);
    });

    describe('originalIndex renumbering', () => {
        // Every frame is built by a solo aggregator, so every entry in it
        // claims originalIndex 0. `sortByFightOrder` uses originalIndex as its
        // only tie-break, so a merged aggregator that left them all at 0 would
        // be relying on Array.prototype.sort stability for fight order rather
        // than on the key finalize actually reads.
        const indexed = ['logMetas', 'timelineEntries', 'fightBreakdowns', 'fightDiffModes'] as const;

        it('every solo frame carries originalIndex 0', () => {
            const frame = framesFor([LOGS[1]])[0];
            indexed.forEach((key) => {
                const entries = (frame as any)[key];
                expect(entries.length).toBe(1);
                expect(entries[0].originalIndex).toBe(0);
            });
        });

        it('renumbers to the running merge count on every indexed array', () => {
            const merged = mergeAll(framesFor(LOGS)) as any;
            indexed.forEach((key) => {
                expect(merged[key].map((e: any) => e.originalIndex)).toEqual([0, 1, 2, 3]);
            });
            expect(merged.logCount).toBe(4);
            expect(merged.validLogCount).toBe(4);
        });

        it('matches the originalIndex a direct ingest would have assigned', () => {
            const direct = new IncrementalAggregator() as any;
            LOGS.forEach((log) => direct.ingestLog(log));
            const merged = mergeAll(framesFor(LOGS)) as any;
            indexed.forEach((key) => {
                expect(merged[key].map((e: any) => e.originalIndex))
                    .toEqual(direct[key].map((e: any) => e.originalIndex));
            });
        });

        it('breaks ties by merge order when timestamps are equal', () => {
            // Logs with no roster resolve to timestamp 0, so sortByFightOrder
            // falls all the way through to originalIndex.
            const tied = [
                { id: 'a', filePath: 'a.zevtc', dashboardSummary: { squadCount: 5, enemyCount: 11 } },
                { id: 'b', filePath: 'b.zevtc', dashboardSummary: { squadCount: 7, enemyCount: 22 } },
                { id: 'c', filePath: 'c.zevtc', dashboardSummary: { squadCount: 9, enemyCount: 33 } },
            ];
            const squadOf = (stats: any) => stats.timelineData.map((row: any) => row.squadCount);

            expect(squadOf(framedStats(tied))).toEqual([5, 7, 9]);
            expect(squadOf(framedStats([tied[2], tied[0], tied[1]]))).toEqual([9, 5, 7]);

            const frames = framesFor(tied);
            const merged = mergeAll([frames[2], frames[0], frames[1]]) as any;
            expect(merged.timelineEntries.map((e: any) => e.originalIndex)).toEqual([0, 1, 2]);
            expect(squadOf(merged.finalize().stats)).toEqual([9, 5, 7]);
        });
    });

    it('unions personalDamageModKeys and first-wins damageModMap across frames', () => {
        // No native fixture carries personalDamageMods, so inject them onto a
        // shallow details copy (the players array stays shared by reference).
        const withMods = (log: any, mods: Record<string, number[]>, modMap: Record<string, any>) => ({
            ...log,
            details: { ...log.details, personalDamageMods: mods, damageModMap: modMap },
        });
        const logs = [
            withMods(LOGS[0], { Guardian: [111, 222] }, { d111: { name: 'first', icon: 'a', description: '', incoming: false } }),
            withMods(LOGS[1], { Necromancer: [222, 333] }, { d111: { name: 'second', icon: 'b', description: '', incoming: true } }),
        ];

        const frame = framesFor([logs[0]])[0];
        expect(frame.personalDamageModKeys).toHaveProperty('__set');
        expect((frame.personalDamageModKeys as any).__set).toEqual(['d111', 'd222']);

        const stats = framedStats(logs);
        expect(stats.personalDamageModKeys).toEqual(['d111', 'd222', 'd333']);
        // damageModMap is first-wins on merge exactly as it is on ingest.
        expect(stats.damageModMap.d111.name).toBe('first');
        expect(comparable(stats)).toEqual(comparable(computeStatsSync({ logs }).stats));
    });

    it('sums mapCounts and enemyNameCounts across frames', () => {
        const merged = mergeAll(framesFor(LOGS)) as any;
        const direct = new IncrementalAggregator() as any;
        LOGS.forEach((log) => direct.ingestLog(log));
        expect(merged.mapCounts).toEqual(direct.mapCounts);
        expect(merged.enemyNameCounts).toEqual(direct.enemyNameCounts);
        expect(Object.values(merged.mapCounts).reduce((a: any, b: any) => a + b, 0)).toBe(4);
    });

    it('concatenates boonTableLogs and the stab-performance accumulator', () => {
        const merged = mergeAll(framesFor(LOGS)) as any;
        expect(merged.boonTableLogs).toHaveLength(4);
        expect(merged.stabPerfAcc.fights).toHaveLength(4);
        const direct = new IncrementalAggregator() as any;
        LOGS.forEach((log) => direct.ingestLog(log));
        expect(merged.stabPerfAcc.fights.map((f: any) => f.id))
            .toEqual(direct.stabPerfAcc.fights.map((f: any) => f.id));
    });

    it('renumbers the commander fight-row shortLabel, which finalize never touches', () => {
        // ingestLogCommanderStats bakes `F${idx + 1}` into every fight row and
        // finalizeCommanderStats only re-SORTS them, so without the rewrite
        // every merged fight would report itself as F1.
        const direct = computeStatsSync({ logs: LOGS }).stats.commanderStats.rows;
        const framed = framedStats(LOGS).commanderStats.rows;
        const labels = framed[0].fightsData.map((f: any) => f.shortLabel);
        expect(labels.length).toBeGreaterThan(1);
        expect(new Set(labels).size).toBe(labels.length); // not all 'F1'
        expect(framed.map((r: any) => r.fightsData.map((f: any) => f.shortLabel)))
            .toEqual(direct.map((r: any) => r.fightsData.map((f: any) => f.shortLabel)));
    });

    it('keeps the Infinity min sentinel across the JSON boundary', () => {
        // `min` on a skill breakdown row is seeded to Infinity and JSON has no
        // Infinity, so a round-tripped frame carries `null` there. If the merge
        // took that null at face value the sentinel would be lost silently —
        // and it never surfaces in `stats`, so no output comparison can see it.
        const nonFinitePaths = (acc: any) => {
            const found: string[] = [];
            const walk = (v: any, p: string, d = 0) => {
                if (d > 25 || found.length > 200) return;
                if (typeof v === 'number') { if (!Number.isFinite(v)) found.push(`${p}=${v}`); return; }
                if (v instanceof Map) { v.forEach((x, k) => walk(x, `${p}.${String(k)}`, d + 1)); return; }
                if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${p}[${i}]`, d + 1)); return; }
                if (v && typeof v === 'object') { Object.keys(v).forEach((k) => walk(v[k], `${p}.${k}`, d + 1)); }
            };
            walk(acc.playerSkillBreakdownMap, 'playerSkillBreakdownMap');
            return found.sort();
        };

        const direct = new IncrementalAggregator() as any;
        LOGS.forEach((log) => direct.ingestLog(log));
        const merged = mergeAll(framesFor(LOGS)) as any;

        const expected = nonFinitePaths(direct.playerAcc);
        expect(expected.length).toBeGreaterThan(0);
        expect(expected.every((p: string) => p.endsWith('=Infinity'))).toBe(true);
        expect(nonFinitePaths(merged.playerAcc)).toEqual(expected);
    });

    it('exports a frame for a log with no detailed roster, omitting module sections', () => {
        const solo = new IncrementalAggregator();
        solo.ingestLog({ id: 'x', filePath: 'x.zevtc', dashboardSummary: { squadCount: 3, enemyCount: 4 } });
        const frame = solo.exportFrame() as any;
        expect(frame.validLogCount).toBe(0);
        ['spike', 'allDamage', 'stripSpikes', 'incomingStrike', 'skillUsage',
            'boonTimeline', 'boonUptime', 'stabPerformance', 'playerAcc', 'commanderStatsAcc']
            .forEach((key) => expect(frame).not.toHaveProperty(key));
        expect(frame.logMetas).toHaveLength(1);
    });

    it('reproduces a mixed valid/invalid roster aggregation', () => {
        const mixed = [LOGS[0], { id: 'x', filePath: 'x.zevtc', dashboardSummary: { squadCount: 3, enemyCount: 4 } }, LOGS[3]];
        const direct = computeStatsSync({ logs: mixed }).stats;
        expect(comparable(framedStats(mixed))).toEqual(comparable(direct));
    });

    it('survives the JSON boundary for every Map- and Set-shaped section', () => {
        // encodeState/decodeState is the only thing standing between the
        // sidecar and a silent `{}` for playerStats, the commander map and
        // personalDamageModKeys.
        const raw = new IncrementalAggregator();
        raw.ingestLog(LOGS[0]);
        const frame = raw.exportFrame() as any;
        const roundTripped = JSON.parse(JSON.stringify(frame));

        expect(frame.playerAcc.playerStats).toHaveProperty('__map');
        expect((frame.playerAcc.playerStats as any).__map.length).toBeGreaterThan(0);
        expect(frame.commanderStatsAcc).toHaveProperty('__map');

        const direct = computeStatsSync({ logs: [LOGS[0]] }).stats;
        expect(comparable(mergeAll([roundTripped]).finalize().stats)).toEqual(comparable(direct));
    });
});
