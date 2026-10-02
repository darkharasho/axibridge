import { describe, it, expect } from 'vitest';
import { pickDefaultFightId, findClosestMember, firstPopulatedTimeMs } from '../replaySelectors';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const fight = (over: Partial<ReplayFightPayload>): ReplayFightPayload => ({
    fightId: 'f0', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 100,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 0, kills: 0, deaths: 0,
    movementData: { pollingRate: 300, durationMs: 100, pixelsPerInch: { x: 1, y: 1 }, members: [], boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [], killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ccInSamples: null, stripInSamples: null, ccTakenEvents: null, tickRate: null, ...over,
});

describe('pickDefaultFightId', () => {
    it('returns null for empty list', () => {
        expect(pickDefaultFightId([])).toBeNull();
    });

    it('returns the most recent fight by timestamp', () => {
        const list = [
            fight({ fightId: 'a', timestampMs: 1000 }),
            fight({ fightId: 'b', timestampMs: 2000 }),
            fight({ fightId: 'c', timestampMs: 500 }),
        ];
        expect(pickDefaultFightId(list)).toBe('b');
    });

    it('breaks ties on fightIndex (highest wins)', () => {
        const list = [
            fight({ fightId: 'a', fightIndex: 0, timestampMs: 1000 }),
            fight({ fightId: 'b', fightIndex: 1, timestampMs: 1000 }),
        ];
        expect(pickDefaultFightId(list)).toBe('b');
    });
});

describe('findClosestMember', () => {
    let nextId = 1;
    const m = (name: string, x: number, y: number): SquadMemberMovement => ({
        id: nextId++, name, account: name, profession: '', eliteSpec: '', group: 1,
        isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
        firstPoll: 0, positions: [[x, y]], downRanges: [], deadRanges: [],
    });

    it('returns null when no members are positioned', () => {
        expect(findClosestMember([], 0, 100, 100, 200)).toBeNull();
    });

    it('picks the nearest member inside the radius', () => {
        const members = [m('Alice', 100, 100), m('Bob', 110, 110), m('Carol', 500, 500)];
        const hit = findClosestMember(members, 0, 105, 105, 50);
        expect(hit?.name).toBe('Alice');
    });

    it('returns null when nothing is inside the radius', () => {
        const members = [m('Alice', 100, 100)];
        expect(findClosestMember(members, 0, 500, 500, 50)).toBeNull();
    });

    it('ignores members with no positions', () => {
        const ghost: SquadMemberMovement = {
            id: 99, name: 'Ghost', account: 'g', profession: '', eliteSpec: '', group: 1,
            isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
            firstPoll: 0, positions: [], downRanges: [], deadRanges: [],
        };
        const hit = findClosestMember([ghost, m('Alice', 100, 100)], 0, 101, 101, 5);
        expect(hit?.name).toBe('Alice');
    });
});

describe('firstPopulatedTimeMs', () => {
    const track = (firstPoll: number, positions: [number, number][] = [[0, 0]]) =>
        ({ firstPoll, positions });

    // The measured shape of every native fixture: a handful of tracks start at
    // poll 0, the overwhelming majority at poll 1, a few stragglers later.
    it('returns the latest first poll inside the opening second', () => {
        expect(firstPopulatedTimeMs([track(1), track(1), track(7)], 300)).toBe(300);
    });

    // The bug this seeding exists to prevent: one track starting at poll 0
    // used to pull the whole opening frame back to 0, where it is the only
    // thing drawn. The measured real histogram is {0: 1, 1: 40}.
    it('does not let a lone poll-0 track strand the other 40', () => {
        const members = [track(0), ...Array.from({ length: 40 }, () => track(1))];
        expect(firstPopulatedTimeMs(members, 300)).toBe(300);
    });

    // Fight 24 of report 20260926-180744-08ba: poll 3 (900ms) is still inside
    // the opening second and covers 69 of 103 actors instead of 5.
    it('waits out a slower opening that is still inside the first second', () => {
        expect(firstPopulatedTimeMs([track(0), track(1), track(3)], 300)).toBe(900);
    });

    // Stragglers past the first second are left to pop in; the opening frame
    // must not sit on a blank map waiting for one late joiner.
    it('ignores stragglers beyond the first second', () => {
        expect(firstPopulatedTimeMs([track(1), track(4), track(40)], 300)).toBe(300);
    });

    // Nothing inside the window at all: fall back to the earliest track, which
    // is the old behaviour and still beats showing an empty map.
    it('falls back to the earliest track when none start inside the window', () => {
        expect(firstPopulatedTimeMs([track(9), track(12)], 300)).toBe(2700);
    });

    it('ignores tracks with no samples', () => {
        expect(firstPopulatedTimeMs([track(0, []), track(2)], 300)).toBe(600);
    });

    it('returns 0 when nothing is positioned at all', () => {
        expect(firstPopulatedTimeMs([], 300)).toBe(0);
        expect(firstPopulatedTimeMs([track(4)], 0)).toBe(0);
    });
});
