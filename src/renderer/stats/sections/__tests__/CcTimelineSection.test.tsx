import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CcTimelineSection } from '../CcTimelineSection';

const fights = [{
    id: 'f1', bucketCount: 2, durationMs: 10_000, recorded: true,
    players: {
        a: { group: 1, displayName: 'Alice', cc: [5, 1], stripsOut: [0, 0], stripsIn: [0, 0] },
    },
}];

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
        expect(screen.getByText(/Per-player CC timelines need Raw timeline arrays enabled/)).toBeTruthy();
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
});
