import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useStatsStore, type FightRosterEntry } from '../../statsStore';
import { FightSliceTray } from '../FightSliceTray';

const commandedRoster: FightRosterEntry[] = [
    { id: 'a', label: 'EBG: Klovan', timestamp: 1_000, duration: '2:41', commander: 'Axi Vale' },
    { id: 'b', label: 'Red BL: Bravost', timestamp: 2_000, duration: '1:20', commander: 'Zephyr Wind' },
    { id: 'c', label: 'EBG: Danelon', timestamp: 3_000, duration: '0:50', commander: 'Axi Vale' },
    { id: 'd', label: 'Green BL: Wildcreek', timestamp: 4_000, duration: '1:05' },
];

const seed = (entries: FightRosterEntry[]) => {
    useStatsStore.setState((useStatsStore as any).getInitialState());
    useStatsStore.getState().mergeFightRoster(entries, entries.map((f) => f.id));
};

beforeEach(() => seed(commandedRoster));

describe('FightSliceTray commander filter', () => {
    it('offers one option per distinct commander, with fight counts', () => {
        render(<FightSliceTray onClose={() => {}} />);
        const select = screen.getByLabelText(/commander/i) as HTMLSelectElement;
        const options = Array.from(select.options).map((o) => o.textContent);
        expect(options).toEqual(['Commander', 'Axi Vale (2)', 'Zephyr Wind (1)', 'No commander (1)']);
    });

    it('includes only the picked commander fights and excludes the rest', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.change(screen.getByLabelText(/commander/i), { target: { value: 'Axi Vale' } });
        expect([...useStatsStore.getState().excludedFightKeys].sort()).toEqual(['b', 'd']);
    });

    it('replaces the previous pick rather than unioning with it', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.change(screen.getByLabelText(/commander/i), { target: { value: 'Axi Vale' } });
        fireEvent.change(screen.getByLabelText(/commander/i), { target: { value: 'Zephyr Wind' } });
        expect([...useStatsStore.getState().excludedFightKeys].sort()).toEqual(['a', 'c', 'd']);
    });

    it('slices to the untagged fights when No commander is picked', () => {
        render(<FightSliceTray onClose={() => {}} />);
        const select = screen.getByLabelText(/commander/i) as HTMLSelectElement;
        const untagged = Array.from(select.options).find((o) => o.textContent?.startsWith('No commander'));
        fireEvent.change(select, { target: { value: untagged!.value } });
        expect([...useStatsStore.getState().excludedFightKeys].sort()).toEqual(['a', 'b', 'c']);
    });

    it('only acts on fights currently passing the text filter', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: 'EBG' } });
        fireEvent.change(screen.getByLabelText(/commander/i), { target: { value: 'Axi Vale' } });
        // 'b' and 'd' are hidden by the text filter, so the pick must leave them
        // alone rather than silently excluding fights the user cannot see —
        // same scoping as All / None / Invert / Wins only.
        expect(useStatsStore.getState().excludedFightKeys.size).toBe(0);
    });

    it('names the commander on each fight card', () => {
        render(<FightSliceTray onClose={() => {}} />);
        const card = screen.getByLabelText('EBG: Klovan').closest('.slice-card');
        expect(card?.textContent).toContain('Axi Vale');
    });

    it('matches the commander name in the text filter box', () => {
        render(<FightSliceTray onClose={() => {}} />);
        fireEvent.change(screen.getByPlaceholderText(/filter/i), { target: { value: 'Zephyr' } });
        expect(screen.getByText('Red BL: Bravost')).toBeInTheDocument();
        expect(screen.queryByText('EBG: Klovan')).not.toBeInTheDocument();
    });

    it('hides the control when every fight had the same commander', () => {
        seed([commandedRoster[0]]);
        render(<FightSliceTray onClose={() => {}} />);
        expect(screen.queryByLabelText(/commander/i)).not.toBeInTheDocument();
    });

    it('hides the control for a roster that carries no commander at all', () => {
        // An older published sidecar predates the field, so every entry is
        // undefined. That is one bucket, not a filter — the control must not
        // appear offering "No commander" as the only choice.
        seed([
            { id: 'a', label: 'EBG: Klovan', timestamp: 1_000, duration: '2:41' },
            { id: 'b', label: 'Red BL: Bravost', timestamp: 2_000, duration: '1:20' },
        ]);
        render(<FightSliceTray onClose={() => {}} />);
        expect(screen.queryByLabelText(/commander/i)).not.toBeInTheDocument();
    });
});
