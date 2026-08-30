import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useStatsStore, type FightRosterEntry } from '../../statsStore';
import { FightSliceTray } from '../FightSliceTray';

// Three outcomes, not two. `isWin` is tri-state: a fight the aggregator could
// not call either way stays undefined, and the card renders it with no
// Win/Loss suffix at all. Both outcome buttons must therefore include exactly
// what they name and drop the undecided fight — otherwise "Losses only" would
// quietly fold every unscored fight into the loss pile.
const roster: FightRosterEntry[] = [
    { id: 'win', label: 'EBG: Klovan', timestamp: 1_000, duration: '2:41', isWin: true },
    { id: 'loss', label: 'Red BL: Bravost', timestamp: 2_000, duration: '1:20', isWin: false },
    { id: 'unknown', label: 'Green BL: Titanpaw', timestamp: 3_000, duration: '0:45' },
];

const excluded = () => [...useStatsStore.getState().excludedFightKeys].sort();

beforeEach(() => {
    useStatsStore.setState((useStatsStore as any).getInitialState());
    useStatsStore.getState().mergeFightRoster(roster, ['win', 'loss', 'unknown']);
});

describe('FightSliceTray outcome filters', () => {
    it('keeps only the won fights when Wins only is clicked', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.click(screen.getByText('Wins only'));
        expect(excluded()).toEqual(['loss', 'unknown']);
    });

    it('keeps only the lost fights when Losses only is clicked', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.click(screen.getByText('Losses only'));
        expect(excluded()).toEqual(['unknown', 'win']);
    });

    it('replaces the previous outcome pick rather than intersecting with it', () => {
        // Wins only then Losses only must leave the losses selected. If the
        // second click only excluded, both would end up excluded and the slice
        // would be empty.
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.click(screen.getByText('Wins only'));
        fireEvent.click(screen.getByText('Losses only'));
        expect(excluded()).toEqual(['unknown', 'win']);
    });

    it('acts only on fights the text filter leaves visible', () => {
        // Same contract as All/None/Invert: the filter box scopes the action, so
        // a fight scrolled out by the query keeps whatever state it had.
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.click(screen.getByText('None'));
        fireEvent.change(screen.getByPlaceholderText(/Filter by map/), { target: { value: 'Red BL' } });
        fireEvent.click(screen.getByText('Losses only'));
        // 'loss' is visible and lost, so it comes back; the hidden two stay out.
        expect(excluded()).toEqual(['unknown', 'win']);
    });
});
