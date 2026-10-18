import { describe, it, expect } from 'vitest';
import { applyMark, estimateLag, pickTagPair, speedSeries } from '../replayMarks';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const mk = (over: Partial<SquadMemberMovement>): SquadMemberMovement => ({
    id: 1, name: 'X', account: '', profession: 'Guardian', eliteSpec: '',
    group: 1, isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: [], downRanges: [], deadRanges: [],
    ...over,
});

describe('applyMark', () => {
    const members = [
        mk({ id: 1 }), mk({ id: 2 }),
        mk({ id: 10, isEnemy: true, inSquad: false }), mk({ id: 11, isEnemy: true, inSquad: false }),
    ];

    it('moves a kind within a side but lets each side hold one', () => {
        let marks = applyMark({}, members, 10, 'tag');
        marks = applyMark(marks, members, 1, 'tag');
        expect(marks).toEqual({ 10: 'tag', 1: 'tag' });
        // Re-marking another enemy moves the enemy tag, leaves ours alone.
        marks = applyMark(marks, members, 11, 'tag');
        expect(marks).toEqual({ 11: 'tag', 1: 'tag' });
    });

    it('replaces a member\'s mark and clears with null', () => {
        let marks = applyMark({}, members, 2, 'star');
        marks = applyMark(marks, members, 2, 'circle');
        expect(marks).toEqual({ 2: 'circle' });
        expect(applyMark(marks, members, 2, null)).toEqual({});
    });
});

describe('pickTagPair', () => {
    const cmd = mk({ id: 1, isCommander: true, account: 'Cmd.1' });
    const mate = mk({ id: 2, account: 'Mate.2' });
    const foe = mk({ id: 10, isEnemy: true, inSquad: false });

    it('needs a marked enemy tag', () => {
        expect(pickTagPair([cmd, foe], {})).toBeNull();
        expect(pickTagPair([cmd, foe], undefined)).toBeNull();
    });

    it('falls back to our commander, and prefers a friendly marked tag', () => {
        expect(pickTagPair([cmd, mate, foe], { 10: 'tag' })?.ours.id).toBe(1);
        expect(pickTagPair([cmd, mate, foe], { 10: 'tag', 2: 'tag' })?.ours.id).toBe(2);
    });
});

describe('speedSeries', () => {
    it('reads inches per second and blanks death and pre-track polls', () => {
        // 1000ms polls, 1px per inch, 100px per poll => 100 in/s.
        const m = mk({
            firstPoll: 1,
            positions: [[0, 0], [100, 0], [200, 0], [300, 0], [5000, 0], [5100, 0]],
            deadRanges: [[3500, 4500]],
        });
        const s = speedSeries(m, 8, 1000, { x: 1, y: 1 }, 0);
        expect(s[0]).toBeNull();          // before the track
        expect(s[1]).toBeNull();          // first sample has no predecessor
        expect(s[2]).toBe(100);
        expect(s[3]).toBe(100);
        expect(s[4]).toBeNull();          // dead at 4000
        expect(s[5]).toBeNull();          // previous poll dead: the waypoint jump
        expect(s[6]).toBe(100);
        expect(s[7]).toBeNull();          // track ended
    });
});

describe('estimateLag', () => {
    // A move-stop pattern, and a copy of it delayed by 4 polls.
    const pattern = Array.from({ length: 120 }, (_, i) => (Math.floor(i / 10) % 2 === 0 ? 300 : 20) + (i % 3));
    const delayed = pattern.map((_, i) => (i >= 4 ? pattern[i - 4] : null));

    it('recovers a known delay with its sign', () => {
        expect(estimateLag(pattern, delayed, 15)?.lagPolls).toBe(4);
        expect(estimateLag(delayed, pattern, 15)?.lagPolls).toBe(-4);
    });

    it('reports nothing for curves that do not move together', () => {
        const flat = pattern.map(() => 250);
        expect(estimateLag(pattern, flat, 15)).toBeNull();
    });
});
