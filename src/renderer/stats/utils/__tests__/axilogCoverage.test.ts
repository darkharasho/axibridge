/**
 * The load-bearing behaviour here is what counts as "missing Axilog data" and
 * what does NOT. Two false positives would be worse than the silence this
 * replaces: warning about a log whose details have not finished hydrating, and
 * warning about a log whose `.native` is present but empty. Both are pinned
 * below, alongside the heal precondition — a log with no source file on disk
 * can never be repaired, and offering the button would be a lie.
 */
import { describe, expect, it } from 'vitest';
import {
    detailsHaveAxilogData,
    summarizeAxilogCoverage,
    describeAxilogGap,
    isHealable,
    toCoverageLog,
    EMPTY_AXILOG_COVERAGE,
} from '../axilogCoverage';
import { buildNativeLog } from '../../../../test/nativeLogFixture';

const nativeDetails = buildNativeLog([
    { id: 1, role: 'squad', account: 'a.1234', pixels: [[10, 10]] },
]);

describe('detailsHaveAxilogData', () => {
    it('accepts a details object carrying a real carry-set', () => {
        expect(detailsHaveAxilogData(nativeDetails)).toBe(true);
    });

    it('rejects an EI-shaped details object with no Axilog container', () => {
        expect(detailsHaveAxilogData({ players: [], targets: [] })).toBe(false);
    });

    it('rejects a container with no axilog block', () => {
        // `buildNativeCarrySet` refuses to build without `axilog`, so anything
        // parked at `.native` without it did not come from a real parse and
        // would make the readers believe Axilog data is present.
        expect(detailsHaveAxilogData({ native: { entities: [], blocks: {} } })).toBe(false);
        expect(detailsHaveAxilogData({ native: {} })).toBe(false);
    });

    it('rejects absent and non-object inputs rather than throwing', () => {
        expect(detailsHaveAxilogData(null)).toBe(false);
        expect(detailsHaveAxilogData(undefined)).toBe(false);
        expect(detailsHaveAxilogData('native')).toBe(false);
    });
});

describe('summarizeAxilogCoverage', () => {
    it('counts only what it was given, so unhydrated logs cannot be accused', () => {
        // The caller passes one entry per RESOLVED log. A selection of five
        // logs where two have hydrated yields a summary over two, not five.
        const coverage = summarizeAxilogCoverage([
            { log: { id: 'a', filePath: '/logs/a.zevtc' }, hasAxilog: true },
            { log: { id: 'b', filePath: '/logs/b.zevtc' }, hasAxilog: false },
        ]);
        expect(coverage.resolved).toBe(2);
        expect(coverage.withAxilog).toBe(1);
        expect(coverage.missingLogs.map((l) => l.id)).toEqual(['b']);
    });

    it('is empty for an empty selection', () => {
        expect(summarizeAxilogCoverage([])).toEqual(EMPTY_AXILOG_COVERAGE);
    });

    it('carries the ingestion source through so the banner can name a cause', () => {
        const coverage = summarizeAxilogCoverage([
            { log: { id: 'a', filePath: '/a.zevtc', parseSource: 'dps.report' }, hasAxilog: false },
        ]);
        expect(coverage.missingLogs[0].parseSource).toBe('dps.report');
    });

    it('drops an unrecognised parseSource rather than passing it through', () => {
        const coverage = summarizeAxilogCoverage([
            { log: { id: 'a', filePath: '/a.zevtc', parseSource: 'some-future-engine' }, hasAxilog: false },
        ]);
        expect(coverage.missingLogs[0].parseSource).toBeNull();
    });
});

describe('toCoverageLog', () => {
    it('prefers the fight label, then the name, then the ids it has', () => {
        expect(toCoverageLog({ fightLabel: 'EBG - Overlook', fightName: 'x' }).label).toBe('EBG - Overlook');
        expect(toCoverageLog({ fightName: 'Eternal Battlegrounds' }).label).toBe('Eternal Battlegrounds');
        expect(toCoverageLog({ filePath: '/logs/a.zevtc' }).label).toBe('/logs/a.zevtc');
        expect(toCoverageLog({}).label).toBe('Unknown log');
    });
});

describe('isHealable', () => {
    it('requires a source path, because a re-parse has nothing else to read', () => {
        expect(isHealable({ filePath: '/logs/a.zevtc' })).toBe(true);
        expect(isHealable({ filePath: '' })).toBe(false);
    });
});

describe('describeAxilogGap', () => {
    const missing = (n: number, parseSource: any) => summarizeAxilogCoverage(
        Array.from({ length: n }, (_, i) => ({
            log: { id: `l${i}`, filePath: `/l${i}.zevtc`, parseSource },
            hasAxilog: false,
        })),
    );

    it('says nothing when nothing is missing', () => {
        expect(describeAxilogGap(EMPTY_AXILOG_COVERAGE)).toBe('');
    });

    it('names the cause when every missing log shares one', () => {
        expect(describeAxilogGap(missing(3, 'elite-insights'))).toContain('Elite Insights engine');
        expect(describeAxilogGap(missing(1, 'dps.report'))).toContain('dps.report');
        expect(describeAxilogGap(missing(2, 'json-import'))).toContain('Elite Insights JSON file');
    });

    it('falls back to the count when the causes differ or are unknown', () => {
        const mixed = summarizeAxilogCoverage([
            { log: { id: 'a', filePath: '/a.zevtc', parseSource: 'dps.report' }, hasAxilog: false },
            { log: { id: 'b', filePath: '/b.zevtc', parseSource: 'elite-insights' }, hasAxilog: false },
        ]);
        expect(describeAxilogGap(mixed)).toContain('2 logs were');
        expect(describeAxilogGap(missing(4, undefined))).toContain('4 logs were');
    });

    it('agrees with itself about number', () => {
        expect(describeAxilogGap(missing(1, 'dps.report'))).toContain('This log was');
        expect(describeAxilogGap(missing(2, 'dps.report'))).toContain('These 2 logs were');
    });
});
