import { describe, it, expect } from 'vitest';
import { extractRunSummary, aggregatePlayers, compareRunSets, ReportSchemaError } from '../reportMetrics';
import { reportSmall } from './fixtures/report-small';

describe('extractRunSummary', () => {
    it('projects a published report into a compact run summary', () => {
        const summary = extractRunSummary(reportSmall);
        expect(summary.id).toBe('20260117-1751');
        expect(summary.fights).toBe(7);
        expect(summary.wins).toBe(5);
        expect(summary.commanders).toEqual(['Cmdr.1234']);
        const scourge = summary.players.find((p) => p.account === 'Player.5678')!;
        expect(scourge.damage).toBe(2_400_000);
        expect(scourge.strips).toBe(120);
        expect(scourge.deaths).toBe(1);
        expect(scourge.squadTimeMs).toBe(3_600_000);
        const fb = summary.players.find((p) => p.account === 'Cmdr.1234')!;
        expect(fb.healing).toBe(850_000);
        expect(fb.hasHealAddon).toBe(true);
    });
    it('throws ReportSchemaError when meta.id is missing', () => {
        expect(() => extractRunSummary({ stats: {} })).toThrow(ReportSchemaError);
    });
    it('tolerates missing player tables (older schema)', () => {
        const summary = extractRunSummary({ meta: { id: 'old-1' }, stats: { total: 3, wins: 1, losses: 2 } });
        expect(summary.players).toEqual([]);
        expect(summary.warnings).toContain('no player tables in report');
    });
});

describe('aggregatePlayers', () => {
    it('merges per-run summaries into per-account aggregates', () => {
        const s = extractRunSummary(reportSmall);
        const rows = aggregatePlayers([s, { ...s, id: 'run-2' }]);
        const scourge = rows.find((r) => r.account === 'Player.5678')!;
        expect(scourge.runsJoined).toBe(2);
        expect(scourge.damage).toBe(4_800_000);
        expect(scourge.dps).toBeCloseTo(4_800_000 / (2 * 1_150_000 / 1000), 0);
        expect(scourge.professionTimeMs.Scourge).toBe(2_300_000);
    });
    it('filters to requested accounts', () => {
        const s = extractRunSummary(reportSmall);
        const rows = aggregatePlayers([s], ['Cmdr.1234']);
        expect(rows).toHaveLength(1);
        expect(rows[0].account).toBe('Cmdr.1234');
    });
});

describe('compareRunSets', () => {
    it('produces per-metric deltas between two run sets', () => {
        const s = extractRunSummary(reportSmall);
        const doubled = { ...s, id: 'run-2', squadDeaths: 28 };
        const result = compareRunSets([s], [doubled]);
        const deaths = result.metrics.find((m) => m.metric === 'squadDeaths')!;
        expect(deaths.a).toBe(14);
        expect(deaths.b).toBe(28);
        expect(deaths.delta).toBe(14);
    });
});
