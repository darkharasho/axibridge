import { describe, it, expect } from 'vitest';
import { pruneDetailsForWorker } from '../hooks/useStatsAggregationWorker';

describe('pruneDetailsForWorker', () => {
    const makeDetails = () => ({
        // Retained top-level fields
        players: [
            {
                account: 'Player.1234',
                name: 'TestChar',
                profession: 'Guardian',
                dpsAll: [{ damage: 100 }],
                defenses: [{ damageTaken: 50 }],
                support: [{ condiCleanse: 3 }],
                rotation: [{ id: 1, skills: [] }],
                totalDamageDist: [[{ id: 1, totalDamage: 100 }]],
                targetDamageDist: [[{ id: 1, totalDamage: 80 }]],
                targetDamage1S: [[[0, 10, 20]]],
                incomingDamageModifiers: [{ id: 1 }],
                damageTaken1S: [[0, 5, 10]],
                combatReplayData: { start: 0, positions: Array(500).fill([0, 0]) },
                // Fields that should be stripped
                targetBreakbarDamage1S: [[[0, 1, 2]]],
                squadBuffVolumesActive: [{ id: 1, buffs: [] }],
            }
        ],
        targets: [{ name: 'Enemy', isFake: false, buffs: [] }],
        skillMap: { s1: { name: 'Skill' } },
        buffMap: { b1: { name: 'Buff' } },
        durationMS: 60000,
        success: true,
        fightName: 'Test Fight',
        damageModMap: { d1: { name: 'Mod' } },
        combatReplayMetaData: { inchToPixel: 1 },
        // Fields that should be stripped
        phases: [{ name: 'Full Fight', start: 0, end: 60000 }],
        logErrors: ['some parser warning'],
    });

    it('strips top-level denied fields', () => {
        const input = makeDetails();
        const result = pruneDetailsForWorker(input);
        expect(result.phases).toBeUndefined();
        expect(result.logErrors).toBeUndefined();
    });

    it('retains top-level used fields', () => {
        const input = makeDetails();
        const result = pruneDetailsForWorker(input);
        expect(result.skillMap).toEqual(input.skillMap);
        expect(result.buffMap).toEqual(input.buffMap);
        expect(result.targets).toEqual(input.targets);
        expect(result.durationMS).toBe(60000);
        expect(result.success).toBe(true);
        expect(result.fightName).toBe('Test Fight');
        expect(result.damageModMap).toEqual(input.damageModMap);
        expect(result.combatReplayMetaData).toEqual(input.combatReplayMetaData);
    });

    it('retains the native series the worker path needs for the CC/strip timelines', () => {
        // computeControlTimeline (and computeStabPerformance before it) reads
        // details.native via readEntitySeries/squadEntities on the WORKER
        // side. `native` is not in DETAILS_TOP_LEVEL_DENY, but that list is
        // maintained by hand — if a future entry ever added 'native' (or
        // something that shadows it) to the deny list, the worker path would
        // silently produce an all-zero grid while the inline path kept
        // working, which is exactly the failure mode "absent is not zero"
        // exists to prevent. Pin the survival explicitly rather than relying
        // on the deny list staying empty of it by accident.
        const input = {
            ...makeDetails(),
            native: {
                blocks: {
                    series: { 1: { cc_applied: [1, 2, 3], strips: [0, 1, 0] } },
                },
            },
        };
        const result = pruneDetailsForWorker(input);
        expect(result.native).toEqual(input.native);
    });

    it('strips per-player denied fields', () => {
        const input = makeDetails();
        const result = pruneDetailsForWorker(input);
        const player = result.players[0];
        expect(player.targetBreakbarDamage1S).toBeUndefined();
        expect(player.squadBuffVolumesActive).toBeUndefined();
    });

    it('retains per-player used fields', () => {
        const input = makeDetails();
        const result = pruneDetailsForWorker(input);
        const player = result.players[0];
        expect(player.account).toBe('Player.1234');
        expect(player.dpsAll).toEqual([{ damage: 100 }]);
        expect(player.rotation).toEqual(input.players[0].rotation);
        expect(player.targetDamageDist).toEqual(input.players[0].targetDamageDist);
        expect(player.targetDamage1S).toEqual(input.players[0].targetDamage1S);
        expect(player.incomingDamageModifiers).toEqual(input.players[0].incomingDamageModifiers);
        expect(player.damageTaken1S).toEqual(input.players[0].damageTaken1S);
        expect(player.combatReplayData).toEqual(input.players[0].combatReplayData);
    });

    it('does not mutate the input', () => {
        const input = makeDetails();
        const originalPhases = input.phases;
        const originalReplay = input.players[0].combatReplayData;
        pruneDetailsForWorker(input);
        expect(input.phases).toBe(originalPhases);
        expect(input.players[0].combatReplayData).toBe(originalReplay);
    });

    it('handles null/undefined details', () => {
        expect(pruneDetailsForWorker(null)).toBeNull();
        expect(pruneDetailsForWorker(undefined)).toBeUndefined();
    });

    it('handles missing players array', () => {
        const input = { durationMS: 1000, success: true };
        const result = pruneDetailsForWorker(input);
        expect(result.durationMS).toBe(1000);
        expect(result.players).toBeUndefined();
    });

    it('handles empty players array', () => {
        const input = { players: [], durationMS: 1000 };
        const result = pruneDetailsForWorker(input);
        expect(result.players).toEqual([]);
    });
});
