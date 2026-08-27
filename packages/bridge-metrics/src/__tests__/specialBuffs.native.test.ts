/**
 * Pins the special-buff membership test against the real native fixture.
 *
 * The old gate sniffed `meta.classification`, defaulting to "this is a boon"
 * when the field was absent. axilog never emits `classification`, so under the
 * native backend every buff answered "boon", the pre-filter dropped all of
 * them, and both the Special Buffs and Sigil/Relic Uptime sections rendered
 * their empty state. The catalog states `kind` outright -- that is the test.
 */
import { describe, expect, it } from 'vitest';
import * as path from 'path';
import { parseFile, parseFileEi } from '@axiapps/axilog';
import { computePlayerAggregation } from '../computePlayerAggregation';

const FIXTURE = path.resolve(__dirname, '../../../../test-fixtures/axilog/wvw-small.anon.zevtc');

describe('special buffs over native', () => {
    const native: any = parseFile(FIXTURE, { everything: true } as any);
    const ei: any = parseFileEi(FIXTURE, { everything: true } as any);
    const details = { ...ei, native } as any;

    const run = () => computePlayerAggregation({
        validLogs: [{ details }],
        method: 'count' as any,
        skillDamageSource: 'target',
        splitPlayersByClass: false,
    });

    it('collects non-boon buffs instead of dropping every one of them', () => {
        const { specialBuffAgg, specialBuffMeta } = run();
        expect(specialBuffAgg.size).toBeGreaterThan(0);
        expect(specialBuffMeta.size).toBeGreaterThan(0);
    });

    it('never admits a boon into the special-buff set', () => {
        const { specialBuffMeta } = run();
        const names = [...specialBuffMeta.values()].map((m) => m.name);
        for (const boon of ['Might', 'Quickness', 'Protection', 'Alacrity', 'Fury']) {
            expect(names).not.toContain(boon);
        }
    });

    it('surfaces the sigil the Sigil/Relic Uptime section filters for', () => {
        const { specialBuffMeta } = run();
        const names = [...specialBuffMeta.values()].map((m) => String(m.name || ''));
        expect(names.some((n) => /\b(sigil|relic)\b/i.test(n))).toBe(true);
    });
});
