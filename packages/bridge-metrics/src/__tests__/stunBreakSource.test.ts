import { describe, it, expect } from 'vitest';
import { computePlayerAggregation } from '../computePlayerAggregation';

// EI v3.24 moved `stunBreak` / `removedStunDuration` from each player's
// `support[0]` to `defenses[0]` (breaking a stun is a defensive event). Logs
// parsed by older EI versions (and dps.report) still carry them on `support[0]`.
// The Support Detailed "Stun Breaks" / "Removed Stun Duration" tabs must read
// whichever location holds the data so both old and new logs aggregate.

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

describe('stunBreak / removedStunDuration source (EI v3.24 relocation)', () => {
    it('reads stunBreak + removedStunDuration from defenses[0] (EI v3.24+)', () => {
        const players = [
            makePlayer({
                name: 'NewEi',
                account: 'NewEi.0001',
                defenses: [{ damageTaken: 0, stunBreak: 5, removedStunDuration: 3.5 }],
                support: [{ condiCleanse: 2, condiCleanseSelf: 0, boonStrips: 0, resurrects: 0, stunBreak: 0, removedStunDuration: 0 }],
            }),
        ];
        const result = aggregate(players);
        const s = [...result.playerStats.values()].find((p: any) => p.account === 'NewEi.0001');
        expect(s).toBeTruthy();
        expect(s!.supportTotals.stunBreak).toBe(5);
        expect(s!.supportTotals.removedStunDuration).toBeCloseTo(3.5, 5);
    });

    it('falls back to support[0] for logs parsed by older EI / dps.report', () => {
        const players = [
            makePlayer({
                name: 'OldEi',
                account: 'OldEi.0002',
                defenses: [{ damageTaken: 0 }],
                support: [{ condiCleanse: 1, condiCleanseSelf: 0, boonStrips: 0, resurrects: 0, stunBreak: 7, removedStunDuration: 2.25 }],
            }),
        ];
        const result = aggregate(players);
        const s = [...result.playerStats.values()].find((p: any) => p.account === 'OldEi.0002');
        expect(s).toBeTruthy();
        expect(s!.supportTotals.stunBreak).toBe(7);
        expect(s!.supportTotals.removedStunDuration).toBeCloseTo(2.25, 5);
    });
});
