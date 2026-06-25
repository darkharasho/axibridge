import { describe, it, expect } from 'vitest';
import { computeStatsSync } from '../incrementalAggregation';

// Mignon feedback (Discord): "Total DPS" summed each fight's DPS rate (meaningless,
// ~22x a real number), and the per-second Damage/DPS top-stat CARDS showed 0 / "No
// data" because the per-second card leaderboards omitted dps/damage.
//
// Expected model:
//   DPS    = total damage / total fight time (a true aggregate rate)
//   Damage = cumulative total; Damage /1s == DPS, Damage /60s == DPS*60

const makePlayer = (overrides: any) => ({
    name: overrides.name,
    account: overrides.account,
    group: 1,
    profession: 'Guardian',
    notInSquad: false,
    activeTimes: [overrides.durationMS ?? 10000],
    dpsAll: [{ dps: overrides.dps, damage: overrides.damage }],
    statsAll: [{}],
    defenses: [{ damageTaken: 0, downCount: 0, deadCount: 0 }],
    support: [{ condiCleanse: 0, condiCleanseSelf: 0, boonStrips: 0, resurrects: 0 }],
});

const makeLog = (id: number, durationMS: number, player: any) => ({
    id: `log-${id}`,
    filePath: `test-${id}.zevtc`,
    details: {
        durationMS,
        timeStart: `2026-06-23T00:0${id}:00Z`,
        success: true,
        players: [player],
        targets: [],
        phases: [{ start: 0, end: durationMS, name: 'All' }],
        buffMap: {},
        skillMap: {},
    },
});

describe('DPS / Damage aggregation (Mignon feedback)', () => {
    // 2 fights for one player: 1000 dmg over 10s (100 dps) + 1000 dmg over 20s (50 dps).
    // Total damage 2000, total time 30s -> aggregate DPS = 66.67. Naive sum = 150.
    const logs = [
        makeLog(1, 10000, makePlayer({ name: 'A', account: 'A.1', durationMS: 10000, damage: 1000, dps: 100 })),
        makeLog(2, 20000, makePlayer({ name: 'A', account: 'A.1', durationMS: 20000, damage: 1000, dps: 50 })),
    ];

    const result = computeStatsSync({ logs });
    const lbs = result.stats.leaderboards;
    const perSec = result.stats.topStatsLeaderboardsPerSecond;
    const perMin = result.stats.topStatsLeaderboardsPerMinute;
    const aggDps = 2000 / 30; // 66.666...

    it('Total DPS is aggregate damage/time, not the sum of per-fight DPS rates', () => {
        const dpsTop = lbs.dps?.[0];
        expect(dpsTop).toBeTruthy();
        expect(dpsTop.value).toBeCloseTo(aggDps, 1);
        expect(dpsTop.value).not.toBeCloseTo(150, 0); // the old, meaningless sum
    });

    it('Total Damage remains the cumulative sum', () => {
        expect(lbs.damage?.[0]?.value).toBe(2000);
    });

    it('per-second card leaderboards include damage and dps (no longer 0 / "No data")', () => {
        expect(Array.isArray(perSec?.damage)).toBe(true);
        expect(perSec.damage.length).toBeGreaterThan(0);
        expect(Array.isArray(perSec?.dps)).toBe(true);
        expect(perSec.dps.length).toBeGreaterThan(0);
    });

    it('Damage /1s equals aggregate DPS, and /60s equals DPS*60', () => {
        expect(perSec.damage[0].value).toBeCloseTo(aggDps, 1);
        expect(perMin.damage[0].value).toBeCloseTo(aggDps * 60, 0);
    });

    it('DPS is already a rate, so it reads the same across modes', () => {
        expect(perSec.dps[0].value).toBeCloseTo(aggDps, 1);
        expect(perMin.dps[0].value).toBeCloseTo(aggDps, 1);
    });
});
