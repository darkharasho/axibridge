import { describe, it, expect } from 'vitest';
import { computePlayerAggregation } from '../computePlayerAggregation';

// EI v3.24 changed the "no commander in squad" sentinel for `statsAll[0].distToCom`
// from the string "Infinity" to the number -1. Closest-to-Tag reads distToCom first
// and only falls back to stackDist when distToCom is absent / non-positional. A raw
// -1 must NOT be treated as a real distance — it should fall back to stackDist so the
// metric keeps working for commander-less fights (and mixed log sets).

const makePlayer = (overrides: any) => ({
    name: overrides.name,
    account: overrides.account,
    group: 1,
    profession: 'Guardian',
    notInSquad: false,
    activeTimes: [60000],
    dpsAll: [{ dps: 0, damage: 0 }],
    statsAll: [{}],
    defenses: [{ damageTaken: 0, downCount: 0, deadCount: 0 }],
    support: [{ condiCleanse: 0, condiCleanseSelf: 0, boonStrips: 0, resurrects: 0 }],
    ...overrides,
});

const makeLog = (players: any[]) => ({
    details: {
        durationMS: 60000,
        timeStart: '2026-06-23T00:00:00Z',
        success: true,
        players,
        targets: [],
        phases: [{ start: 0, end: 60000, name: 'All' }],
        buffMap: {},
        skillMap: {},
    },
});

const aggregate = (players: any[]) =>
    computePlayerAggregation({
        validLogs: [makeLog(players)],
        method: 'count',
        skillDamageSource: 'target',
        splitPlayersByClass: false,
    } as any);

const statOf = (result: any, account: string) =>
    [...result.playerStats.values()].find((p: any) => p.account === account);

describe('distToCom -1 sentinel (EI v3.24 commander-less fights)', () => {
    it('falls back to stackDist when distToCom is -1 (no commander)', () => {
        const players = [
            makePlayer({
                name: 'NoCmdr',
                account: 'NoCmdr.0001',
                statsAll: [{ distToCom: -1, stackDist: 600 }],
            }),
        ];
        const result = aggregate(players);
        const s = statOf(result, 'NoCmdr.0001');
        expect(s).toBeTruthy();
        // distCount counted (distance was resolvable), and the resolved distance is the
        // stackDist fallback (600) — never the -1 sentinel.
        expect(s!.distCount).toBe(1);
        expect(s!.totalDist).toBe(600);
    });

    it('still uses distToCom when a commander is present (positive value)', () => {
        const players = [
            makePlayer({
                name: 'NearTag',
                account: 'NearTag.0002',
                statsAll: [{ distToCom: 350, stackDist: 1200 }],
            }),
        ];
        const result = aggregate(players);
        const s = statOf(result, 'NearTag.0002');
        expect(s).toBeTruthy();
        expect(s!.totalDist).toBe(350);
    });

    it('falls back to stackDist for the legacy "Infinity" string sentinel', () => {
        const players = [
            makePlayer({
                name: 'OldEi',
                account: 'OldEi.0003',
                statsAll: [{ distToCom: 'Infinity', stackDist: 480 }],
            }),
        ];
        const result = aggregate(players);
        const s = statOf(result, 'OldEi.0003');
        expect(s).toBeTruthy();
        expect(s!.totalDist).toBe(480);
    });
});
