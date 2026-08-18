import { describe, it, expect } from 'vitest';
import { hpAt, statusAt, activeBoons, activeSkillsAt, memberSpec } from '../partyMemberHelpers';
import type { SquadMemberMovement } from '../../../../shared/movementData';

const base: SquadMemberMovement = {
    id: 1, name: 'A', account: 'A.1', profession: 'Guardian', eliteSpec: '', group: 1,
    isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: [], downRanges: [], deadRanges: [],
};

describe('hpAt', () => {
    it('returns 100 when no health series', () => {
        expect(hpAt(base, 5000)).toBe(100);
    });
    it('returns the last sample before or at timeMs', () => {
        const m = { ...base, healthPercents: [[1000, 80], [3000, 60]] as [number, number][] };
        expect(hpAt(m, 2000)).toBe(80);
        expect(hpAt(m, 3000)).toBe(60);
        expect(hpAt(m, 4000)).toBe(60);
    });
    it('returns 100 before first sample', () => {
        const m = { ...base, healthPercents: [[2000, 70]] as [number, number][] };
        expect(hpAt(m, 500)).toBe(100);
    });
});

describe('statusAt', () => {
    it('returns alive when no ranges match', () => {
        expect(statusAt(base, 1000)).toBe('alive');
    });
    it('returns dead when in a deadRange (end=0 means ongoing)', () => {
        const m = { ...base, deadRanges: [[1000, 0]] as [number, number][] };
        expect(statusAt(m, 2000)).toBe('dead');
    });
    it('returns dead when in a deadRange with an end time', () => {
        const m = { ...base, deadRanges: [[1000, 3000]] as [number, number][] };
        expect(statusAt(m, 1500)).toBe('dead');
        expect(statusAt(m, 3001)).toBe('alive');
    });
    it('returns down when in downRange but not deadRange', () => {
        const m = { ...base, downRanges: [[2000, 4000]] as [number, number][] };
        expect(statusAt(m, 3000)).toBe('down');
    });
    it('dead takes priority over down', () => {
        const m = {
            ...base,
            deadRanges: [[2000, 4000]] as [number, number][],
            downRanges: [[2000, 4000]] as [number, number][],
        };
        expect(statusAt(m, 3000)).toBe('dead');
    });
});

describe('activeBoons', () => {
    it('returns empty array with no boonStates', () => {
        expect(activeBoons(base, 1000)).toEqual([]);
    });
    it('returns boons with stacks > 0 at timeMs, including stack count', () => {
        const m = {
            ...base,
            boonStates: {
                743: [[0, 25], [5000, 0]] as [number, number][],
                725: [[0, 1]] as [number, number][],
            },
        };
        const result = activeBoons(m, 1000);
        expect(result.map(b => b.id)).toEqual(expect.arrayContaining([743, 725]));
        expect(result.length).toBe(2);
        expect(result.find(b => b.id === 743)?.stacks).toBe(25);
        expect(result.find(b => b.id === 725)?.stacks).toBe(1);
    });
    it('excludes boons with stacks = 0 at timeMs', () => {
        const m = {
            ...base,
            boonStates: {
                743: [[0, 1], [2000, 0]] as [number, number][],
            },
        };
        expect(activeBoons(m, 3000)).toEqual([]);
    });
});

describe('activeSkillsAt', () => {
    it('returns empty array with no skillCasts', () => {
        expect(activeSkillsAt(base, 1000)).toEqual([]);
    });
    it('returns skill IDs cast within [timeMs, timeMs+1000)', () => {
        const m = {
            ...base,
            skillCasts: [
                { id: 10, time: 2000, duration: 500 },
                { id: 20, time: 2500, duration: 200 },
                { id: 30, time: 3000, duration: 100 }, // exactly at timeMs+1000 — excluded
                { id: 40, time: 1500, duration: 100 }, // before window — excluded
            ],
        };
        expect(activeSkillsAt(m, 2000)).toEqual([10, 20]);
    });
    it('returns empty array when no casts in window', () => {
        const m = { ...base, skillCasts: [{ id: 10, time: 5000, duration: 100 }] };
        expect(activeSkillsAt(m, 1000)).toEqual([]);
    });
});

// The replay view-model keeps native's split roster fields: `profession` is the BASE
// class ("Elementalist") and the spec lives in `eliteSpec`. EI's `players[].profession`
// is the spec name, which is what `getProfessionIconPath`/`PROFESSION_COLORS` key on —
// so feeding the raw native `profession` drew the base-class icon for every specced
// player on the map and in the party panel.
describe('memberSpec', () => {
    it('prefers the elite spec over the base profession', () => {
        expect(memberSpec({ ...base, profession: 'Elementalist', eliteSpec: 'Tempest' })).toBe('Tempest');
    });
    it('falls back to the base profession for an unspecced core character', () => {
        expect(memberSpec({ ...base, profession: 'Elementalist', eliteSpec: '' })).toBe('Elementalist');
    });
    it('treats a whitespace-only spec as absent', () => {
        expect(memberSpec({ ...base, profession: 'Guardian', eliteSpec: '   ' })).toBe('Guardian');
    });
    it('stringifies a numeric spec id rather than dropping it', () => {
        expect(memberSpec({ ...base, profession: 'Guardian', eliteSpec: 62 })).toBe('62');
    });
});
