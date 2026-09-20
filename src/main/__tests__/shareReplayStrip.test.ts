import { describe, expect, it } from 'vitest';
import { stripShareReplay } from '../shareReplayStrip';

const details = () => ({
    native: {
        blocks: {
            replay: { poll_ms: 300, arena: { w: 1 }, tracks: { by_entity: { 1: [0, 0, 1, 1] } } },
            damage: { kept: true }
        },
        catalogs: { skills: { 1: 'Shot' } }
    },
    players: [
        {
            name: 'A',
            combatReplayData: { start: 0, down: [[1, 2]], dead: [], positions: [[0, 0], [1, 1]] }
        },
        { name: 'B' }
    ],
    targets: [{ id: 9, combatReplayData: { start: 0, down: [], dead: [], positions: [[5, 5]] } }],
    mechanics: ['kept'],
    statsAll: [{ distToCom: 120 }]
});

describe('stripShareReplay', () => {
    it('drops native replay tracks but keeps the rest of the replay block', () => {
        const out = stripShareReplay(details());
        expect(out.native.blocks.replay.tracks).toBeUndefined();
        expect(out.native.blocks.replay.poll_ms).toBe(300);
        expect(out.native.blocks.replay.arena).toEqual({ w: 1 });
    });

    it('drops positions but keeps down/dead intervals, which revive tracking reads', () => {
        const out = stripShareReplay(details());
        expect(out.players[0].combatReplayData.positions).toBeUndefined();
        expect(out.players[0].combatReplayData.down).toEqual([[1, 2]]);
        expect(out.players[0].combatReplayData.start).toBe(0);
        expect(out.targets[0].combatReplayData.positions).toBeUndefined();
        expect(out.targets[0].combatReplayData.dead).toEqual([]);
    });

    // The whole reason this is not `pruneDetailsForStats`: that function's
    // denylists are tuned for the in-app stats pipeline, a smaller surface than
    // the share viewer renders. A demote must not blank published sections.
    it('keeps everything the stats-pipeline denylists would have removed', () => {
        const out = stripShareReplay(details());
        expect(out.mechanics).toEqual(['kept']);
        expect(out.native.blocks.damage).toEqual({ kept: true });
        expect(out.native.catalogs.skills).toEqual({ 1: 'Shot' });
        expect(out.statsAll).toEqual([{ distToCom: 120 }]);
    });

    it('leaves an actor with no replay data untouched', () => {
        const out = stripShareReplay(details());
        expect(out.players[1]).toEqual({ name: 'B' });
    });

    it('does not mutate the caller’s copy, which is the live in-app object', () => {
        const input = details();
        stripShareReplay(input);
        expect(input.native.blocks.replay.tracks).toBeDefined();
        expect(input.players[0].combatReplayData?.positions).toHaveLength(2);
    });

    it('tolerates a details object with no replay data at all', () => {
        expect(stripShareReplay({ players: [], targets: [] })).toEqual({ players: [], targets: [] });
        expect(stripShareReplay(null)).toBeNull();
    });

    it('actually reclaims bytes', () => {
        const before = JSON.stringify(details()).length;
        const after = JSON.stringify(stripShareReplay(details())).length;
        expect(after).toBeLessThan(before);
    });
});
