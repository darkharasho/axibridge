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

    it('renders the newest fight first, but keeps chronological ordinals', () => {
        render(<FightSliceTray onClose={() => {}} />);
        const labels = screen.getAllByTitle(/EBG: Klovan|Red BL: Bravost/).map((el) => el.textContent);
        // 'b' is the later fight (timestamp 2000) and must lead the list...
        expect(labels).toEqual(['Red BL: Bravost', 'EBG: Klovan']);
        // ...while still carrying F2, so the number tracks when the fight happened
        // rather than where it happens to sit on screen.
        const newest = screen.getByLabelText('Red BL: Bravost').closest('.slice-card');
        expect(newest?.textContent).toContain('F2');
    });

    it('shows each enemy profession as an icon with its count, not a bare swatch', () => {
        render(<FightSliceTray onClose={() => {}} />);
        // The count must be readable without hovering — the old swatch put it in a
        // title attribute only, which screen readers and glancing users never saw.
        expect(screen.getByText('\u00d74')).toBeInTheDocument();
        expect(screen.getByText('\u00d72')).toBeInTheDocument();
        const necro = screen.getByTitle('Necromancer: 4');
        expect(necro).toBeInTheDocument();
        expect(necro.querySelector('img')).toBeTruthy();
    });

    it('keeps a real checkbox per card even though the whole card is the hit target', () => {
        render(<FightSliceTray onClose={() => {}} />);
        const boxes = screen.getAllByRole('checkbox');
        expect(boxes).toHaveLength(2);
        expect(boxes[0].tagName).toBe('INPUT');
        expect(boxes[0].closest('label')?.className).toContain('slice-card');
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

    it('matches a real map-shaped label ("EBG: Klovan"), not just a "F1" ordinal', () => {
        // Guards the regression: production used to overwrite fightRoster labels
        // with ordinals ("F1", "F2", ...), which the filter box could never match
        // against its own "map or landmark" placeholder text.
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: 'EBG' } });
        expect(screen.getByText('EBG: Klovan')).toBeInTheDocument();
        expect(screen.queryByText('Red BL: Bravost')).not.toBeInTheDocument();
        // The ordinal survives as a secondary "F1" marker alongside the map label.
        expect(screen.getByText(/F1/)).toBeInTheDocument();
    });

    it('wins-only excludes losses', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: /wins only/i }));
        expect([...useStatsStore.getState().excludedFightKeys]).toEqual(['b']);
    });

    it('wins-only re-includes wins after None, so the two compose', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.click(screen.getByRole('button', { name: 'None' }));
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(2);
        fireEvent.click(screen.getByRole('button', { name: /wins only/i }));
        // 'a' is the win and must be re-included; 'b' is the loss and stays excluded.
        expect([...useStatsStore.getState().excludedFightKeys]).toEqual(['b']);
    });

    it('All / None / Invert only act on the fights currently passing the filter', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: 'Bravost' } });

        fireEvent.click(screen.getByRole('button', { name: 'None' }));
        // Only 'b' (Bravost) is visible under the filter, so only it gets excluded.
        expect([...useStatsStore.getState().excludedFightKeys]).toEqual(['b']);

        fireEvent.click(screen.getByRole('button', { name: 'All' }));
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(0);

        fireEvent.click(screen.getByRole('button', { name: 'None' }));
        fireEvent.click(screen.getByRole('button', { name: 'Invert' }));
        // Inverting under the filter flips only the visible fight ('b') back in.
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(0);
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
