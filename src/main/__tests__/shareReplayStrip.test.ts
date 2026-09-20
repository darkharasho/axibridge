import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { stripShareReplay } from '../shareReplayStrip';
import { compressReport } from '../shareService';
import { REPLAY_SHARE_OF_REPORT } from '../shareRetention';

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

/**
 * The hand-built fixtures above prove the strip removes what it should. They
 * cannot prove it KEEPS what it should, because they only contain keys someone
 * already thought to put in them — and a demote overwrites a report a user has
 * already published a link to, one way, with no path back to the full bytes.
 *
 * So this block runs the same strip over a real 42-player WvW report and
 * asserts on the shape as a whole: every top-level key, every native block, and
 * every player survives. A future strip that reached one key too far would show
 * up here as a missing key rather than as a blanked section in someone's
 * already-shared report.
 *
 * `readFileSync` rather than a static import: these fixtures are megabytes of
 * JSON and a static import of one OOMs `tsc --noEmit` at 8 GB.
 */
describe('stripShareReplay over a real report', () => {
    const FIXTURE = path.resolve(process.cwd(), 'test-fixtures/native/20260117-181030.json');
    const full = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
    const stripped = stripShareReplay(full);

    it('keeps every top-level key and every native block', () => {
        expect(Object.keys(stripped).sort()).toEqual(Object.keys(full).sort());
        expect(Object.keys(stripped.native).sort()).toEqual(Object.keys(full.native).sort());
        expect(Object.keys(stripped.native.blocks).sort())
            .toEqual(Object.keys(full.native.blocks).sort());
    });

    it('drops the replay tracks and nothing else in that block', () => {
        expect(stripped.native.blocks.replay.tracks).toBeUndefined();
        expect(Object.keys(stripped.native.blocks.replay).sort())
            .toEqual(Object.keys(full.native.blocks.replay).filter((k) => k !== 'tracks').sort());
    });

    it('keeps every actor, without positions but with down/dead intervals', () => {
        expect(stripped.players).toHaveLength(full.players.length);
        expect(stripped.targets).toHaveLength(full.targets.length);
        for (const actor of [...stripped.players, ...stripped.targets]) {
            if (!actor.combatReplayData) continue;
            expect(actor.combatReplayData.positions).toBeUndefined();
            expect(actor.combatReplayData.start).toBeDefined();
            expect(actor.combatReplayData.down).toBeDefined();
            expect(actor.combatReplayData.dead).toBeDefined();
        }
    });

    it('does not mutate the live in-app object', () => {
        expect(full.native.blocks.replay.tracks).toBeDefined();
        expect(full.players[0].combatReplayData.positions).toBeDefined();
    });

    /**
     * The planner projects reclaim from REPLAY_SHARE_OF_REPORT and stops once
     * the PROJECTED total is under the mark, so a constant that runs ahead of
     * reality leaves the user over budget believing the work is done. This is
     * the measurement the constant is supposed to model; it is asserted as a
     * loose band because the real spread across fixtures is 20%-63%.
     */
    it('reclaims bytes in the band the planner projects', () => {
        const measured = 1 - compressReport(stripped).length / compressReport(full).length;
        expect(measured).toBeGreaterThan(0.15);
        expect(REPLAY_SHARE_OF_REPORT).toBeGreaterThan(0.15);
        expect(REPLAY_SHARE_OF_REPORT).toBeLessThan(0.45);
    });
});
