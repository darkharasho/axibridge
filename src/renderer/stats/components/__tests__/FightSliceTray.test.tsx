import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useStatsStore, type FightRosterEntry } from '../../statsStore';
import { FightSliceTray, FightSliceBanner } from '../FightSliceTray';

const roster: FightRosterEntry[] = [
    { id: 'a', label: 'EBG: Klovan', timestamp: 1_000, duration: '2:41', isWin: true,
      enemyClassCounts: { Necromancer: 4 } },
    { id: 'b', label: 'Red BL: Bravost', timestamp: 2_000, duration: '1:20', isWin: false,
      enemyClassCounts: { Guardian: 2 } },
];

beforeEach(() => {
    useStatsStore.setState((useStatsStore as any).getInitialState());
    useStatsStore.getState().mergeFightRoster(roster, ['a', 'b']);
});

describe('FightSliceTray', () => {
    it('lists every fight in the roster', () => {
        render(<FightSliceTray onClose={() => {}} />);
        expect(screen.getByText('EBG: Klovan')).toBeInTheDocument();
        expect(screen.getByText('Red BL: Bravost')).toBeInTheDocument();
    });

    it('still lists a fight after it is unchecked', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.click(screen.getByRole('checkbox', { name: /EBG: Klovan/i }));
        expect(useStatsStore.getState().excludedFightKeys.has('a')).toBe(true);
        expect(screen.getByText('EBG: Klovan')).toBeInTheDocument();
    });

    it('None excludes everything and All clears the slice', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: 'None' }));
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(2);
        fireEvent.click(screen.getByRole('button', { name: 'All' }));
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(0);
    });

    it('Invert flips the selection', () => {
        useStatsStore.getState().setFightsExcluded(['a'], true);
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: 'Invert' }));
        expect([...useStatsStore.getState().excludedFightKeys]).toEqual(['b']);
    });

    it('filters the visible list by label without changing the slice', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: 'Bravost' } });
        expect(screen.queryByText('EBG: Klovan')).not.toBeInTheDocument();
        expect(screen.getByText('Red BL: Bravost')).toBeInTheDocument();
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(0);
    });

    it('wins-only excludes losses', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /wins only/i }));
        expect([...useStatsStore.getState().excludedFightKeys]).toEqual(['b']);
    });
});

describe('FightSliceBanner', () => {
    it('renders nothing when no slice is active', () => {
        const { container } = render(<FightSliceBanner />);
        expect(container).toBeEmptyDOMElement();
    });

    it('reports the slice size against the roster size', () => {
        useStatsStore.getState().setFightsExcluded(['b'], true);
        render(<FightSliceBanner />);
        expect(screen.getByText(/1 of 2 fights/i)).toBeInTheDocument();
    });

    it('clears the slice', () => {
        useStatsStore.getState().setFightsExcluded(['b'], true);
        render(<FightSliceBanner />);
        fireEvent.click(screen.getByRole('button', { name: /clear slice/i }));
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(0);
    });
});
