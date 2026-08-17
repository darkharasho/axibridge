/**
 * The load-bearing behaviour here is what counts as "missing native data" and
 * what does NOT. Two false positives would be worse than the silence this
 * replaces: warning about a log whose details have not finished hydrating, and
 * warning about a log whose `.native` is present but empty. Both are pinned
 * below, alongside the heal precondition — a log with no source file on disk
 * can never be repaired, and offering the button would be a lie.
 */
import { describe, expect, it } from 'vitest';
import {
    detailsHaveNativeReport,
    summarizeNativeCoverage,
    describeNativeGap,
    isHealable,
    toCoverageLog,
    EMPTY_NATIVE_COVERAGE,
} from '../nativeCoverage';
import { buildNativeLog } from '../../../../test/nativeLogFixture';

const nativeDetails = buildNativeLog([
    { id: 1, role: 'squad', account: 'a.1234', pixels: [[10, 10]] },
]);

describe('detailsHaveNativeReport', () => {
    it('accepts a details object carrying a real carry-set', () => {
        expect(detailsHaveNativeReport(nativeDetails)).toBe(true);
    });

    it('rejects an EI-shaped details object with no native container', () => {
        expect(detailsHaveNativeReport({ players: [], targets: [] })).toBe(false);
    });

    it('rejects a native container with no axilog block', () => {
        // `buildNativeCarrySet` refuses to build without `axilog`, so anything
        // parked at `.native` without it did not come from a real parse and
        // would make the readers believe native data is present.
        expect(detailsHaveNativeReport({ native: { entities: [], blocks: {} } })).toBe(false);
        expect(detailsHaveNativeReport({ native: {} })).toBe(false);
    });

    it('rejects absent and non-object inputs rather than throwing', () => {
        expect(detailsHaveNativeReport(null)).toBe(false);
        expect(detailsHaveNativeReport(undefined)).toBe(false);
        expect(detailsHaveNativeReport('native')).toBe(false);
    });
});

describe('summarizeNativeCoverage', () => {
    it('counts only what it was given, so unhydrated logs cannot be accused', () => {
        // The caller passes one entry per RESOLVED log. A selection of five
        // logs where two have hydrated yields a summary over two, not five.
        const coverage = summarizeNativeCoverage([
            { log: { id: 'a', filePath: '/logs/a.zevtc' }, hasNative: true },
            { log: { id: 'b', filePath: '/logs/b.zevtc' }, hasNative: false },
        ]);
        expect(coverage.resolved).toBe(2);
        expect(coverage.withNative).toBe(1);
        expect(coverage.missingLogs.map((l) => l.id)).toEqual(['b']);
    });

    it('is empty for an empty selection', () => {
        expect(summarizeNativeCoverage([])).toEqual(EMPTY_NATIVE_COVERAGE);
    });

    it('carries the ingestion source through so the banner can name a cause', () => {
        const coverage = summarizeNativeCoverage([
            { log: { id: 'a', filePath: '/a.zevtc', parseSource: 'dps.report' }, hasNative: false },
        ]);
        expect(coverage.missingLogs[0].parseSource).toBe('dps.report');
    });

    it('drops an unrecognised parseSource rather than passing it through', () => {
        const coverage = summarizeNativeCoverage([
            { log: { id: 'a', filePath: '/a.zevtc', parseSource: 'some-future-engine' }, hasNative: false },
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

describe('describeNativeGap', () => {
    const missing = (n: number, parseSource: any) => summarizeNativeCoverage(
        Array.from({ length: n }, (_, i) => ({
            log: { id: `l${i}`, filePath: `/l${i}.zevtc`, parseSource },
            hasNative: false,
        })),
    );

    it('says nothing when nothing is missing', () => {
        expect(describeNativeGap(EMPTY_NATIVE_COVERAGE)).toBe('');
    });

    it('names the cause when every missing log shares one', () => {
        expect(describeNativeGap(missing(3, 'elite-insights'))).toContain('Elite Insights engine');
        expect(describeNativeGap(missing(1, 'dps.report'))).toContain('dps.report');
        expect(describeNativeGap(missing(2, 'json-import'))).toContain('Elite Insights JSON file');
    });

    it('falls back to the count when the causes differ or are unknown', () => {
        const mixed = summarizeNativeCoverage([
            { log: { id: 'a', filePath: '/a.zevtc', parseSource: 'dps.report' }, hasNative: false },
            { log: { id: 'b', filePath: '/b.zevtc', parseSource: 'elite-insights' }, hasNative: false },
        ]);
        expect(describeNativeGap(mixed)).toContain('2 logs were');
        expect(describeNativeGap(missing(4, undefined))).toContain('4 logs were');
    });

    it('agrees with itself about number', () => {
        expect(describeNativeGap(missing(1, 'dps.report'))).toContain('This log was');
        expect(describeNativeGap(missing(2, 'dps.report'))).toContain('These 2 logs were');
    });
});
