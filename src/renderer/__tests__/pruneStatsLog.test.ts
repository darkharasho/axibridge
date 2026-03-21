import { describe, it, expect } from 'vitest';
import { pruneDetailsForStats } from '../stats/utils/pruneStatsLog';

describe('pruneDetailsForStats — skillMap proc flags', () => {
    it('preserves isTraitProc, isGearProc, and isUnconditionalProc on skillMap entries', () => {
        const details = {
            players: [],
            targets: [],
            skillMap: {
                s100: { name: 'Windborne Notes', icon: 'https://example.com/icon.png', autoAttack: false, isTraitProc: true, isGearProc: false, isUnconditionalProc: false },
                s200: { name: 'Sigil of Fire', icon: 'https://example.com/fire.png', autoAttack: false, isTraitProc: false, isGearProc: true, isUnconditionalProc: false },
                s300: { name: 'Selfless Daring', icon: 'https://example.com/sd.png', autoAttack: false, isTraitProc: false, isGearProc: false, isUnconditionalProc: true },
                s400: { name: 'Sword Strike', icon: 'https://example.com/sword.png', autoAttack: true, isTraitProc: false, isGearProc: false, isUnconditionalProc: false },
            },
        };
        const pruned = pruneDetailsForStats(details);
        expect(pruned.skillMap.s100.isTraitProc).toBe(true);
        expect(pruned.skillMap.s100.isGearProc).toBe(false);
        expect(pruned.skillMap.s100.isUnconditionalProc).toBe(false);
        expect(pruned.skillMap.s200.isGearProc).toBe(true);
        expect(pruned.skillMap.s300.isUnconditionalProc).toBe(true);
        expect(pruned.skillMap.s400.autoAttack).toBe(true);
        expect(pruned.skillMap.s400.isTraitProc).toBe(false);
    });

    it('omits proc flags when they are not present on the source entry', () => {
        const details = {
            players: [],
            targets: [],
            skillMap: {
                s500: { name: 'Plain Skill', icon: 'https://example.com/plain.png' },
            },
        };
        const pruned = pruneDetailsForStats(details);
        expect(pruned.skillMap.s500.name).toBe('Plain Skill');
        expect(pruned.skillMap.s500.isTraitProc).toBeUndefined();
        expect(pruned.skillMap.s500.isGearProc).toBeUndefined();
        expect(pruned.skillMap.s500.isUnconditionalProc).toBeUndefined();
    });
});

describe('pruneDetailsForStats — denylist behavior', () => {
    it('strips denied top-level fields', () => {
        const details = {
            players: [],
            targets: [],
            mechanics: [{ name: 'Stomp', data: [] }],
            fightName: 'Test',
        };
        const pruned = pruneDetailsForStats(details);
        expect(pruned.mechanics).toBeUndefined();
        expect(pruned.fightName).toBe('Test');
    });

    it('passes through unknown top-level fields', () => {
        const details = {
            players: [],
            targets: [],
            newEiField: { some: 'data' },
        };
        const pruned = pruneDetailsForStats(details);
        expect(pruned.newEiField).toEqual({ some: 'data' });
    });

    it('passes through unknown player fields', () => {
        const details = {
            players: [{ name: 'Alice', futureField: 'new data', combatReplayData: null, minions: [] }],
            targets: [],
        };
        const pruned = pruneDetailsForStats(details);
        expect(pruned.players[0].futureField).toBe('new data');
    });

    it('passes through unknown target fields', () => {
        const details = {
            players: [],
            targets: [{ id: 1, futureField: 'new data', combatReplayData: null }],
        };
        const pruned = pruneDetailsForStats(details);
        expect(pruned.targets[0].futureField).toBe('new data');
    });

    it('does not mutate original player objects', () => {
        const player = { name: 'Alice', minions: [{ name: 'Golem', totalDamageTakenDist: [], extra: true }], combatReplayData: { start: 0, extra: true } };
        const details = { players: [player], targets: [] };
        pruneDetailsForStats(details);
        expect(player.minions[0].extra).toBe(true);
        expect(player.combatReplayData.extra).toBe(true);
    });
});
