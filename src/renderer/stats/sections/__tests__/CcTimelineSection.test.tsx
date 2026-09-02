import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CcTimelineSection } from '../CcTimelineSection';

const fights = [{
    id: 'f1', bucketCount: 2, durationMs: 10_000, recorded: true,
    players: {
        a: { group: 1, displayName: 'Alice', cc: [5, 1], stripsOut: [0, 0], stripsIn: [0, 0] },
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

describe('CcTimelineSection', () => {
    it('reflects the cc lane in the grid', () => {
        render(<CcTimelineSection fights={fights as any} recorded selectedFightId="f1" />);
        expect(screen.getByTitle(/Alice — 0:00: 5/)).toBeTruthy();
        expect(screen.getByTitle(/Alice — 0:05: 1/)).toBeTruthy();
    });

    it('renders the not-recorded message when the resolved fight has no data, even if the dataset-wide flag is true', () => {
        const unrecordedFights = [{
            id: 'f1', bucketCount: 2, durationMs: 10_000, recorded: false,
            players: {
                a: { group: 1, displayName: 'Alice', cc: [0, 0], stripsOut: [0, 0], stripsIn: [0, 0] },
            },
        }];
        const { container } = render(
            <CcTimelineSection fights={unrecordedFights as any} recorded selectedFightId="f1" />,
        );
        expect(screen.getByText(/predates axilog 1.8.0/)).toBeTruthy();
        expect(container.querySelectorAll('[data-bucket-cell]')).toHaveLength(0);
    });

    it('renders no picker for a single-fight dataset', () => {
        render(<CcTimelineSection fights={fights as any} recorded selectedFightId={null} />);
        expect(screen.queryByRole('combobox')).toBeNull();
    });

    it("switches to the picked fight's data when the picker changes", () => {
        const multiFights = [
            {
                id: 'logs/fight-one.zevtc', bucketCount: 2, durationMs: 10_000, recorded: true,
                players: {
                    a: { group: 1, displayName: 'Alice', cc: [5, 1], stripsOut: [0, 0], stripsIn: [0, 0] },
                },
            },
            {
                id: 'logs/fight-two.zevtc', bucketCount: 2, durationMs: 20_000, recorded: true,
                players: {
                    a: { group: 1, displayName: 'Alice', cc: [8, 2], stripsOut: [0, 0], stripsIn: [0, 0] },
                },
            },
        ];
        render(<CcTimelineSection fights={multiFights as any} recorded selectedFightId={null} />);
        expect(screen.getByTitle(/Alice — 0:00: 5/)).toBeTruthy();
        const picker = screen.getByRole('combobox') as HTMLSelectElement;
        fireEvent.change(picker, { target: { value: 'logs/fight-two.zevtc' } });
        expect(screen.getByTitle(/Alice — 0:00: 8/)).toBeTruthy();
    });

    it('says why there is nothing to show when a trimmed report leaves no fights', () => {
        // `report.json`'s trim pass clears `fights` but leaves the
        // dataset-wide `recorded` flag true. Trusting that flag here drew an
        // empty header-only grid with no explanation.
        const { container } = render(<CcTimelineSection fights={[] as any} recorded selectedFightId={null} />);
        expect(screen.getByText(/predates axilog 1.8.0/)).toBeTruthy();
        expect(container.querySelectorAll('[data-bucket-cell]')).toHaveLength(0);
    });

    it('omits the picker from the header for a single-fight dataset, keeping the title', () => {
        const { container } = render(<CcTimelineSection fights={fights as any} recorded selectedFightId="f1" />);
        expect(container.querySelector('select')).toBeNull();
        expect(screen.getByRole('heading', { name: 'CC Timeline' })).toBeTruthy();
    });

    it('labels picker options the way every other fight picker in the app does', () => {
        const labelled = [
            { ...fights[0], id: 'logs/one.zevtc', label: 'Eternal: Bay (0:10)' },
            { ...fights[0], id: 'logs/two.zevtc', label: 'Red Borderlands (0:10)' },
        ];
        render(<CcTimelineSection fights={labelled as any} recorded selectedFightId={null} />);
        expect(screen.getByRole('option', { name: 'F1 - Eternal: Bay (0:10)' })).toBeTruthy();
        expect(screen.getByRole('option', { name: 'F2 - Red Borderlands (0:10)' })).toBeTruthy();
    });

    it('falls back to the log filename for a report.json written before fights carried a label', () => {
        const unlabelled = [
            { ...fights[0], id: 'logs/one.zevtc' },
            { ...fights[0], id: 'logs/two.zevtc' },
        ];
        render(<CcTimelineSection fights={unlabelled as any} recorded selectedFightId={null} />);
        expect(screen.getByRole('option', { name: 'F1 - one (0:10)' })).toBeTruthy();
    });

    it('opens itself by its taxonomy id when the expand control is clicked', () => {
        render(<CcTimelineSection fights={fights as any} recorded selectedFightId="f1" />);
        fireEvent.click(screen.getByRole('button', { name: 'Expand CC Timeline' }));
        // The id has to match statsTaxonomy.ts — the expand state is keyed on it,
        // and a mismatch expands nothing while dimming the whole page.
        expect(expandCalls).toEqual(['cc-timeline']);
    });

    it('renders as a modal pane offering a close control while expanded', () => {
        expandState.expandedSection = 'cc-timeline';
        const { container } = render(<CcTimelineSection fights={fights as any} recorded selectedFightId="f1" />);
        expect(container.firstElementChild?.className).toContain('modal-pane');
        expect(screen.getByRole('button', { name: 'Close CC Timeline' })).toBeTruthy();
    });
});
