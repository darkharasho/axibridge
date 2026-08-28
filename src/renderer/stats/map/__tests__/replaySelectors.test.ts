import { describe, it, expect } from 'vitest';
import { pickDefaultFightId, findClosestMember } from '../replaySelectors';
import type { ReplayFightPayload } from '../replayTypes';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const fight = (over: Partial<ReplayFightPayload>): ReplayFightPayload => ({
    fightId: 'f0', fightIndex: 0, label: 'x', timestampMs: 0, durationMs: 100,
    mapKey: null, mapImageUrl: null, mapSize: null, avgPosition: null,
    nearestLandmark: null, squadSize: 0, kills: 0, deaths: 0,
    movementData: { pollingRate: 300, durationMs: 100, pixelsPerInch: { x: 1, y: 1 }, members: [], boonIcons: {}, skillIcons: {}, groundMarkers: [] },
    dpsSamples: [], killEvents: [], damageSpikeEvents: [], rallyEvents: [], targetFocusSamples: [],
    sectorOwners: null, ccSamples: null, stripSamples: null, ...over,
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
