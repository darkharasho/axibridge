import { describe, it, expect } from 'vitest';
import { IncrementalAggregator, computeStatsSync } from '../incrementalAggregation';
import fixture1 from '../../../../test-fixtures/boon/20260117-175120.json';
import fixture2 from '../../../../test-fixtures/boon/20260117-180135.json';
import fixture3 from '../../../../test-fixtures/boon/20260117-180259.json';
// Fixture with actual squad deaths + commander replay positions, so
// tagDistanceDeaths produces a non-empty events array.
import fixtureDeaths from '../../../../test-fixtures/dmg-mit/20260205-191132.json';

const makeLogs = (...fixtures: any[]) =>
    fixtures.map((f, i) => ({
        id: `log-${i}`,
        filePath: `test-${i}.zevtc`,
        details: f,
    }));

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
        // fixture2 (Jan 17) is older than fixtureDeaths (Feb 5). Ingest reversed
        // so the death-bearing fixture (which would naively get F1) lands at F2.
        const logs = makeLogs(fixtureDeaths, fixture2);
        const result = computeStatsSync({ logs });

        const tdd = result.stats.tagDistanceDeaths;
        expect(Array.isArray(tdd)).toBe(true);
        expect(tdd.length).toBe(2);
        expect(tdd.map((f: any) => f.shortLabel)).toEqual(['F1', 'F2']);

        // The death-bearing fixture must be F2 (it's the later timestamp),
        // and its events must have been rewritten to carry shortLabel "F2".
        const deathFight = tdd.find((f: any) => Array.isArray(f.events) && f.events.length > 0);
        expect(deathFight).toBeTruthy();
        expect(deathFight.shortLabel).toBe('F2');
        for (const event of deathFight.events) {
            expect(event.shortLabel).toBe('F2');
        }
    });
});
