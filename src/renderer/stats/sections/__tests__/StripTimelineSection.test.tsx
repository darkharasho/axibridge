import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StripTimelineSection } from '../StripTimelineSection';

const fights = [{
    id: 'f1', bucketCount: 2, durationMs: 10_000, recorded: true,
    players: {
        a: { group: 1, displayName: 'Alice', cc: [0, 0], stripsOut: [3, 0], stripsIn: [0, 7] },
    },
}];

// The expand control reads the shared stats context, which throws without a
// provider. Mocking it keeps these tests rendering the section bare, and the
// mutable `expandState` lets a test render the expanded variant.
const expandState: { expandedSection: string | null } = { expandedSection: null };
const expandCalls: string[] = [];
const closeCalls: string[] = [];
vi.mock('../../StatsViewContext', () => ({
    useStatsSharedContext: () => ({
        expandedSection: expandState.expandedSection,
        expandedSectionClosing: false,
        openExpandedSection: (id: string) => { expandCalls.push(id); },
        closeExpandedSection: () => { closeCalls.push('close'); },
    }),
}));

beforeEach(() => {
    expandState.expandedSection = null;
    expandCalls.length = 0;
    closeCalls.length = 0;
});

describe('StripTimelineSection', () => {
    it('shows outgoing strips by default', () => {
        render(<StripTimelineSection fights={fights as any} recorded selectedFightId="f1" />);
        expect(screen.getByTitle(/Alice — 0:00: 3/)).toBeTruthy();
    });

    it('switches to incoming strips when toggled', () => {
        render(<StripTimelineSection fights={fights as any} recorded selectedFightId="f1" />);
        fireEvent.click(screen.getByRole('button', { name: /incoming/i }));
        expect(screen.getByTitle(/Alice — 0:05: 7/)).toBeTruthy();
    });

    it('renders the not-recorded message when the resolved fight has no data, even if the dataset-wide flag is true', () => {
        const unrecordedFights = [{
            id: 'f1', bucketCount: 2, durationMs: 10_000, recorded: false,
            players: {
                a: { group: 1, displayName: 'Alice', cc: [0, 0], stripsOut: [0, 0], stripsIn: [0, 0] },
            },
        }];
        const { container } = render(
            <StripTimelineSection fights={unrecordedFights as any} recorded selectedFightId="f1" />,
        );
        expect(screen.getByText(/predates axilog 1.8.0/)).toBeTruthy();
        expect(container.querySelectorAll('[data-bucket-cell]')).toHaveLength(0);
    });

    it('renders no picker for a single-fight dataset', () => {
        render(<StripTimelineSection fights={fights as any} recorded selectedFightId={null} />);
        expect(screen.queryByRole('combobox')).toBeNull();
    });

    it('switches to the picked fight\'s data when the picker changes', () => {
        const multiFights = [
            {
                id: 'logs/fight-one.zevtc', bucketCount: 2, durationMs: 10_000, recorded: true,
                players: {
                    a: { group: 1, displayName: 'Alice', cc: [0, 0], stripsOut: [3, 0], stripsIn: [0, 7] },
                },
            },
            {
                id: 'logs/fight-two.zevtc', bucketCount: 2, durationMs: 20_000, recorded: true,
                players: {
                    a: { group: 1, displayName: 'Alice', cc: [0, 0], stripsOut: [9, 0], stripsIn: [0, 11] },
                },
            },
        ];
        render(<StripTimelineSection fights={multiFights as any} recorded selectedFightId={null} />);
        expect(screen.getByTitle(/Alice — 0:00: 3/)).toBeTruthy();
        const picker = screen.getByRole('combobox') as HTMLSelectElement;
        fireEvent.change(picker, { target: { value: 'logs/fight-two.zevtc' } });
        expect(screen.getByTitle(/Alice — 0:00: 9/)).toBeTruthy();
    });

    it('says why there is nothing to show when a trimmed report leaves no fights', () => {
        const { container } = render(<StripTimelineSection fights={[] as any} recorded selectedFightId={null} />);
        expect(screen.getByText(/predates axilog 1.8.0/)).toBeTruthy();
        expect(container.querySelectorAll('[data-bucket-cell]')).toHaveLength(0);
    });

    it('opens itself by its taxonomy id when the expand control is clicked', () => {
        render(<StripTimelineSection fights={fights as any} recorded selectedFightId="f1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Expand Strip Timeline' }));
        // The id has to match statsTaxonomy.ts — the expand state is keyed on it,
        // and a mismatch expands nothing while dimming the whole page.
        expect(expandCalls).toEqual(['strip-timeline']);
    });

    it('renders as a modal pane offering a close control while expanded', () => {
        expandState.expandedSection = 'strip-timeline';
        const { container } = render(<StripTimelineSection fights={fights as any} recorded selectedFightId="f1" />);
        expect(container.firstElementChild?.className).toContain('modal-pane');
        expect(screen.getByRole('button', { name: 'Close Strip Timeline' })).toBeTruthy();
    });
});
