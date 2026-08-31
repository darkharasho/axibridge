/**
 * The Boon Output "Total" column divides by a recipient count. `groupBuffs`
 * and `squadBuffs` divide by a *per-fight average* recipient count, so their
 * uptime is invariant to how many fights the session contains. `totalBuffs`
 * used the raw cumulative `squadSupported` instead, which is a player-fight
 * count -- making the Total column read numFights times too small and shrink
 * further with every extra fight logged. These cases pin the invariance.
 */
import { describe, expect, it } from 'vitest';
import { computeBoonMetrics, type BoonRow } from '../boonGeneration';

/**
 * One squad of `squadSize` (self + others) over `numFights` fights. Every
 * fight is identical: the player keeps the boon on themselves the whole time
 * and on each squadmate half the time.
 */
const makeRow = (numFights: number, squadSize: number): BoonRow => {
    const fightMs = 60_000;
    const activeTimeMs = fightMs * numFights;
    const others = squadSize - 1;
    return {
        account: 'tester.1234',
        profession: 'Firebrand',
        activeTimeMs,
        numFights,
        groupSupported: 5 * numFights,
        squadSupported: squadSize * numFights,
        categories: {
            selfBuffs: { generationMs: activeTimeMs, wastedMs: 0 },
            groupBuffs: { generationMs: 0.5 * activeTimeMs * 4, wastedMs: 0 },
            squadBuffs: { generationMs: 0.5 * activeTimeMs * others, wastedMs: 0 },
        },
    };
};

describe('computeBoonMetrics totalBuffs denominator', () => {
    it('averages self + squad generation over the per-fight squad size', () => {
        // self 100% + 20 squadmates at 50% each, spread over 21 recipients.
        const { uptimeRaw } = computeBoonMetrics(makeRow(10, 21), 'totalBuffs', false);
        expect(uptimeRaw).toBeCloseTo((100 + 50 * 20) / 21, 6);
    });

    it('does not shrink as more fights are added to the same session', () => {
        const one = computeBoonMetrics(makeRow(1, 21), 'totalBuffs', false).uptimeRaw;
        const many = computeBoonMetrics(makeRow(37, 21), 'totalBuffs', false).uptimeRaw;
        expect(many).toBeCloseTo(one, 6);
    });

    it('stays in step with the squad column it contains', () => {
        const row = makeRow(10, 21);
        const total = computeBoonMetrics(row, 'totalBuffs', false).uptimeRaw;
        const squad = computeBoonMetrics(row, 'squadBuffs', false).uptimeRaw;
        expect(squad).toBeCloseTo(50, 6);
        // Total is the same generation plus the player's own uptime, averaged
        // over one more recipient -- so it lands between squad-only and self.
        expect(total).toBeGreaterThan(squad);
        expect(total).toBeLessThan(100);
    });
});
