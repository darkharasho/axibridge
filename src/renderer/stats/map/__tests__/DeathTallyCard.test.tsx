import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { DeathTallyCard, countDead } from '../DeathTallyCard';
import { useStatsStore } from '../../statsStore';
import type { SquadMemberMovement } from '../../../../shared/movementData';

let nextId = 1;
const mkMember = (o: Partial<SquadMemberMovement> = {}): SquadMemberMovement => ({
    id: nextId++,
    name: 'Player', account: 'P.1', profession: 'Guardian', eliteSpec: '',
    group: 1, isCommander: false, isLocal: false, isEnemy: false, inSquad: true,
    firstPoll: 0, positions: [[10, 10]], downRanges: [], deadRanges: [], ...o,
});

const dead = (o: Partial<SquadMemberMovement> = {}) => mkMember({ ...o, deadRanges: o.deadRanges ?? [[0, 9000]] });
const enemy = (o: Partial<SquadMemberMovement> = {}): Partial<SquadMemberMovement> => ({ isEnemy: true, inSquad: false, ...o });

beforeEach(() => {
    useStatsStore.getState().resetReplayLayers();
});

describe('countDead', () => {
    it('splits the currently-dead by side', () => {
        const n = countDead([dead(), dead(), dead(enemy()), mkMember()], 1000);
        expect(n).toEqual({ squad: 2, enemy: 1 });
    });

    it('counts nobody outside their death window', () => {
        expect(countDead([dead()], 9500)).toEqual({ squad: 0, enemy: 0 });
    });

    it('excludes despawned members — they left, they did not die', () => {
        const m = mkMember({ deadRanges: [[0, 9000]], dcRanges: [[500, 2000]] });
        expect(countDead([m], 1000)).toEqual({ squad: 0, enemy: 0 });
        expect(countDead([m], 3000)).toEqual({ squad: 1, enemy: 0 });
    });

    it('ignores non-squad friendlies, which the map does not draw either', () => {
        expect(countDead([dead({ inSquad: false })], 1000)).toEqual({ squad: 0, enemy: 0 });
    });
});

describe('DeathTallyCard', () => {
    it('shows both counts while dead players are hidden', () => {
        const { getByTitle } = render(
            <DeathTallyCard members={[dead(), dead(enemy())]} timeMs={1000} />,
        );
        expect(getByTitle(/hidden from the map/i).textContent).toContain('1');
    });

    it('renders nothing when nobody is dead', () => {
        const { container } = render(<DeathTallyCard members={[mkMember()]} timeMs={1000} />);
        expect(container.querySelector('[data-death-tally]')).toBeNull();
    });

    it('renders nothing once the dead are on the map — a count of visible things is clutter', () => {
        useStatsStore.getState().setReplayLayer('showDead', true);
        const { container } = render(<DeathTallyCard members={[dead()]} timeMs={1000} />);
        expect(container.querySelector('[data-death-tally]')).toBeNull();
    });

    it('turns the dead back on when clicked', () => {
        const { container } = render(<DeathTallyCard members={[dead()]} timeMs={1000} />);
        fireEvent.click(container.querySelector('[data-death-tally]')!);
        expect(useStatsStore.getState().replayLayers.showDead).toBe(true);
    });
});
