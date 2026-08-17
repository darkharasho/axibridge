import { describe, it, expect } from 'vitest';
import { resolveEnemyClassLabel } from '../computePlayerAggregation';

/**
 * Enemy class breakdowns must be grouped by the target's PROFESSION, never by
 * its `name`.
 *
 * In a WvW log a target's `name` is the player's rank title -- "Gold
 * Invader", "Mithril Legend", "Bronze Recruit". Three separate call sites
 * (the expanded log card, the Discord embed, and computeFightBreakdown) each
 * fell back to `name` when `profession` was missing, so the "Enemy Classes"
 * panels charted rank titles as if they were professions. Rank titles are
 * plausible-looking nonsense in that position, which is worse than an honest
 * "Unknown": nothing about "Gold Invader" tells a reader it is not a class.
 *
 * axilog supplies `targets[].profession` as a deliberate superset over EI
 * (GW2EI's `JsonNPC` has no profession member), so for axilog-parsed logs the
 * right answer is available and was simply being discarded.
 */
describe('resolveEnemyClassLabel', () => {
    it('uses the target profession when present', () => {
        expect(resolveEnemyClassLabel({ name: 'Gold Invader', profession: 'Reaper' })).toBe('Reaper');
    });

    it('returns Unknown rather than the WvW rank title when profession is missing', () => {
        expect(resolveEnemyClassLabel({ name: 'Gold Invader' })).toBe('Unknown');
        expect(resolveEnemyClassLabel({ name: 'Mithril Legend', profession: '' })).toBe('Unknown');
        expect(resolveEnemyClassLabel({ name: 'Bronze Recruit', profession: null })).toBe('Unknown');
    });

    it('strips the EI pl-<instance> suffix from a profession-bearing name', () => {
        expect(resolveEnemyClassLabel({ name: 'Reaper pl-2533', profession: 'Reaper pl-2533' })).toBe('Reaper');
    });

    it('never returns a bare elite-spec id as a class name', () => {
        // axilog < 0.3.3 rendered an unnamed elite spec as its numeric id.
        // Consumers must not chart "79" as a class.
        expect(resolveEnemyClassLabel({ name: 'Gold Invader', profession: '79' })).toBe('Unknown');
    });

    it('handles a missing or malformed target without throwing', () => {
        expect(resolveEnemyClassLabel(undefined)).toBe('Unknown');
        expect(resolveEnemyClassLabel(null)).toBe('Unknown');
        expect(resolveEnemyClassLabel({})).toBe('Unknown');
    });
});
