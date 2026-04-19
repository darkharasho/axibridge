// src/renderer/chat/sections/__tests__/sectionCatalog.test.ts
import { describe, it, expect } from 'vitest';
import { extractSection, SECTION_CATALOG } from '../sectionCatalog';
import { computeStatsSync } from '../../../stats/incrementalAggregation';

function makeLog(id: string, fightName: string): ILogData {
    return { id, filePath: `/path/${id}`, fightName, detailsStatus: 'loaded', permalink: '' } as any;
}

function makePlayer(account: string, group: number, overrides: any = {}) {
    return {
        character_name: account,
        display_name: account,
        account,
        profession: 'Daredevil',
        group,
        dpsAll: [{ damage: 100_000, dps: 500, breakbarDamage: 50 }],
        defenses: [{ deadCount: 1, downCount: 2, damageTaken: 20_000, dodgeCount: 3, blockedCount: 1, evadedCount: 2, missedCount: 0 }],
        support: [{ resurrects: 2, condiCleanse: 5, condiCleanseSelf: 1, boonStrips: 3 }],
        statsAll: [{ distToCom: 100 }],
        buffUptimes: [
            { id: 726, buffData: [{ uptime: 72 }] },
            { id: 1187, buffData: [{ uptime: 58 }] },
            { id: 1, buffData: [{ uptime: 80 }] },
        ],
        ...overrides,
    };
}

const logs: ILogData[] = [makeLog('l1', 'Fight A'), makeLog('l2', 'Fight B')];
const detailsA = {
    players: [
        makePlayer('alpha.1234', 1),
        makePlayer('beta.5678', 2, { dpsAll: [{ damage: 300_000, dps: 1500, breakbarDamage: 0 }] }),
    ],
};
const detailsB = { players: [makePlayer('alpha.1234', 1)] };
const getDetails = (id: string) => id === 'l1' ? detailsA : id === 'l2' ? detailsB : undefined;

const hydratedLogs = logs.map(log => ({
    ...log,
    details: log.id === 'l1' ? detailsA : log.id === 'l2' ? detailsB : undefined,
}));
const { stats: computedStats } = computeStatsSync({ logs: hydratedLogs as any });

describe('fight_overview extractor', () => {
    it('includes fight names', () => {
        const r = extractSection('fight_overview', logs, getDetails, computedStats);
        expect(r).toContain('Fight A');
        expect(r).toContain('Fight B');
    });
});

describe('offense extractor', () => {
    it('includes player names and Damage heading', () => {
        const r = extractSection('offense', logs, getDetails, computedStats);
        expect(r).toContain('beta.5678');
        expect(r).toContain('Damage');
    });
    it('respects fight_index', () => {
        const r = extractSection('offense', logs, getDetails, computedStats, 0);
        expect(r).toContain('Fight A');
    });
});

describe('defense extractor', () => {
    it('includes Deaths column', () => {
        const r = extractSection('defense', logs, getDetails, computedStats);
        expect(r).toContain('Deaths');
        expect(r).toContain('alpha.1234');
    });
});

describe('support extractor', () => {
    it('includes Cleanses and Strips', () => {
        const r = extractSection('support', logs, getDetails, computedStats);
        expect(r).toContain('Cleanses');
        expect(r).toContain('Strips');
    });
});

describe('boons extractor', () => {
    it('includes Stability and per-group aggregates', () => {
        const r = extractSection('boons', logs, getDetails, computedStats);
        expect(r).toContain('Stability');
        expect(r).toContain('Group');
    });
});

describe('groups extractor', () => {
    it('includes group numbers with boon uptime', () => {
        const r = extractSection('groups', logs, getDetails, computedStats);
        expect(r).toContain('G1');
        expect(r).toContain('Stability');
    });
});

describe('SECTION_CATALOG', () => {
    it('has at least 10 sections', () => {
        expect(SECTION_CATALOG.length).toBeGreaterThanOrEqual(10);
    });
    it('every section has keywords', () => {
        for (const s of SECTION_CATALOG) {
            expect(s.keywords.length).toBeGreaterThan(0);
        }
    });
});
