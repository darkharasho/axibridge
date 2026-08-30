import { describe, it, expect } from 'vitest';
import { hpAt, statusAt, activeBoons, activeSkillsAt, memberSpec, maxConcurrentBuffs } from '../partyMemberHelpers';
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

describe('maxConcurrentBuffs', () => {
    const mk = (boonStates?: Record<number, [number, number][]>): SquadMemberMovement => ({
        id: 1, name: 'T', account: 'T.1', profession: 'Guardian', eliteSpec: '',
        group: 1, isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
        firstPoll: 0, positions: [], downRanges: [], deadRanges: [], boonStates,
    });

    it('is zero for a member with no buff states at all', () => {
        expect(maxConcurrentBuffs(mk())).toEqual({ boons: 0, condis: 0 });
    });

    it('counts boons and conditions into separate peaks', () => {
        // 743 Aegis + 717 Protection are boons, 738 Vulnerability is a condition.
        const m = mk({ 743: [[0, 1]], 717: [[0, 1]], 738: [[0, 5]] });
        expect(maxConcurrentBuffs(m)).toEqual({ boons: 2, condis: 1 });
    });

    it('takes the peak across the fight, not the count at any one instant', () => {
        // Three boons are never up together: Aegis drops before Stability rises.
        const m = mk({
            743: [[0, 1], [1000, 0]],
            717: [[0, 1]],
            1122: [[2000, 1]],
        });
        expect(maxConcurrentBuffs(m).boons).toBe(2);
    });

    it('does not count an id whose stacks fall back to zero', () => {
        const m = mk({ 743: [[0, 1], [1000, 0]] });
        // Peak is still 1 — it WAS up at t=0.
        expect(maxConcurrentBuffs(m).boons).toBe(1);
    });

    it('resolves a simultaneous rise and fall exactly, not as an overlap', () => {
        // At t=1000 Aegis drops and Stability rises in the same tick. The peak
        // is 1, not 2 — sampling mid-timestamp would report a phantom overlap.
        const m = mk({ 743: [[0, 1], [1000, 0]], 1122: [[1000, 1]] });
        expect(maxConcurrentBuffs(m).boons).toBe(1);
    });

    it('ignores stack-count changes that do not toggle presence', () => {
        const m = mk({ 738: [[0, 5], [1000, 25], [2000, 12]] });
        expect(maxConcurrentBuffs(m).condis).toBe(1);
    });
});
