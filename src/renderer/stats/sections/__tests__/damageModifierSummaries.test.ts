// src/renderer/stats/sections/__tests__/damageModifierSummaries.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildModSummaries, hasPersonalModClassification } from '../damageModifierSummaries';
import { computeStatsSync } from '../../incrementalAggregation';

/**
 * Read at runtime, not `import`ed: a static import of a native fixture gives
 * `tsc --noEmit` a multi-megabyte structural literal and blows its heap.
 */
const fixture = (name: string) => JSON.parse(
    readFileSync(resolve(process.cwd(), `test-fixtures/native/${name}.json`), 'utf8'),
);

const MOD_MAP = {
    d32: { name: 'Personal Mod', icon: '', description: '', incoming: false },
    d44: { name: 'Relic Mod', icon: '', description: '', incoming: false },
    'd-58': { name: 'Protection', icon: '', description: '', incoming: true },
};

const ROWS = [{
    account: 'A.1234',
    damageModTotals: {
        d32: { damageGain: 100, hitCount: 1, totalHitCount: 2, totalDamage: 500 },
        d44: { damageGain: 50, hitCount: 1, totalHitCount: 2, totalDamage: 300 },
    },
    incomingDamageModTotals: {
        'd-58': { damageGain: -20, hitCount: 1, totalHitCount: 2, totalDamage: 100 },
    },
}];

describe('hasPersonalModClassification', () => {
    it('is true when the parser supplied a personal-mod catalog', () => {
        expect(hasPersonalModClassification(new Set(['d32']))).toBe(true);
    });

    it('is false when the catalog is absent (unclassified, not "nothing is personal")', () => {
        expect(hasPersonalModClassification(new Set())).toBe(false);
    });
});

describe('buildModSummaries with a personal-mod catalog (Elite Insights logs)', () => {
    const personal = new Set(['d32']);

    it('hides non-personal modifiers while Hypothetical is off', () => {
        const out = buildModSummaries({
            playerRows: ROWS, totalsKey: 'damageModTotals', modMap: MOD_MAP,
            personalModKeys: personal, incoming: false, showHypothetical: false,
        });
        expect(out.map((m) => m.id)).toEqual(['d32']);
        expect(out[0].isPersonal).toBe(true);
    });

    it('reveals non-personal modifiers, dimmed, while Hypothetical is on', () => {
        const out = buildModSummaries({
            playerRows: ROWS, totalsKey: 'damageModTotals', modMap: MOD_MAP,
            personalModKeys: personal, incoming: false, showHypothetical: true,
        });
        expect(out.map((m) => m.id).sort()).toEqual(['d32', 'd44']);
        expect(out.find((m) => m.id === 'd44')!.isPersonal).toBe(false);
    });
});

describe('buildModSummaries without a personal-mod catalog', () => {
    it('shows every modifier rather than none, and marks none hypothetical', () => {
        const out = buildModSummaries({
            playerRows: ROWS, totalsKey: 'damageModTotals', modMap: MOD_MAP,
            personalModKeys: new Set<string>(), incoming: false, showHypothetical: false,
        });
        expect(out.map((m) => m.id).sort()).toEqual(['d32', 'd44']);
        expect(out.every((m) => m.isPersonal)).toBe(true);
    });

    it('still splits outgoing from incoming', () => {
        const out = buildModSummaries({
            playerRows: ROWS, totalsKey: 'incomingDamageModTotals', modMap: MOD_MAP,
            personalModKeys: new Set<string>(), incoming: true, showHypothetical: false,
        });
        expect(out.map((m) => m.id)).toEqual(['d-58']);
    });
});

describe('regression: natively parsed logs render damage modifiers', () => {
    const stats: any = computeStatsSync({
        logs: ['20260117-180259', '20260117-180458'].map((n, i) => ({
            id: `log-${i}`, filePath: `t-${i}.zevtc`, details: fixture(n),
        })) as any,
    }).stats;

    it('aggregates modifier data and supplies a personal-mod catalog from axilog', () => {
        // axilog's EI-compat surface has emitted `personalDamageMods` since at
        // least 1.7.2 (confirmed unchanged by the 1.8.0 bump) - the classified
        // set is non-empty for a real native log, not the "unclassified"
        // empty-set case `hasPersonalModClassification` also has to handle.
        expect(Object.keys(stats.damageModMap).length).toBeGreaterThan(0);
        expect(stats.personalDamageModKeys.length).toBeGreaterThan(0);
    });

    it('shows outgoing modifiers with Hypothetical off', () => {
        const out = buildModSummaries({
            playerRows: stats.damageModPlayers,
            totalsKey: 'damageModTotals',
            modMap: stats.damageModMap,
            personalModKeys: new Set<string>(stats.personalDamageModKeys),
            incoming: false,
            showHypothetical: false,
        });
        expect(out.length).toBeGreaterThan(0);
    });

    it('shows incoming modifiers with Hypothetical off', () => {
        const out = buildModSummaries({
            playerRows: stats.incomingDamageModPlayers,
            totalsKey: 'incomingDamageModTotals',
            modMap: stats.damageModMap,
            personalModKeys: new Set<string>(stats.personalDamageModKeys),
            incoming: true,
            showHypothetical: false,
        });
        expect(out.length).toBeGreaterThan(0);
    });
});
