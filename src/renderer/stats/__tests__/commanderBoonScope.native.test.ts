/**
 * The commander boon rows share the special-buff gate's old bug, used in the
 * inverse direction: `isBoon` defaulted a missing `classification` to true, so
 * under native -- where the field is never emitted -- every condition and
 * effect the commander carried counted as a boon, diluting the boon-uptime
 * average and padding `incomingBoonUptimes` with things that are not boons.
 */
import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { parseFile, parseFileEi } from '@axiapps/axilog';
import { computeCommanderStats } from '../computeCommanderStats';

const FIXTURE = path.resolve(__dirname, '../../../../test-fixtures/axilog/wvw-small.anon.zevtc');

describe('commander boon rows over native', () => {
    const native: any = parseFile(FIXTURE, { everything: true } as any);
    const ei: any = parseFileEi(FIXTURE, { everything: true } as any);
    const details = { ...ei, native } as any;

    const rows = () => computeCommanderStats([{ log: { id: 'log-0', filePath: 'a.zevtc', details } }]).rows;

    it('finds a commander to measure', () => {
        expect(rows().length).toBeGreaterThan(0);
    });

    it('counts only real boons, never the whole catalog of conditions and effects', () => {
        // The fixture's catalog holds 12 boons; nothing may push the count past that.
        for (const row of rows()) {
            expect(row.boonEntries).toBeLessThanOrEqual(12);
        }
    });

    it('never lists a condition among the commander incoming boon rows', () => {
        const names = rows().flatMap((r: any) => (r.incomingBoonBreakdown || []).map((b: any) => String(b.name)));
        expect(names.length).toBeGreaterThan(0);
        for (const condition of ['Bleeding', 'Burning', 'Vulnerability', 'Crippled', 'Poison']) {
            expect(names).not.toContain(condition);
        }
    });
});
